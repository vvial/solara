import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Perfil } from "@/lib/tipos";

// Le o usuario logado e a linha correspondente em `perfis`.
// Retorna null se nao houver sessao.
export async function obterPerfilAtual(): Promise<
  { userId: string; email: string; perfil: Perfil | null } | null
> {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: perfil } = await supabase
    .from("perfis")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? "",
    perfil: (perfil as Perfil | null) ?? null,
  };
}
