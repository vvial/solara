import Link from "next/link";
import { redirect } from "next/navigation";
import { obterPerfilAtual } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import FormularioUsuario from "@/components/FormularioUsuario";
import type { Perfil } from "@/lib/tipos";

export default async function PaginaAdmin() {
  const dados = await obterPerfilAtual();
  if (!dados) redirect("/login");
  if (dados.perfil?.papel !== "admin") redirect("/");

  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("perfis")
    .select("*")
    .order("criado_em", { ascending: true });
  const perfis = (data as Perfil[] | null) ?? [];

  return (
    <main style={{ padding: 40, maxWidth: 900, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between" }}>
        <h1>Administracao de usuarios</h1>
        <Link href="/" style={{ fontSize: 14, color: "#555" }}>
          ← Voltar
        </Link>
      </header>

      <table
        style={{
          width: "100%",
          marginTop: 24,
          borderCollapse: "collapse",
          fontSize: 14,
        }}
      >
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #d0d7de" }}>
            <th style={celula}>E-mail</th>
            <th style={celula}>Nome</th>
            <th style={celula}>Papel</th>
            <th style={celula}>Areas</th>
          </tr>
        </thead>
        <tbody>
          {perfis.map((p) => (
            <tr key={p.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={celula}>{p.email}</td>
              <td style={celula}>{p.nome}</td>
              <td style={celula}>{p.papel}</td>
              <td style={celula}>{(p.areas ?? []).join(", ")}</td>
            </tr>
          ))}
          {perfis.length === 0 && (
            <tr>
              <td style={celula} colSpan={4}>
                Nenhum perfil cadastrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2 style={{ marginTop: 40, fontSize: 18 }}>Criar usuario</h2>
      <FormularioUsuario />
    </main>
  );
}

const celula: React.CSSProperties = { padding: "8px 10px" };
