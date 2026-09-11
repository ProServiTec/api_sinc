import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";
import { decryptToken } from "@/lib/clientsLink";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  try {
    const cpfCnpj = decryptToken(token);
    if (!cpfCnpj) {
      throw new SyncValidationError("Link inválido");
    }

    const { rows: clienteRows } = await pool.query(
      `SELECT id, nome, razao_social, cpf_cnpj, ativo, created_at
       FROM core.empresas
       WHERE cpf_cnpj = $1 AND is_admin = false
       LIMIT 1`,
      [cpfCnpj]
    );

    if (clienteRows.length === 0) {
      return new Response(JSON.stringify({ error: "Cliente não encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const cliente = clienteRows[0];

    const [filiaisResult, dispositivosResult, licencasPlanoResult] = await Promise.all([
      pool.query(
        `SELECT id, nome, cpf_cnpj, cidade, uf, ativo, created_at
         FROM core.filiais
         WHERE empresa_id = $1
         ORDER BY created_at DESC`,
        [cliente.id]
      ),
      pool.query(
        `SELECT id, filial_id, nome, codigo_dispositivo, ativo, ultimo_sync_at
         FROM core.dispositivos
         WHERE empresa_id = $1
         ORDER BY ultimo_sync_at DESC NULLS LAST`,
        [cliente.id]
      ),
      pool.query(
        `SELECT la.id, la.licenca_id, l.nome AS licenca_nome, l.valor, l.periodicidade, l.dia_fechamento,
                la.ativo, la.created_at
         FROM core.licencas_atribuidas la
         JOIN core.licencas l ON l.id = la.licenca_id
         WHERE la.empresa_id = $1
         ORDER BY la.created_at DESC`,
        [cliente.id]
      ),
    ]);

    const dispositivosPorFilial = new Map<string, typeof dispositivosResult.rows>();
    for (const d of dispositivosResult.rows) {
      if (!d.filial_id) continue;
      const lista = dispositivosPorFilial.get(d.filial_id) ?? [];
      lista.push(d);
      dispositivosPorFilial.set(d.filial_id, lista);
    }

    const licencas = filiaisResult.rows.map((f) => ({
      ...f,
      dispositivos: dispositivosPorFilial.get(f.id) ?? [],
    }));

    return new Response(
      JSON.stringify({
        cliente,
        licencas_ativas: licencas.filter((l) => l.ativo).length,
        maquinas: dispositivosResult.rows.length,
        licencas,
        licencas_plano: licencasPlanoResult.rows,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    const classified = classifyError(error);
    return new Response(JSON.stringify(classified), {
      status: classified.status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
