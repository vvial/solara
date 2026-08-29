"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const AREAS = ["vendas", "financeiro"] as const;

export default function FormularioUsuario() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [papel, setPapel] = useState("operador");
  const [areas, setAreas] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [enviando, setEnviando] = useState(false);

  function alternarArea(area: string) {
    setAreas((atual) =>
      atual.includes(area)
        ? atual.filter((a) => a !== area)
        : [...atual, area],
    );
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setOk(false);
    setEnviando(true);

    const resposta = await fetch("/api/admin/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha, nome, papel, areas }),
    });
    const dados = await resposta.json();
    setEnviando(false);

    if (!resposta.ok) {
      setErro(dados.erro ?? "Falha ao criar usuario.");
      return;
    }

    setOk(true);
    setEmail("");
    setSenha("");
    setNome("");
    setPapel("operador");
    setAreas([]);
    router.refresh();
  }

  return (
    <form
      onSubmit={enviar}
      style={{
        marginTop: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: 360,
      }}
    >
      <input
        placeholder="E-mail"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        style={campo}
      />
      <input
        placeholder="Senha inicial (min. 6)"
        type="text"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        required
        minLength={6}
        style={campo}
      />
      <input
        placeholder="Nome"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        required
        style={campo}
      />
      <label style={{ fontSize: 13 }}>
        Papel
        <select
          value={papel}
          onChange={(e) => setPapel(e.target.value)}
          style={campo}
        >
          <option value="operador">operador</option>
          <option value="admin">admin</option>
        </select>
      </label>
      <fieldset style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10 }}>
        <legend style={{ fontSize: 13 }}>Areas</legend>
        {AREAS.map((area) => (
          <label key={area} style={{ display: "block", fontSize: 14 }}>
            <input
              type="checkbox"
              checked={areas.includes(area)}
              onChange={() => alternarArea(area)}
            />{" "}
            {area}
          </label>
        ))}
      </fieldset>

      {erro && <p style={{ color: "#c0392b", fontSize: 13 }}>{erro}</p>}
      {ok && <p style={{ color: "#1a7f37", fontSize: 13 }}>Usuario criado.</p>}

      <button type="submit" disabled={enviando} style={botao}>
        {enviando ? "Criando..." : "Criar usuario"}
      </button>
    </form>
  );
}

const campo: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #ccc",
  borderRadius: 6,
  marginTop: 4,
};

const botao: React.CSSProperties = {
  padding: "10px 12px",
  border: "none",
  borderRadius: 6,
  background: "#1a1a1a",
  color: "#fff",
  cursor: "pointer",
};
