"use client";

import { SubmitEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "./login.css";

interface Empresa {
  id: string;
  nome: string;
  razao_social: string | null;
  cpf_cnpj: string | null;
  ativo: boolean;
  is_admin: boolean;
  is_master: boolean;
  senha_temporaria?: boolean;
  created_at: string;
  updated_at: string;
}

interface UsuarioSubconta {
  id: string;
  nome: string;
  acesso_total: boolean;
  filiais: string[];
  permissoes: {
    ver_dashboards: boolean;
    ver_relatorios: boolean;
    lancar_financeiro: boolean;
    editar_excluir: boolean;
  };
}

const CHAVE_LEMBRAR = "sinc_login_lembrar";

export default function Login() {
  const router = useRouter();
  const [modoLogin, setModoLogin] = useState<"cpf_cnpj" | "email">("cpf_cnpj");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [lembrar, setLembrar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carrega o identificador lembrado (nunca a senha) — só depois de montar,
  // pra não dar hydration mismatch entre servidor e cliente.
  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE_LEMBRAR);
      if (!salvo) return;
      const dados = JSON.parse(salvo) as { modo: "cpf_cnpj" | "email"; valor: string };
      setModoLogin(dados.modo);
      if (dados.modo === "email") setEmail(dados.valor);
      else setCpfCnpj(dados.valor);
      setLembrar(true);
    } catch {
      // localStorage indisponível ou dado corrompido — ignora, login fica em branco.
    }
  }, []);

  // Só aparece quando o Master loga com a senha temporária gerada
  // automaticamente na criação do cliente (ver POST /api/empresas).
  const [empresaPendente, setEmpresaPendente] = useState<Empresa | null>(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [trocandoSenha, setTrocandoSenha] = useState(false);

  function entrar(empresa: Empresa, usuario: UsuarioSubconta | null) {
    sessionStorage.setItem("empresa", JSON.stringify(empresa));
    sessionStorage.setItem("usuario", usuario ? JSON.stringify(usuario) : "");
    if (usuario) {
      router.push("/vendas");
    } else if (empresa.is_master) {
      router.push("/master");
    } else if (empresa.is_admin) {
      router.push("/painel");
    } else {
      router.push("/vendas");
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          modoLogin === "email" ? { email, senha } : { cpf_cnpj: cpfCnpj, senha }
        ),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Não foi possível efetuar o login");
        return;
      }

      // Lembra só o identificador (CPF/CNPJ ou e-mail) — nunca a senha.
      try {
        if (lembrar) {
          localStorage.setItem(
            CHAVE_LEMBRAR,
            JSON.stringify({ modo: modoLogin, valor: modoLogin === "email" ? email : cpfCnpj })
          );
        } else {
          localStorage.removeItem(CHAVE_LEMBRAR);
        }
      } catch {
        // localStorage indisponível — não bloqueia o login.
      }

      const empresa = data.empresa as Empresa;
      const usuario = (data.usuario ?? null) as UsuarioSubconta | null;

      // Login do Master com a senha gerada automaticamente: pergunta antes de
      // entrar se ele quer mantê-la ou trocar por uma de sua escolha.
      if (!usuario && empresa.senha_temporaria) {
        setEmpresaPendente(empresa);
        return;
      }

      entrar(empresa, usuario);
    } catch {
      setError("Não foi possível conectar ao servidor");
    } finally {
      setLoading(false);
    }
  }

  async function confirmarSenha(manterAtual: boolean) {
    if (!empresaPendente) return;
    setTrocandoSenha(true);
    setError(null);

    try {
      const response = await fetch("/api/vendas/senha-master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaPendente.id,
          nova_senha: manterAtual ? undefined : novaSenha,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Não foi possível confirmar a senha");
        return;
      }

      entrar({ ...empresaPendente, senha_temporaria: false }, null);
    } catch {
      setError("Não foi possível conectar ao servidor");
    } finally {
      setTrocandoSenha(false);
    }
  }

  if (empresaPendente) {
    return (
      <div className="login-container">
        <div className="login-content">
          <div className="login-form">
            <h1>Primeiro acesso</h1>
            <p className="login-subtitle">
              Sua senha foi gerada automaticamente. Você pode continuar usando ela ou trocar agora
              por uma de sua escolha.
            </p>

            <label className="login-field">
              Nova senha (opcional)
              <input
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Deixe em branco para manter a senha atual"
                autoComplete="new-password"
                minLength={6}
              />
            </label>

            {error && <p className="login-error">{error}</p>}

            <button type="button" disabled={trocandoSenha} onClick={() => confirmarSenha(false)}>
              {trocandoSenha ? "Salvando..." : "Salvar nova senha e entrar"}
            </button>
            <button
              type="button"
              disabled={trocandoSenha}
              onClick={() => confirmarSenha(true)}
              style={{ marginTop: 8, background: "transparent" }}
            >
              Continuar com a senha atual
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-content">
        <form className="login-form" onSubmit={handleSubmit}>
          {/* Logo Zaya Sistemas */}
          <div className="login-logo">
            <div className="login-logo-icon">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-zaya.png" alt="Zaya Sistemas" className="login-logo-img" />
            </div>
            <div className="login-logo-text">
              <strong>Zaya Sistemas</strong>
              <span>Portal do Cliente</span>
            </div>
          </div>

          <h1>Entrar</h1>
          <p className="login-subtitle">Acesse com os dados da sua empresa</p>

          <div className="login-modo-toggle" role="radiogroup" aria-label="Entrar com">
            <button
              type="button"
              className={modoLogin === "cpf_cnpj" ? "login-modo-ativo" : ""}
              aria-pressed={modoLogin === "cpf_cnpj"}
              onClick={() => setModoLogin("cpf_cnpj")}
            >
              CPF/CNPJ
            </button>
            <button
              type="button"
              className={modoLogin === "email" ? "login-modo-ativo" : ""}
              aria-pressed={modoLogin === "email"}
              onClick={() => setModoLogin("email")}
            >
              E-mail
            </button>
          </div>

          {modoLogin === "cpf_cnpj" ? (
            <label className="login-field">
              CPF/CNPJ
              <input
                type="text"
                value={cpfCnpj}
                onChange={(e) => setCpfCnpj(e.target.value)}
                placeholder="CPF ou CNPJ da empresa"
                inputMode="numeric"
                autoComplete="off"
                required
              />
            </label>
          ) : (
            <label className="login-field">
              E-mail
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                autoComplete="username"
                required
              />
            </label>
          )}

          <label className="login-field">
            Senha
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Sua senha"
              autoComplete="current-password"
              required
            />
          </label>

          <label className="login-lembrar">
            <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} />
            Lembrar meus dados de acesso
          </label>

          <button type="submit" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>

          {error && <p className="login-error">{error}</p>}
        </form>

        {/* Espaço reservado para uma imagem/ilustração */}
        <div className="login-image" aria-hidden="true" />
      </div>
    </div>
  );
}
