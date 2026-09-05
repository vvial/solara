import { redirect } from "next/navigation";
import TelaVendas from "@/components/TelaVendas";
import { obterPerfilAtual } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Cliente, Pedido } from "@/lib/tipos";

// Rota /vendas: so usuarios com 'vendas' em perfis.areas (SPEC 4).
export default async function PaginaVendas() {
  const dados = await obterPerfilAtual();
  if (!dados) redirect("/login");
  if (!dados.perfil?.areas?.includes("vendas")) redirect("/");

  const supabase = await criarClienteServidor();
  const [{ data: pedidos }, { data: clientes }] = await Promise.all([
    supabase
      .from("pedidos_orcamento")
      .select("*")
      .order("data", { ascending: false }),
    supabase.from("clientes").select("*"),
  ]);

  return (
    <TelaVendas
      pedidosIniciais={(pedidos as Pedido[] | null) ?? []}
      clientes={(clientes as Cliente[] | null) ?? []}
    />
  );
}
