import { redirect } from "next/navigation";
import TelaFinanceiro from "@/components/TelaFinanceiro";
import { obterPerfilAtual } from "@/lib/perfil";

// Rota /financeiro: so usuarios com 'financeiro' em perfis.areas (SPEC 5).
export default async function PaginaFinanceiro() {
  const dados = await obterPerfilAtual();
  if (!dados) redirect("/login");
  if (!dados.perfil?.areas?.includes("financeiro")) redirect("/");

  return <TelaFinanceiro />;
}
