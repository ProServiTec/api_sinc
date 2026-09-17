"use client";

import { SubmitEvent, useEffect, useState } from "react";
import "../../painel/clients/clients.css";
import "../master.css";

interface EmpresaSessao {
  id: string;
  nome: string;
  is_admin: boolean;
  is_master: boolean;
}

export default function MasterConfiguracoes() {
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [chavePix, setChavePix] = useState("");
  const [infinitepayHandle, setInfinitepayHandle] = useState("");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  useEffect(() => {
    Promise.resolve().then(async () => {
      const raw = sessionStorage.getItem("empresa");
      const empresa = raw ? (JSON.parse(raw) as EmpresaSessao) : null;
      if (!empresa) {
        setLoading(false);
        return;
      }
      setEmpresaId(empresa.id);

      try {
        const response = await fetch(`/api/master/config?empresa_id=${encodeURIComponent(empresa.id)}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Não foi possível carregar as configurações");
        }
        setChavePix(data.chave_pix ?? "");
        setInfinitepayHandle(data.infinitepay_handle ?? "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível carregar as configurações");
      } finally {
        setLoading(false);
      }
    });
  }, []);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!empresaId) return;

    setSalvando(true);
    setError(null);
    setSucesso(false);

    try {
      const response = await fetch("/api/master/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaId,
          chave_pix: chavePix,
          infinitepay_handle: infinitepayHandle,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Não foi possível salvar as configurações");
        return;
      }

      setSucesso(true);
    } catch {
      setError("Não foi possível conectar ao servidor");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <header className="painel-header">
        <h1>Configurações</h1>
        <p>Chave PIX usada pelos parceiros para pagar as licenças</p>
      </header>

      {loading && <p className="painel-loading">Carregando...</p>}

      {!loading && (
        <section className="master-secao">
          <h2>Recebimento PIX (InfinitePay)</h2>
          <form className="master-config-form" onSubmit={handleSubmit}>
            <label className="clients-field">
              Chave PIX
              <input
                type="text"
                value={chavePix}
                onChange={(e) => setChavePix(e.target.value)}
                placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
                required
              />
            </label>

            <label className="clients-field">
              InfiniteTag (handle da InfinitePay)
              <input
                type="text"
                value={infinitepayHandle}
                onChange={(e) => setInfinitepayHandle(e.target.value)}
                placeholder="seu-handle (sem o $ do início)"
              />
            </label>
            <p className="painel-card-hint">
              É o nome de usuário da conta InfinitePay que vai <strong>receber</strong> os pagamentos das
              licenças compradas pelos revendedores. Antes de usar, habilite o &quot;Checkout Externo&quot;
              em <code>app.infinitepay.io</code> (Configurações → Checkout Externo) — sem isso a InfinitePay
              recusa a criação de links de pagamento pra essa conta.
            </p>

            {error && <p className="clients-error">{error}</p>}
            {sucesso && <p className="master-config-sucesso">Configurações salvas com sucesso.</p>}

            <button type="submit" className="clients-cadastrar-btn master-config-salvar" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </form>
        </section>
      )}
    </>
  );
}
