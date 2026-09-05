import { NextResponse } from "next/server";
import { conciliar } from "@/lib/orquestradores/financeiro";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export const maxDuration = 60;

// Dispara o orquestrador de Financeiro para um extrato (SPEC 5.4).
// So usuarios com 'financeiro' em perfis.areas podem chamar.
export async function POST(request: Request) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ erro: "Nao autenticado." }, { status: 401 });
  }

  const { data: perfil } = await supabase
    .from("perfis")
    .select("areas")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.areas?.includes("financeiro")) {
    return NextResponse.json({ erro: "Acesso restrito a financeiro." }, { status: 403 });
  }

  let corpo: { extrato_id?: string };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "Corpo invalido." }, { status: 400 });
  }

  const extratoId = corpo.extrato_id?.trim();
  if (!extratoId) {
    return NextResponse.json({ erro: "extrato_id e obrigatorio." }, { status: 400 });
  }

  try {
    await conciliar(extratoId);
  } catch (erro) {
    return NextResponse.json(
      { erro: erro instanceof Error ? erro.message : "Falha ao conciliar." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
