"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { criarClienteNavegador } from "@/lib/supabase/navegador";

export default function PaginaLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setCarregando(true);

    const supabase = criarClienteNavegador();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (error) {
      setErro("E-mail ou senha invalidos.");
      setCarregando(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <form
        onSubmit={entrar}
        style={{
          width: 320,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          padding: 32,
          border: "1px solid #e0e0e0",
          borderRadius: 8,
          background: "#fff",
        }}
      >
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Solara OS</h1>

        <label style={{ fontSize: 13 }}>
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={campo}
          />
        </label>

        <label style={{ fontSize: 13 }}>
          Senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            autoComplete="current-password"
            style={campo}
          />
        </label>

        {erro && (
          <p style={{ color: "#c0392b", fontSize: 13 }}>{erro}</p>
        )}

        <button type="submit" disabled={carregando} style={botao}>
          {carregando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}

const campo: React.CSSProperties = {
  width: "100%",
  marginTop: 4,
  padding: "8px 10px",
  border: "1px solid #ccc",
  borderRadius: 6,
};

const botao: React.CSSProperties = {
  marginTop: 8,
  padding: "10px 12px",
  border: "none",
  borderRadius: 6,
  background: "#1a1a1a",
  color: "#fff",
  cursor: "pointer",
};
