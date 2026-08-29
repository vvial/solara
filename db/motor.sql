-- Motor do Solara OS: tabelas execucoes_agentes e aprovacoes.
-- Cole no SQL Editor do Supabase. A tabela perfis ja existe.
--
-- RLS fica desligado nestas tabelas por ora (igual a perfis): a service role
-- e usada nas rotas de API e o Realtime entrega as mudancas ao navegador sem
-- precisar de policies.

create table if not exists execucoes_agentes (
  id             uuid primary key default gen_random_uuid(),
  area           text not null,                    -- 'vendas' | 'financeiro'
  item_tipo      text not null,                    -- 'pedido' | 'divergencia'
  item_id        text not null,                    -- cod_pedido ou id da divergencia
  agente         text not null,                    -- triador, pesquisador, ... , orquestrador
  chamado_por    uuid references execucoes_agentes(id) on delete set null,
  status         text not null default 'rodando',  -- 'rodando' | 'ok' | 'erro'
  entrada        jsonb,
  saida          jsonb,
  erro           text,
  tokens_entrada int,
  tokens_saida   int,
  inicio         timestamptz default now(),
  fim            timestamptz
);

create index if not exists idx_execucoes_agentes_item on execucoes_agentes (item_id);

create table if not exists aprovacoes (
  id          uuid primary key default gen_random_uuid(),
  area        text not null,
  item_tipo   text not null,
  item_id     text not null,
  titulo      text,                                -- resumo em uma linha
  proposta    jsonb,                               -- o que os agentes propoem
  status      text not null default 'pendente',    -- pendente | aprovada | editada | rejeitada
  decidido_por uuid references perfis(id),
  decidido_em timestamptz,
  observacao  text,
  criado_em   timestamptz default now()            -- ordena a fila (nao consta no SPEC)
);

create index if not exists idx_aprovacoes_area_status on aprovacoes (area, status);

-- Realtime na tabela de execucoes (SPEC 3.1). Idempotente.
do $$
begin
  alter publication supabase_realtime add table execucoes_agentes;
exception when duplicate_object then null;
end $$;
