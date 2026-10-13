-- =====================================================================
-- Consultas do acervo para o app (rodar DEPOIS de 20261013_acervo_compartilhado.sql)
--
-- Todas as funções são SECURITY INVOKER: rodam com as permissões do aluno
-- logado, então o RLS continua decidindo o que ele vê (as próprias questões
-- + o acervo). Pode ser executado mais de uma vez.
-- =====================================================================
begin;

-- Índices para os filtros da tela de questões e para "excluir respondidas".
create index if not exists idx_questoes_txt_disciplina  on public.questoes (disciplina);
create index if not exists idx_questoes_txt_banca       on public.questoes (banca);
create index if not exists idx_questoes_txt_instituicao on public.questoes (instituicao);
create index if not exists idx_questoes_txt_cargo       on public.questoes (cargo);
create index if not exists idx_questoes_txt_assunto     on public.questoes (assunto);
create index if not exists idx_question_attempts_user_questao
  on public.question_attempts (user_id, questao_id);

-- ---------------------------------------------------------------------
-- 1. Lista paginada de questões com filtros (tela /questoes)
--    Retorna {"total": n, "itens": [...]} — só a página pedida.
-- ---------------------------------------------------------------------
create or replace function public.listar_questoes(
  p_origem               text    default null,  -- 'USUARIO' | 'ACERVO' | null (todas)
  p_instituicao          text    default null,
  p_cargo                text    default null,
  p_disciplina           text    default null,
  p_assunto              text    default null,
  p_modalidade           text    default null,
  p_banca                text    default null,
  p_excluir_respondidas  boolean default false,
  p_limite               integer default 10,
  p_offset               integer default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select q.id, q.user_id, q.origem, q.instituicao, q.cargo, q.disciplina, q.assunto,
           q.modalidade, q.banca, q.ano, q.enunciado, q.alternativas, q.correta, q.explicacao,
           q.comentarios, q.erros, q.created_at, q.materia_id, q.assunto_id, q.edital_id
    from public.questoes q
    where (p_origem      is null or q.origem      = p_origem)
      and (p_instituicao is null or q.instituicao = p_instituicao)
      and (p_cargo       is null or q.cargo       = p_cargo)
      and (p_disciplina  is null or q.disciplina  = p_disciplina)
      and (p_assunto     is null or q.assunto     = p_assunto)
      and (p_modalidade  is null or q.modalidade  = p_modalidade)
      and (p_banca       is null or q.banca       = p_banca)
      and (not coalesce(p_excluir_respondidas, false) or not exists (
            select 1 from public.question_attempts a
            where a.questao_id = q.id and a.user_id = (select auth.uid())))
  ),
  pagina as (
    select b.*,
           row_number() over (order by (b.origem = 'USUARIO') desc, b.created_at desc nulls last, b.id) as ordem
    from base b
    order by (b.origem = 'USUARIO') desc, b.created_at desc nulls last, b.id
    limit least(greatest(coalesce(p_limite, 10), 1), 50)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'itens', coalesce((select jsonb_agg(to_jsonb(p) - 'ordem' order by p.ordem) from pagina p), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------
-- 2. Opções dos filtros (valores distintos). Cargos dependem da
--    instituição e assuntos dependem da disciplina, para as listas não
--    ficarem enormes (o acervo tem mais de 7 mil assuntos).
-- ---------------------------------------------------------------------
create or replace function public.opcoes_filtro_questoes(
  p_origem      text default null,
  p_instituicao text default null,
  p_disciplina  text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with v as materialized (
    select instituicao, cargo, banca, disciplina, assunto, modalidade
    from public.questoes
    where p_origem is null or origem = p_origem
  )
  select jsonb_build_object(
    'instituicoes', (select coalesce(jsonb_agg(x order by x), '[]'::jsonb)
                     from (select distinct instituicao x from v where coalesce(instituicao, '') <> '') s),
    'cargos',       (select coalesce(jsonb_agg(x order by x), '[]'::jsonb)
                     from (select distinct cargo x from v
                           where coalesce(cargo, '') <> '' and (p_instituicao is null or instituicao = p_instituicao)) s),
    'bancas',       (select coalesce(jsonb_agg(x order by x), '[]'::jsonb)
                     from (select distinct banca x from v where coalesce(banca, '') <> '') s),
    'disciplinas',  (select coalesce(jsonb_agg(x order by x), '[]'::jsonb)
                     from (select distinct disciplina x from v where coalesce(disciplina, '') <> '') s),
    'modalidades',  (select coalesce(jsonb_agg(x order by x), '[]'::jsonb)
                     from (select distinct modalidade x from v where coalesce(modalidade, '') <> '') s),
    'assuntos',     case when p_disciplina is null then '[]'::jsonb else
                    (select coalesce(jsonb_agg(x order by x), '[]'::jsonb)
                     from (select distinct assunto x from v
                           where coalesce(assunto, '') <> '' and disciplina = p_disciplina) s) end
  );
$$;

-- ---------------------------------------------------------------------
-- 3. Questões por id, com a classificação "traduzida" para o catálogo do
--    aluno. Uma questão do acervo de "Língua Portuguesa / Crase" passa a
--    apontar para a disciplina/assunto de mesmo nome do catálogo do aluno
--    (se existir), para cadernos, revisão e estatísticas agruparem certo.
-- ---------------------------------------------------------------------
create or replace function public.questoes_por_ids(p_ids uuid[])
returns table (
  id uuid, user_id uuid, origem text,
  questao_disciplina_id uuid, questao_assunto_id uuid,
  materia_id uuid, assunto_id uuid, edital_id uuid,
  instituicao text, cargo text, disciplina text, assunto text, modalidade text, banca text, ano smallint,
  enunciado text, alternativas jsonb, correta text, explicacao text,
  comentarios jsonb, erros jsonb, created_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select q.id, q.user_id, q.origem,
         case when q.user_id = (select auth.uid()) then q.questao_disciplina_id else ud.id end,
         case when q.user_id = (select auth.uid()) then q.questao_assunto_id   else ua.id end,
         q.materia_id, q.assunto_id, q.edital_id,
         q.instituicao, q.cargo, q.disciplina, q.assunto, q.modalidade, q.banca, q.ano,
         q.enunciado, q.alternativas, q.correta, q.explicacao,
         q.comentarios, q.erros, q.created_at
  from public.questoes q
  left join public.questao_disciplinas ad
         on q.user_id is distinct from (select auth.uid()) and ad.id = q.questao_disciplina_id
  left join public.questao_disciplinas ud
         on ud.user_id = (select auth.uid()) and ud.nome_normalizado = ad.nome_normalizado
  left join public.questao_assuntos aa
         on q.user_id is distinct from (select auth.uid()) and aa.id = q.questao_assunto_id
  left join public.questao_assuntos ua
         on ua.user_id = (select auth.uid()) and ua.disciplina_id = ud.id and ua.nome_normalizado = aa.nome_normalizado
  where q.id = any(p_ids)
$$;

-- Só usuários logados chamam essas funções.
revoke execute on function public.listar_questoes(text, text, text, text, text, text, text, boolean, integer, integer) from public, anon;
revoke execute on function public.opcoes_filtro_questoes(text, text, text) from public, anon;
revoke execute on function public.questoes_por_ids(uuid[]) from public, anon;
grant  execute on function public.listar_questoes(text, text, text, text, text, text, text, boolean, integer, integer) to authenticated;
grant  execute on function public.opcoes_filtro_questoes(text, text, text) to authenticated;
grant  execute on function public.questoes_por_ids(uuid[]) to authenticated;

commit;
