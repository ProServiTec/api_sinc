"use client";

import { SubmitEvent, useState } from "react";
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

export default function Login() {
  const router = useRouter();
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        body: JSON.stringify({
          cpf_cnpj: cpfCnpj,
          senha,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Não foi possível efetuar o login");
        return;
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
              <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
                <text x="2" y="20" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="18" fill="white">Z</text>
                <text x="17" y="12" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="11" fill="#2196F3">+</text>
              </svg>
            </div>
            <div className="login-logo-text">
              <strong>Zaya Sistemas</strong>
              <span>Portal do Cliente</span>
            </div>
          </div>

          <h1>Entrar</h1>
          <p className="login-subtitle">Acesse com os dados da sua empresa</p>

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
