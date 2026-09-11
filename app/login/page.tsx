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
  created_at: string;
  updated_at: string;
}

export default function Login() {
  const router = useRouter();
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      sessionStorage.setItem("empresa", JSON.stringify(empresa));
      if (empresa.is_master) {
        router.push("/master");
      } else if (empresa.is_admin) {
        router.push("/painel");
      } else {
        router.push("/vendas");
      }
    } catch {
      setError("Não foi possível conectar ao servidor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-container">
      <div className="login-content">
        <form className="login-form" onSubmit={handleSubmit}>
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
