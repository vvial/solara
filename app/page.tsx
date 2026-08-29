import Link from "next/link";
import { redirect } from "next/navigation";
import { obterPerfilAtual } from "@/lib/perfil";
import BotaoSair from "@/components/BotaoSair";

const AREAS_ATIVAS = [
  { chave: "vendas", nome: "Vendas", href: "/vendas" },
  { chave: "financeiro", nome: "Financeiro", href: "/financeiro" },
] as const;

const AREAS_EM_BREVE = ["RH", "Juridico", "Operacoes"];

export default async function PaginaInicial() {
  const dados = await obterPerfilAtual();

  // O middleware ja redireciona, mas garantimos aqui tambem.
  if (!dados) redirect("/login");

  const { email, perfil } = dados;
  const areas = perfil?.areas ?? [];
  const ehAdmin = perfil?.papel === "admin";

  return (
    <main style={{ padding: 40, maxWidth: 900, margin: "0 auto" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h1>Solara OS</h1>
          <p style={{ color: "#555", fontSize: 14 }}>{email}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {ehAdmin && (
            <Link href="/admin" style={botaoLink}>
              Admin
            </Link>
          )}
          <BotaoSair />
        </div>
      </header>

      {!perfil && (
        <p style={{ marginTop: 24, color: "#c0392b" }}>
          Seu usuario ainda nao tem um perfil em <code>perfis</code>. Peca a um
          administrador para cadastrar.
        </p>
      )}

      <section
        style={{
          marginTop: 32,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 16,
        }}
      >
        {AREAS_ATIVAS.filter((a) => areas.includes(a.chave)).map((a) => (
          <Link key={a.chave} href={a.href} style={cartaoAtivo}>
            <strong>{a.nome}</strong>
            <span style={{ fontSize: 13, color: "#1a7f37" }}>Ativa</span>
          </Link>
        ))}

        {AREAS_EM_BREVE.map((nome) => (
          <div key={nome} style={cartaoEmBreve}>
            <strong>{nome}</strong>
            <span style={{ fontSize: 13, color: "#999" }}>em breve</span>
          </div>
        ))}
      </section>
    </main>
  );
}

const botaoLink: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #ccc",
  borderRadius: 6,
  background: "#fff",
  fontSize: 14,
};

const cartaoAtivo: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: 20,
  border: "1px solid #d0d7de",
  borderRadius: 8,
  background: "#fff",
};

const cartaoEmBreve: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: 20,
  border: "1px dashed #d0d7de",
  borderRadius: 8,
  background: "#f6f6f6",
  color: "#999",
};
