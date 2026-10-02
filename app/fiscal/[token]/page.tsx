"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import FiscalRelatorio, {
  competenciaMesAnterior,
  rotuloCompetencia,
  type Relatorio,
} from "../../components/FiscalRelatorio";

interface RespostaFiscal {
  empresa: { nome: string };
  competenciasDisponiveis: string[];
  relatorio: Relatorio;
}

export default function ContadorFiscalPage() {
  const params = useParams<{ token: string }>();
  const [empresaNome, setEmpresaNome] = useState<string>("");
  const [competencia, setCompetencia] = useState<string>(competenciaMesAnterior());
  const [competencias, setCompetencias] = useState<string[]>([]);
  const [dados, setDados] = useState<Relatorio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(
    async (comp: string) => {
      setCarregando(true);
      setErro(null);
      try {
        const r = await fetch(
          `/api/fiscal/${encodeURIComponent(params.token)}?competencia=${comp}`
        );
        const data = (await r.json()) as RespostaFiscal | { error: string };
        if (!r.ok || "error" in data) {
          throw new Error(("error" in data && data.error) || "Falha ao carregar relatório");
        }
        setEmpresaNome(data.empresa.nome);
        setDados(data.relatorio);
        setCompetencias(data.competenciasDisponiveis);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro desconhecido");
        setDados(null);
      } finally {
        setCarregando(false);
      }
    },
    [params.token]
  );

  useEffect(() => {
    const t = setTimeout(() => carregar(competencia), 0);
    return () => clearTimeout(t);
  }, [competencia, carregar]);

  return (
    <div className="fiscal-page">
      <header className="fiscal-header">
        <div>
          <h1>Relatórios Fiscais</h1>
          <p className="fiscal-sub">{empresaNome || "Acesso do contador"}</p>
        </div>
        <label className="fiscal-mes">
          Competência
          <input
            type="month"
            value={competencia}
            max={competenciaMesAnterior()}
            onChange={(e) => e.target.value && setCompetencia(e.target.value)}
          />
        </label>
      </header>

      {competencias.length > 0 && (
        <div className="fiscal-chips">
          {competencias.map((c) => (
            <button
              key={c}
              type="button"
              className={`fiscal-chip${c === competencia ? " fiscal-chip-ativo" : ""}`}
              onClick={() => setCompetencia(c)}
            >
              {rotuloCompetencia(c)}
            </button>
          ))}
        </div>
      )}

      {erro && <p className="fiscal-erro">{erro}</p>}

      {carregando ? (
        <p className="fiscal-loading">Carregando relatório...</p>
      ) : dados ? (
        <FiscalRelatorio data={dados} />
      ) : null}
    </div>
  );
}
