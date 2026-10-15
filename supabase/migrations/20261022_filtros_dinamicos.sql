-- =============================================================================
-- 20261022 — Filtros dinâmicos na tela de questões.
--
-- Os filtros funcionam em cascata, na ordem da tela:
--   Instituição -> Cargo -> Banca -> Disciplina -> Assunto -> Modalidade.
-- Cada lista mostra só o que existe com os filtros ACIMA dela: escolheu PM BA,
-- os cargos, bancas, disciplinas... são só da PM BA; escolheu Soldado, o resto
-- passa a ser só de PM BA + Soldado. A instituição sempre mostra todas, para
-- o aluno poder trocar sem precisar limpar nada.
--
-- Rode no SQL Editor do Supabase. Idempotente.
-- =============================================================================
begin;

drop function if exists public.opcoes_filtro_questoes(text, text, text);
drop function if exists public.opcoes_filtro_questoes(text, text, text, text);

create or replace function public.opcoes_filtro_questoes(
  p_origem      text default null,
  p_instituicao text default null,
  p_cargo       text default null,
  p_banca       text default null,
  p_disciplina  text default null,
  p_assunto     text default null,
  p_modalidade  text default null
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
    where (p_origem is null or origem = p_origem)
  )
  select jsonb_build_object(
    'instituicoes', (select coalesce(jsonb_agg(x order by x), '[]'::jsonb) from (
        select distinct instituicao x from v where coalesce(instituicao, '') <> '') s),
    'cargos', (select coalesce(jsonb_agg(x order by x), '[]'::jsonb) from (
        select distinct cargo x from v
        where coalesce(cargo, '') <> ''
          and (p_instituicao is null or instituicao = p_instituicao)) s),
    'bancas', (select coalesce(jsonb_agg(x order by x), '[]'::jsonb) from (
        select distinct banca x from v
        where coalesce(banca, '') <> ''
          and (p_instituicao is null or instituicao = p_instituicao)
          and (p_cargo       is null or cargo       = p_cargo)) s),
    'disciplinas', (select coalesce(jsonb_agg(x order by x), '[]'::jsonb) from (
        select distinct disciplina x from v
        where coalesce(disciplina, '') <> ''
          and (p_instituicao is null or instituicao = p_instituicao)
          and (p_cargo       is null or cargo       = p_cargo)
          and (p_banca       is null or banca       = p_banca)) s),
    -- Assunto só depois da disciplina (são mais de mil no acervo).
    'assuntos', case when p_disciplina is null then '[]'::jsonb else
      (select coalesce(jsonb_agg(x order by x), '[]'::jsonb) from (
        select distinct assunto x from v
        where coalesce(assunto, '') <> '' and disciplina = p_disciplina
          and (p_instituicao is null or instituicao = p_instituicao)
          and (p_cargo       is null or cargo       = p_cargo)
          and (p_banca       is null or banca       = p_banca)) s) end,
    'modalidades', (select coalesce(jsonb_agg(x order by x), '[]'::jsonb) from (
        select distinct modalidade x from v
        where coalesce(modalidade, '') <> ''
          and (p_instituicao is null or instituicao = p_instituicao)
          and (p_cargo       is null or cargo       = p_cargo)
          and (p_banca       is null or banca       = p_banca)
          and (p_disciplina  is null or disciplina  = p_disciplina)
          and (p_assunto     is null or assunto     = p_assunto)) s)
  );
$$;

revoke execute on function public.opcoes_filtro_questoes(text, text, text, text, text, text, text) from public, anon;
grant  execute on function public.opcoes_filtro_questoes(text, text, text, text, text, text, text) to authenticated;

commit;
