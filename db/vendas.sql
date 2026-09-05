-- Vendas: habilita Realtime na tabela pedidos_orcamento (ja existe, importada
-- do ERP). O kanban de /vendas se atualiza por Realtime nesta tabela (SPEC 4.1).
-- Nao altera colunas nem recria a tabela.
do $$
begin
  alter publication supabase_realtime add table pedidos_orcamento;
exception when duplicate_object then null;
end $$;
