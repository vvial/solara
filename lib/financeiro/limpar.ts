import type { TituloReceber } from "@/lib/tipos";

// Limpeza de extrato e titulos (SPEC 5.3). Codigo deterministico, sem
// modelo: deteccao de separador, datas, numeros e encoding.

export interface LancamentoLimpo {
  data: string; // ISO yyyy-mm-dd
  descricao: string;
  valor: number;
  tipo: "credito" | "debito";
}

export interface ResultadoLimpeza {
  linhas: LancamentoLimpo[];
  antes: string[]; // 6 primeiras linhas do arquivo como veio
  depois: string[]; // 6 primeiras linhas normalizadas, como texto legivel
}

// Le o arquivo como utf-8; se a decodificacao falhar (aparecem caracteres de
// substituicao), tenta latin-1 (SPEC 5.3: "ler latin-1 se utf-8 falhar").
function decodificar(buffer: Buffer): string {
  const utf8 = buffer.toString("utf-8");
  if (utf8.includes("�")) {
    return buffer.toString("latin1");
  }
  return utf8;
}

function detectarSeparador(linha: string): "," | ";" {
  return linha.includes(";") ? ";" : ",";
}

// "1.250,00" -> 1250.00 ; "-45,90" -> -45.90 ; "540.00" -> 540 (formato ja
// limpo, com ponto decimal).
function paraNumero(valorTexto: string): number {
  const texto = valorTexto.trim();
  if (texto === "") return NaN;
  // Formato BR (tem virgula): remove separador de milhar (.) e troca a
  // virgula decimal por ponto.
  if (texto.includes(",")) {
    return parseFloat(texto.replace(/\./g, "").replace(",", "."));
  }
  return parseFloat(texto);
}

// "20/07/2026" -> "2026-07-20"
function paraIso(dataTexto: string): string {
  const [dia, mes, ano] = dataTexto.trim().split("/");
  return `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
}

function formatarLinhaDepois(l: LancamentoLimpo): string {
  return `${l.data} | ${l.descricao} | ${l.valor.toFixed(2)} | ${l.tipo}`;
}

function ehLinhaDeSaldo(historico: string): boolean {
  return historico.toUpperCase().includes("SALDO");
}

// Extrato ja no formato limpo (cabecalho cod_lancamento,data,descricao,valor,tipo).
function limparExtratoLimpo(linhas: string[]): LancamentoLimpo[] {
  const separador = detectarSeparador(linhas[0]);
  const resultado: LancamentoLimpo[] = [];

  for (const linha of linhas.slice(1)) {
    if (!linha.trim()) continue;
    const colunas = linha.split(separador);
    const [, data, descricao, valorTexto, tipoTexto] = colunas;
    const valor = paraNumero(valorTexto);
    if (Number.isNaN(valor)) continue;
    resultado.push({
      data: data.trim(),
      descricao: descricao.trim(),
      valor,
      tipo: tipoTexto.trim().toLowerCase() === "debito" ? "debito" : "credito",
    });
  }
  return resultado;
}

// Extrato bruto do banco: cabecalhos e rodape livres, linhas de SALDO,
// coluna de saldo a descartar, datas e numeros em formato BR (SPEC 5.3).
function limparExtratoBruto(linhas: string[]): LancamentoLimpo[] {
  const indiceCabecalho = linhas.findIndex((l) => l.trim().toLowerCase().startsWith("data"));
  if (indiceCabecalho === -1) return [];

  const separador = detectarSeparador(linhas[indiceCabecalho]);
  const resultado: LancamentoLimpo[] = [];

  for (const linha of linhas.slice(indiceCabecalho + 1)) {
    if (!linha.trim()) continue;
    const colunas = linha.split(separador);
    const [dataTexto, historico, valorTexto] = colunas; // saldo (4a coluna) descartado
    if (!dataTexto || !historico) continue;
    if (ehLinhaDeSaldo(historico)) continue;

    const valor = paraNumero(valorTexto ?? "");
    if (Number.isNaN(valor)) continue;

    resultado.push({
      data: paraIso(dataTexto),
      descricao: historico.trim(),
      valor,
      tipo: valor < 0 ? "debito" : "credito",
    });
  }
  return resultado;
}

export function limparExtrato(buffer: Buffer): ResultadoLimpeza {
  const texto = decodificar(buffer);
  const todasLinhas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  const antes = todasLinhas.slice(0, 6);

  const jaLimpo = todasLinhas[0]?.toLowerCase().replace(/\s/g, "").startsWith("cod_lancamento,data");
  const linhas = jaLimpo ? limparExtratoLimpo(todasLinhas) : limparExtratoBruto(todasLinhas);

  return {
    linhas,
    antes,
    depois: linhas.slice(0, 6).map(formatarLinhaDepois),
  };
}

// Titulos enviados pelo usuario (opcional - SPEC 5.3): mesmo formato de
// dados/titulos_receber.csv (cod_titulo,cod_cliente,nota_fiscal,valor,
// emissao,vencimento,status).
export function parseTitulos(buffer: Buffer): TituloReceber[] {
  const texto = decodificar(buffer);
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (linhas.length === 0) return [];

  const separador = detectarSeparador(linhas[0]);
  const titulos: TituloReceber[] = [];

  for (const linha of linhas.slice(1)) {
    const [cod_titulo, cod_cliente, nota_fiscal, valorTexto, emissao, vencimento, status] =
      linha.split(separador);
    if (!cod_titulo) continue;
    titulos.push({
      cod_titulo: cod_titulo.trim(),
      cod_cliente: cod_cliente?.trim() ?? "",
      nota_fiscal: nota_fiscal?.trim() ?? "",
      valor: paraNumero(valorTexto ?? ""),
      emissao: emissao?.trim() ?? "",
      vencimento: vencimento?.trim() ?? "",
      status: (status?.trim() as TituloReceber["status"]) ?? "aberto",
    });
  }
  return titulos;
}
