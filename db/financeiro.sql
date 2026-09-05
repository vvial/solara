-- Financeiro: tabelas extratos_importados, lancamentos e divergencias
-- (SPEC 5.1). Cole no SQL Editor do Supabase.
--
-- RLS fica desligado nestas tabelas por ora, igual as demais tabelas do
-- motor: a service role e usada nas rotas de API e o Realtime entrega as
-- mudancas ao navegador sem precisar de policies.

create table if not exists extratos_importados (
  id             uuid primary key default gen_random_uuid(),
  nome_arquivo   text not null,
  importado_em   timestamptz default now(),
  importado_por  uuid references perfis(id),
  total_linhas   int,
  total_creditos int
);

create table if not exists lancamentos (
  id                uuid primary key default gen_random_uuid(),
  extrato_id        uuid not null references extratos_importados(id) on delete cascade,
  data              date not null,
  descricao         text not null,
  valor             numeric not null,
  tipo              text not null,                      -- 'credito' | 'debito'
  cod_titulo_casado text,                                -- null se nao casou
  situacao          text not null default 'divergente'   -- 'casado' | 'divergente' | 'ignorado'
);

create index if not exists idx_lancamentos_extrato on lancamentos (extrato_id);

create table if not exists divergencias (
  id               uuid primary key default gen_random_uuid(),
  extrato_id       uuid not null references extratos_importados(id) on delete cascade,
  tipo_inicial     text not null,
  lancamento_id    uuid references lancamentos(id),
  cod_titulo       text,
  valor_lancamento numeric,
  valor_titulo     numeric,
  status           text not null default 'nova',         -- nova|investigando|aguardando_aprovacao|resolvida
  hipotese         jsonb,
  criado_em        timestamptz default now()             -- ordena o kanban (nao consta no SPEC)
);

create index if not exists idx_divergencias_extrato_status on divergencias (extrato_id, status);

-- Realtime no kanban de divergencias (mesma necessidade do kanban de Vendas,
-- SPEC 4.1/5.2). Esta tabela ja tem uuid como chave primaria, entao nao
-- precisa de "replica identity full" como precisou pedidos_orcamento.
do $$
begin
  alter publication supabase_realtime add table divergencias;
exception when duplicate_object then null;
end $$;
