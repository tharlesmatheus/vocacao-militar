-- =============================================================================
-- 20261023 — Negrito, itálico e sublinhado nas questões.
--
-- Questões de Português dizem "o termo sublinhado", "as palavras em destaque"...
-- e o app mostrava o texto sem a formatação. Agora o publicador do VM3 grava,
-- só quando a questão tem destaques:
--   questoes.enunciado_fmt     texto com <b>, <i> e <u> (todo o resto escapado)
--   questoes.alternativas_fmt  {"A": "...", ...} só das alternativas formatadas
-- O texto puro (enunciado/alternativas) continua igual para todo o resto.
-- O app monta essas três marcações sem innerHTML (lib/textoFormatado.ts).
--
-- Rode no SQL Editor do Supabase ANTES de publicar o código e de republicar o
-- acervo pelo VM3. Idempotente.
-- =============================================================================
begin;

alter table public.questoes
  add column if not exists enunciado_fmt    text,
  add column if not exists alternativas_fmt jsonb;

-- -----------------------------------------------------------------------------
-- 1. Lista de questões (tela /questoes) com a formatação
-- -----------------------------------------------------------------------------
create or replace function public.listar_questoes(
  p_origem                  text    default null,
  p_instituicao             text    default null,
  p_cargo                   text    default null,
  p_disciplina              text    default null,
  p_assunto                 text    default null,
  p_modalidade              text    default null,
  p_banca                   text    default null,
  p_excluir_respondidas     boolean default false,
  p_limite                  integer default 10,
  p_offset                  integer default 0,
  p_ocultar_especialidades  boolean default false,
  p_subassunto              text    default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select q.id, q.user_id, q.origem, q.instituicao, q.cargo, q.cargo_area, q.disciplina, q.assunto, q.subassunto,
           q.enunciado_fmt, q.alternativas_fmt,
           q.modalidade, q.banca, q.ano, q.enunciado, q.alternativas, q.correta, q.explicacao,
           q.comentarios, q.erros, q.created_at, q.materia_id, q.assunto_id, q.edital_id
    from public.questoes q
    where (p_origem      is null or q.origem      = p_origem)
      and (p_instituicao is null or q.instituicao = p_instituicao)
      and (p_cargo       is null or q.cargo       = p_cargo)
      and (p_disciplina  is null or q.disciplina  = p_disciplina)
      and (p_assunto     is null or q.assunto     = p_assunto)
      and (p_subassunto  is null or q.subassunto  = p_subassunto)
      and (p_modalidade  is null or q.modalidade  = p_modalidade)
      and (p_banca       is null or q.banca       = p_banca)
      and (not coalesce(p_excluir_respondidas, false) or not exists (
            select 1 from public.question_attempts a
            where a.questao_id = q.id and a.user_id = (select auth.uid())))
      and (not coalesce(p_ocultar_especialidades, false)
           or p_cargo is not null or p_disciplina is not null
           or q.origem <> 'ACERVO'
           or not exists (select 1 from public.disciplinas_especialidade e where e.nome = q.disciplina))
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

-- -----------------------------------------------------------------------------
-- 2. Simulado com a formatação
-- -----------------------------------------------------------------------------
create or replace function public.questoes_do_simulado(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when s.id is null then null else jsonb_build_object(
    'simulado', jsonb_build_object(
       'id', s.id, 'titulo', s.titulo, 'total', s.total, 'duracao_seg', s.duracao_seg,
       'iniciado_em', s.iniciado_em, 'expira_em', s.expira_em, 'finalizado_em', s.finalizado_em,
       'respostas', s.respostas, 'agora', now()),
    'questoes', coalesce((
       select jsonb_agg(jsonb_build_object(
                'id', q.id, 'disciplina', q.disciplina, 'assunto', q.assunto, 'banca', q.banca,
                'modalidade', q.modalidade, 'enunciado', q.enunciado, 'alternativas', q.alternativas,
                'enunciado_fmt', q.enunciado_fmt, 'alternativas_fmt', q.alternativas_fmt,
                'correta', case when s.finalizado_em is not null then q.correta end)
              order by u.ord)
       from unnest(s.questao_ids) with ordinality as u(qid, ord)
       join public.questoes q on q.id = u.qid), '[]'::jsonb))
  end
  from public.simulados s
  where s.id = p_id and s.user_id = auth.uid()
$$;

-- -----------------------------------------------------------------------------
-- 3. Questões por id (cadernos, treino, revisão) com a formatação
-- -----------------------------------------------------------------------------
drop function if exists public.questoes_por_ids(uuid[]);

create or replace function public.questoes_por_ids(p_ids uuid[])
returns table (
  id uuid, user_id uuid, origem text,
  questao_disciplina_id uuid, questao_assunto_id uuid,
  materia_id uuid, assunto_id uuid, edital_id uuid,
  instituicao text, cargo text, disciplina text, assunto text, modalidade text, banca text, ano smallint,
  enunciado text, alternativas jsonb, correta text, explicacao text,
  comentarios jsonb, erros jsonb, created_at timestamptz,
  enunciado_fmt text, alternativas_fmt jsonb
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
         q.comentarios, q.erros, q.created_at,
         q.enunciado_fmt, q.alternativas_fmt
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

-- -----------------------------------------------------------------------------
-- 4. Explicações geradas antes, sem ver os destaques: apaga para serem refeitas.
--    Só as da plataforma, de questões que falam em destaque ou têm alternativas
--    formatadas, e que não foram geradas já vendo a formatação (modelo "+fmt").
--    Comentários ocultos pelo admin ficam como estão. Chamada pelo publicador.
-- -----------------------------------------------------------------------------
create or replace function public.apagar_comentarios_sem_destaque()
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_qtd integer;
begin
  delete from public.questao_comentarios c
   using public.questoes q
   where c.questao_id = q.id
     and c.autor_tipo = 'PLATAFORMA'
     and c.status <> 'oculto'
     and coalesce(c.modelo, '') not like '%+fmt'
     and (q.alternativas_fmt is not null
          or (q.enunciado_fmt is not null
              and q.enunciado ~* '(destacad|grifad|sublinhad|negrito|it[aá]lico|em destaque)'));
  get diagnostics v_qtd = row_count;
  return v_qtd;
end $$;

revoke execute on function public.apagar_comentarios_sem_destaque() from public, anon, authenticated;
grant  execute on function public.apagar_comentarios_sem_destaque() to service_role;

revoke execute on function public.listar_questoes(text, text, text, text, text, text, text, boolean, integer, integer, boolean, text) from public, anon;
grant  execute on function public.listar_questoes(text, text, text, text, text, text, text, boolean, integer, integer, boolean, text) to authenticated;
revoke execute on function public.questoes_por_ids(uuid[]) from public, anon;
grant  execute on function public.questoes_por_ids(uuid[]) to authenticated;

commit;
