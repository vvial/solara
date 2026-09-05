import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { casar } from "@/lib/financeiro/casar";
import { limparExtrato, parseTitulos } from "@/lib/financeiro/limpar";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { TituloReceber } from "@/lib/tipos";

// Importa um extrato (obrigatorio) e, opcionalmente, um arquivo de titulos;
// limpa, casa (SPEC 5.3) e grava extratos_importados + lancamentos +
// divergencias. Nao chama agente nenhum - isso fica para /conciliar.
export async function POST(request: Request) {
  const supabaseServidor = await criarClienteServidor();
  const {
    data: { user },
  } = await supabaseServidor.auth.getUser();

  if (!user) {
    return NextResponse.json({ erro: "Nao autenticado." }, { status: 401 });
  }

  const { data: perfil } = await supabaseServidor
    .from("perfis")
    .select("areas")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.areas?.includes("financeiro")) {
    return NextResponse.json({ erro: "Acesso restrito a financeiro." }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ erro: "Corpo invalido." }, { status: 400 });
  }

  const arquivoExtrato = formData.get("extrato");
  if (!(arquivoExtrato instanceof File)) {
    return NextResponse.json({ erro: "Arquivo do extrato e obrigatorio." }, { status: 400 });
  }

  const supabase = criarClienteAdmin();

  const bufferExtrato = Buffer.from(await arquivoExtrato.arrayBuffer());
  const { linhas, antes, depois } = limparExtrato(bufferExtrato);

  if (linhas.length === 0) {
    return NextResponse.json(
      { erro: "Nao foi possivel reconhecer nenhuma linha no extrato enviado." },
      { status: 400 },
    );
  }

  // Titulos: do arquivo enviado, se houver; senao, da tabela titulos_receber
  // (SPEC 5.3).
  const arquivoTitulos = formData.get("titulos");
  let titulos: TituloReceber[];
  if (arquivoTitulos instanceof File && arquivoTitulos.size > 0) {
    titulos = parseTitulos(Buffer.from(await arquivoTitulos.arrayBuffer()));
  } else {
    const { data, error } = await supabase.from("titulos_receber").select("*");
    if (error) {
      return NextResponse.json(
        { erro: `Falha ao buscar titulos_receber: ${error.message}` },
        { status: 500 },
      );
    }
    titulos = (data as TituloReceber[] | null) ?? [];
  }

  const resultado = casar(linhas, titulos);

  const extratoId = randomUUID();
  const totalCreditos = linhas.filter((l) => l.tipo === "credito").length;

  const { error: erroExtrato } = await supabase.from("extratos_importados").insert({
    id: extratoId,
    nome_arquivo: arquivoExtrato.name,
    importado_por: user.id,
    total_linhas: linhas.length,
    total_creditos: totalCreditos,
  });
  if (erroExtrato) {
    return NextResponse.json(
      { erro: `Falha ao registrar extrato: ${erroExtrato.message}` },
      { status: 500 },
    );
  }

  const linhasComId = resultado.lancamentos.map((r) => ({ id: randomUUID(), r }));

  const { error: erroLancamentos } = await supabase.from("lancamentos").insert(
    linhasComId.map(({ id, r }) => ({
      id,
      extrato_id: extratoId,
      data: r.lancamento.data,
      descricao: r.lancamento.descricao,
      valor: r.lancamento.valor,
      tipo: r.lancamento.tipo,
      cod_titulo_casado: r.cod_titulo_casado,
      situacao: r.situacao,
    })),
  );
  if (erroLancamentos) {
    return NextResponse.json(
      { erro: `Falha ao gravar lancamentos: ${erroLancamentos.message}` },
      { status: 500 },
    );
  }

  const divergenciasParaCriar = [
    ...linhasComId
      .filter(({ r }) => r.divergencia)
      .map(({ id, r }) => ({
        extrato_id: extratoId,
        tipo_inicial: r.divergencia!.tipo_inicial,
        lancamento_id: id,
        cod_titulo: r.divergencia!.cod_titulo,
        valor_lancamento: r.lancamento.valor,
        valor_titulo: r.divergencia!.valor_titulo,
        status: "nova",
      })),
    ...resultado.titulosVencidos.map((titulo) => ({
      extrato_id: extratoId,
      tipo_inicial: "vencido_sem_pagamento" as const,
      lancamento_id: null,
      cod_titulo: titulo.cod_titulo,
      valor_lancamento: null,
      valor_titulo: titulo.valor,
      status: "nova",
    })),
  ];

  if (divergenciasParaCriar.length > 0) {
    const { error: erroDivergencias } = await supabase
      .from("divergencias")
      .insert(divergenciasParaCriar);
    if (erroDivergencias) {
      return NextResponse.json(
        { erro: `Falha ao gravar divergencias: ${erroDivergencias.message}` },
        { status: 500 },
      );
    }
  }

  const casados = resultado.lancamentos.filter((r) => r.situacao === "casado").length;
  const ignorados = resultado.lancamentos.filter((r) => r.situacao === "ignorado").length;

  return NextResponse.json({
    ok: true,
    extrato_id: extratoId,
    antes,
    depois,
    resumo: {
      total_linhas: linhas.length,
      casados,
      divergentes: divergenciasParaCriar.length,
      ignorados,
    },
  });
}
