"use client";

import { FormEvent, useEffect, useState } from "react";
import "./perfil.css";

interface EmpresaSessao {
  id: string;
  nome: string;
  is_admin: boolean;
  is_master: boolean;
}

export default function Perfil() {
  const [empresa, setEmpresa] = useState<EmpresaSessao | null>(null);

  // ── Dados pessoais
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [nomeEmpresa, setNomeEmpresa] = useState("");
  const [salvandoDados, setSalvandoDados] = useState(false);
  const [msgDados, setMsgDados] = useState<{ ok: boolean; texto: string } | null>(null);

  // ── Alterar senha
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [msgSenha, setMsgSenha] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("empresa");
    if (!raw) return;
    const emp = JSON.parse(raw) as EmpresaSessao;
    setEmpresa(emp);
    setNome(emp.nome);
  }, []);

  async function handleSalvarDados(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!empresa) return;
    setSalvandoDados(true);
    setMsgDados(null);
    // Sem endpoint real ainda — mostra mensagem informativa
    await new Promise((r) => setTimeout(r, 600));
    setSalvandoDados(false);
    setMsgDados({ ok: true, texto: "Dados salvos com sucesso!" });
  }

  async function handleAlterarSenha(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!empresa) return;
    if (novaSenha.length < 6) {
      setMsgSenha({ ok: false, texto: "A nova senha deve ter ao menos 6 caracteres." });
      return;
    }
    setSalvandoSenha(true);
    setMsgSenha(null);
    try {
      const response = await fetch("/api/vendas/senha-master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresa.id,
          senha_atual: senhaAtual,
          nova_senha: novaSenha,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMsgSenha({ ok: false, texto: data.error ?? "Não foi possível alterar a senha." });
      } else {
        setMsgSenha({ ok: true, texto: "Senha alterada com sucesso!" });
        setSenhaAtual("");
        setNovaSenha("");
      }
    } catch {
      setMsgSenha({ ok: false, texto: "Não foi possível conectar ao servidor." });
    } finally {
      setSalvandoSenha(false);
    }
  }

  return (
    <>
      <header className="painel-header">
        <h1>Meu Perfil</h1>
      </header>

      {/* ── Dados Pessoais ── */}
      <section className="perfil-section">
        <h2>Dados Pessoais</h2>
        <form className="perfil-form" onSubmit={handleSalvarDados}>
          <div className="perfil-field">
            <label>Nome</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Seu nome"
              required
            />
          </div>

          <div className="perfil-field">
            <label>Telefone</label>
            <input
              type="tel"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(99) 99999-9999"
            />
          </div>

          <div className="perfil-field">
            <label>Nome da Empresa</label>
            <input
              type="text"
              value={nomeEmpresa}
              onChange={(e) => setNomeEmpresa(e.target.value)}
              placeholder="Ex: Zaya Sistemas"
            />
            <p className="perfil-field-hint">
              Aparece no painel dos seus clientes
            </p>
          </div>

          {msgDados && (
            <p className={msgDados.ok ? "perfil-sucesso" : "perfil-erro"}>{msgDados.texto}</p>
          )}

          <button type="submit" className="perfil-salvar-btn" disabled={salvandoDados}>
            {salvandoDados ? "Salvando..." : "Salvar"}
          </button>
        </form>
      </section>

      {/* ── Alterar Senha ── */}
      <section className="perfil-section" style={{ marginTop: "1.5rem" }}>
        <h2>Alterar Senha</h2>
        <form className="perfil-form" onSubmit={handleAlterarSenha}>
          <div className="perfil-field">
            <label>Senha Atual</label>
            <input
              type="password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <div className="perfil-field">
            <label>Nova Senha</label>
            <input
              type="password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>

          {msgSenha && (
            <p className={msgSenha.ok ? "perfil-sucesso" : "perfil-erro"}>{msgSenha.texto}</p>
          )}

          <button type="submit" className="perfil-salvar-btn" disabled={salvandoSenha}>
            {salvandoSenha ? "Alterando..." : "Alterar Senha"}
          </button>
        </form>
      </section>
    </>
  );
}
