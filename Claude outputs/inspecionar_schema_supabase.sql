-- Rode no Supabase: SQL Editor > New query > cole e clique em Run.
-- Somente leitura. Copie o resultado (uma célula JSON) e cole no chat.
select jsonb_pretty(jsonb_build_object(
  'colunas', (
    select jsonb_object_agg(table_name, cols) from (
      select table_name, jsonb_agg(jsonb_build_object(
               'col', column_name, 'tipo', data_type, 'nulo', is_nullable,
               'default', column_default) order by ordinal_position) cols
      from information_schema.columns
      where table_schema = 'public'
        and table_name in ('questoes','questao_instituicoes','questao_cargos','questao_bancas',
                           'questao_disciplinas','questao_assuntos','materias','assuntos',
                           'question_attempts','caderno_itens','flashcards','editais')
      group by table_name) t),
  'restricoes', (
    select jsonb_agg(jsonb_build_object('tabela', conrelid::regclass::text,
             'nome', conname, 'def', pg_get_constraintdef(oid)))
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conrelid::regclass::text in ('questoes','questao_instituicoes','questao_cargos','questao_bancas',
                                       'questao_disciplinas','questao_assuntos')),
  'indices', (
    select jsonb_agg(jsonb_build_object('tabela', tablename, 'def', indexdef))
    from pg_indexes
    where schemaname = 'public'
      and tablename in ('questoes','questao_instituicoes','questao_cargos','questao_bancas',
                        'questao_disciplinas','questao_assuntos')),
  'rls_ativo', (
    select jsonb_object_agg(relname, relrowsecurity)
    from pg_class
    where relnamespace = 'public'::regnamespace and relkind = 'r'
      and relname in ('questoes','questao_instituicoes','questao_cargos','questao_bancas',
                      'questao_disciplinas','questao_assuntos','question_attempts','caderno_itens')),
  'politicas', (
    select jsonb_agg(jsonb_build_object('tabela', tablename, 'nome', policyname,
             'comando', cmd, 'papeis', roles, 'using', qual, 'check', with_check))
    from pg_policies
    where schemaname = 'public'
      and tablename in ('questoes','questao_instituicoes','questao_cargos','questao_bancas',
                        'questao_disciplinas','questao_assuntos','question_attempts','caderno_itens')),
  'contagens', jsonb_build_object(
    'questoes', (select count(*) from public.questoes),
    'questoes_usuarios_distintos', (select count(distinct user_id) from public.questoes),
    'instituicoes', (select count(*) from public.questao_instituicoes),
    'cargos', (select count(*) from public.questao_cargos),
    'bancas', (select count(*) from public.questao_bancas),
    'disciplinas', (select count(*) from public.questao_disciplinas),
    'assuntos', (select count(*) from public.questao_assuntos)),
  'tamanho_banco', pg_size_pretty(pg_database_size(current_database()))
)) as schema_vocacao;
