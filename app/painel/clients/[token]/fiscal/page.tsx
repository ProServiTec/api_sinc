"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import "../../clients.css";
import FiscalRelatorio, {
  competenciaMesAnterior,
  rotuloCompetencia,
  type Relatorio,
} from "../../../../components/FiscalRelatorio";

interface EmpresaSessao {
  id: string;
  nome: string;
}

interface RespostaFiscal {
  empresa: { id: string; nome: string };
  competenciasDisponiveis: string[];
  relatorio: Relatorio;
}

function lerSessao(): EmpresaSessao | null {
  try {
    const raw = sessionStorage.getItem("empresa");
    return raw ? (JSON.parse(raw) as EmpresaSessao) : null;
  } catch {
    return null;
  }
}

export default function RelatorioFiscalPage() {
  const params = useParams<{ token: string }>();
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [empresaNome, setEmpresaNome] = useState<string>("");
  const [competencia, setCompetencia] = useState<string>(competenciaMesAnterior());
  const [competencias, setCompetencias] = useState<string[]>([]);
  const [dados, setDados] = useState<Relatorio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [reprocessando, setReprocessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [linkContador, setLinkContador] = useState<string>("");
  const [gerandoLink, setGerandoLink] = useState(false);
  // Configuração do contador / envio
  const [contadorEmail, setContadorEmail] = useState("");
  const [contadorNome, setContadorNome] = useState("");
  const [envioAuto, setEnvioAuto] = useState(false);
  const [diaEnvio, setDiaEnvio] = useState(5);
  const [smtpOk, setSmtpOk] = useState(true);
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [msgEnvio, setMsgEnvio] = useState<string | null>(null);

  // Resolve o empresa_id (uuid da loja) a partir do token do cliente.
  useEffect(() => {
    let ativo = true;
    const empresa = lerSessao();
    if (!empresa) return;
    fetch(
      `/api/painel/clientes/${encodeURIComponent(params.token)}?revenda_id=${encodeURIComponent(empresa.id)}`
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Cliente não encontrado"))))
      .then((d) => {
        if (!ativo) return;
        setEmpresaId(d.cliente.id);
        setEmpresaNome(d.cliente.nome);
      })
      .catch((e) => {
        if (ativo) setErro(e.message);
      });
    return () => {
      ativo = false;
    };
  }, [params.token]);

  const carregar = useCallback(
    async (comp: string) => {
      if (!empresaId) return;
      const revenda = lerSessao()?.id ?? "";
      setCarregando(true);
      setErro(null);
      try {
        const r = await fetch(
          `/api/painel/fiscal?empresa_id=${encodeURIComponent(empresaId)}` +
            `&competencia=${comp}&revenda_id=${encodeURIComponent(revenda)}`
        );
        const data = (await r.json()) as RespostaFiscal | { error: string };
        if (!r.ok || "error" in data) {
          throw new Error(("error" in data && data.error) || "Falha ao carregar relatório");
        }
        setDados(data.relatorio);
        setCompetencias(data.competenciasDisponiveis);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro desconhecido");
        setDados(null);
      } finally {
        setCarregando(false);
      }
    },
    [empresaId]
  );

  useEffect(() => {
    if (!empresaId) return;
    const t = setTimeout(() => carregar(competencia), 0);
    return () => clearTimeout(t);
  }, [empresaId, competencia, carregar]);

  // Carrega a configuração do contador uma vez que a empresa é conhecida.
  useEffect(() => {
    if (!empresaId) return;
    const t = setTimeout(async () => {
      const revenda = lerSessao()?.id ?? "";
      try {
        const r = await fetch(
          `/api/painel/fiscal/config?empresa_id=${encodeURIComponent(empresaId)}&revenda_id=${encodeURIComponent(revenda)}`
        );
        if (!r.ok) return;
        const d = await r.json();
        setContadorEmail(d.config.contador_email ?? "");
        setContadorNome(d.config.contador_nome ?? "");
        setEnvioAuto(!!d.config.envio_automatico);
        setDiaEnvio(d.config.dia_envio ?? 5);
        setSmtpOk(!!d.smtpConfigurado);
      } catch {
        /* silencioso: config é opcional */
      }
    }, 0);
    return () => clearTimeout(t);
  }, [empresaId]);

  async function reprocessar() {
    if (!empresaId) return;
    setReprocessando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/painel/fiscal/reprocessar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id: empresaId, competencia }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Falha ao reprocessar");
      setDados(data.relatorio);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao reprocessar");
    } finally {
      setReprocessando(false);
    }
  }

  async function gerarLinkContador() {
    if (!empresaId) return;
    setGerandoLink(true);
    setErro(null);
    try {
      const revenda = lerSessao()?.id ?? "";
      const r = await fetch(`/api/painel/fiscal/link-contador`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id: empresaId, revenda_id: revenda }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Falha ao gerar link");
      setLinkContador(new URL(data.url, window.location.origin).toString());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar link");
    } finally {
      setGerandoLink(false);
    }
  }

  async function salvarConfig() {
    if (!empresaId) return;
    setSalvandoConfig(true);
    setMsgEnvio(null);
    setErro(null);
    try {
      const revenda = lerSessao()?.id ?? "";
      const r = await fetch(`/api/painel/fiscal/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaId,
          revenda_id: revenda,
          contador_email: contadorEmail,
          contador_nome: contadorNome,
          envio_automatico: envioAuto,
          dia_envio: diaEnvio,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao salvar configuração");
      setMsgEnvio("Configuração salva.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSalvandoConfig(false);
    }
  }

  async function enviarContador() {
    if (!empresaId) return;
    setEnviando(true);
    setMsgEnvio(null);
    setErro(null);
    try {
      const revenda = lerSessao()?.id ?? "";
      const r = await fetch(`/api/painel/fiscal/enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id: empresaId, revenda_id: revenda, competencia }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha no envio");
      setMsgEnvio(`Pacote enviado para ${d.destino} (${d.totalXmls} XML).`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao enviar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fiscal-page">
      <Link href={`/painel/clients/${params.token}`} className="clients-voltar">
        ← Voltar para o cliente
      </Link>

      <header className="fiscal-header">
        <div>
          <h1>Relatórios Fiscais</h1>
          <p className="fiscal-sub">{empresaNome}</p>
        </div>
        <div className="fiscal-controles">
          <label className="fiscal-mes">
            Competência
            <input
              type="month"
              value={competencia}
              max={competenciaMesAnterior()}
              onChange={(e) => e.target.value && setCompetencia(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="fiscal-btn fiscal-btn-secundario"
            onClick={reprocessar}
            disabled={reprocessando || !empresaId}
          >
            {reprocessando ? "Reprocessando..." : "Reprocessar"}
          </button>
          <button
            type="button"
            className="fiscal-btn"
            onClick={gerarLinkContador}
            disabled={gerandoLink || !empresaId}
          >
            {gerandoLink ? "Gerando..." : "Link do contador"}
          </button>
        </div>
      </header>

      {linkContador && (
        <div className="fiscal-link-box">
          <input readOnly value={linkContador} onFocus={(e) => e.currentTarget.select()} />
          <button
            type="button"
            className="fiscal-btn fiscal-btn-secundario"
            onClick={() => navigator.clipboard?.writeText(linkContador)}
          >
            Copiar
          </button>
        </div>
      )}

      <section className="fiscal-bloco fiscal-config">
        <h2>Contador / envio</h2>
        {!smtpOk && (
          <p className="fiscal-config-aviso">
            Envio de e-mail ainda não configurado no servidor (SMTP). Você pode salvar o e-mail do
            contador, mas o envio só funcionará após configurar o SMTP.
          </p>
        )}
        <div className="fiscal-config-grid">
          <label className="fiscal-mes">
            E-mail do contador
            <input
              type="email"
              value={contadorEmail}
              onChange={(e) => setContadorEmail(e.target.value)}
              placeholder="contador@escritorio.com.br"
            />
          </label>
          <label className="fiscal-mes">
            Nome (opcional)
            <input
              type="text"
              value={contadorNome}
              onChange={(e) => setContadorNome(e.target.value)}
              placeholder="Escritório contábil"
            />
          </label>
          <label className="fiscal-mes">
            Dia do envio automático
            <input
              type="number"
              min={1}
              max={28}
              value={diaEnvio}
              onChange={(e) => setDiaEnvio(Number(e.target.value))}
            />
          </label>
          <label className="fiscal-check">
            <input
              type="checkbox"
              checked={envioAuto}
              onChange={(e) => setEnvioAuto(e.target.checked)}
            />
            Enviar automaticamente todo mês
          </label>
        </div>
        <div className="fiscal-config-acoes">
          <button
            type="button"
            className="fiscal-btn fiscal-btn-secundario"
            onClick={salvarConfig}
            disabled={salvandoConfig || !empresaId}
          >
            {salvandoConfig ? "Salvando..." : "Salvar configuração"}
          </button>
          <button
            type="button"
            className="fiscal-btn"
            onClick={enviarContador}
            disabled={enviando || !empresaId}
          >
            {enviando ? "Enviando..." : `Enviar ${rotuloCompetencia(competencia)} ao contador`}
          </button>
        </div>
        {msgEnvio && <p className="fiscal-config-ok">{msgEnvio}</p>}
      </section>

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
