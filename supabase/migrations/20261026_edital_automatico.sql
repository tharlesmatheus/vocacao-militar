-- =============================================================================
-- 20261026 — Edital automático.
--
-- O aluno não monta mais o edital à mão: escolhe INSTITUIÇÃO + CARGO e o edital
-- é a lista de disciplinas e assuntos das questões do acervo desse cargo (sempre
-- atualizada: questão nova no acervo, assunto novo no edital).
-- O progresso de cada assunto vem do que o aluno fez no sistema:
--   • questões respondidas (última resposta de cada questão) e % de acerto;
--   • flashcards e resumos do assunto;
--   • revisões (feitas e vencidas) de flashcards, resumos e caderno de erros;
--   • tempo de estudo registrado no assunto/disciplina.
-- O aluno pode ter vários editais (vários cargos), até 10.
--
-- As tabelas antigas do edital manual (editais, materias, assuntos) ficam como
-- estão: o Pomodoro e dados antigos de revisão ainda as leem.
--
-- Rode no SQL Editor do Supabase. Idempotente.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1. Editais do aluno = pares instituição + cargo.
-- -----------------------------------------------------------------------------
create table if not exists public.editais_alvo (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  instituicao text not null check (length(btrim(instituicao)) between 1 and 200),
  cargo       text not null check (length(btrim(cargo)) between 1 and 200),
  created_at  timestamptz not null default now(),
  unique (user_id, instituicao, cargo)
);

alter table public.editais_alvo enable row level security;

drop policy if exists editais_alvo_select on public.editais_alvo;
create policy editais_alvo_select on public.editais_alvo
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists editais_alvo_delete on public.editais_alvo;
create policy editais_alvo_delete on public.editais_alvo
  for delete to authenticated using (user_id = (select auth.uid()));

-- Inserção pela função abaixo (valida o limite e se o cargo existe no acervo).
revoke insert, update on public.editais_alvo from authenticated;
grant select, delete on public.editais_alvo to authenticated;

-- Filtro do acervo por instituição + cargo e contagem por assunto.
create index if not exists idx_questoes_inst_cargo on public.questoes (instituicao, cargo);
create index if not exists idx_questoes_disc_assunto on public.questoes (disciplina, assunto);

-- -----------------------------------------------------------------------------
-- 2. Nome comparável: sem acento, minúsculo, só letras e números
--    (mesma regra do normalizarNomeCatalogo do app).
-- -----------------------------------------------------------------------------
create or replace function public.vm_norm(p text)
returns text
language sql immutable parallel safe
as $$
  select regexp_replace(
           lower(translate(coalesce(p, ''),
             'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
             'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')),
           '[^a-z0-9]+', '', 'g')
$$;

-- -----------------------------------------------------------------------------
-- 3. Adicionar edital (até 10 por aluno; o cargo precisa ter questões).
-- -----------------------------------------------------------------------------
create or replace function public.adicionar_edital_alvo(p_instituicao text, p_cargo text)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then raise exception 'Entre na sua conta.'; end if;
  p_instituicao := btrim(coalesce(p_instituicao, ''));
  p_cargo := btrim(coalesce(p_cargo, ''));
  if p_instituicao = '' or p_cargo = '' then raise exception 'Escolha a instituição e o cargo.'; end if;

  select id into v_id from public.editais_alvo
   where user_id = v_uid and instituicao = p_instituicao and cargo = p_cargo;
  if v_id is not null then return v_id; end if;

  if (select count(*) from public.editais_alvo where user_id = v_uid) >= 10 then
    raise exception 'Você já tem 10 editais. Remova um para adicionar outro.';
  end if;
  if not exists (select 1 from public.questoes
                  where origem = 'ACERVO' and not oculta
                    and instituicao = p_instituicao and cargo = p_cargo) then
    raise exception 'Ainda não há questões desse cargo no acervo.';
  end if;

  insert into public.editais_alvo (user_id, instituicao, cargo)
  values (v_uid, p_instituicao, p_cargo)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.adicionar_edital_alvo(text, text) from public, anon;
grant  execute on function public.adicionar_edital_alvo(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Estrutura + progresso de um edital.
--    security invoker: as questões do acervo só aparecem para assinante (RLS);
--    tudo do aluno é filtrado por auth.uid().
--    Devolve {instituicao, cargo, assuntos:[...], tempo_disciplina:{...}}.
-- -----------------------------------------------------------------------------
create or replace function public.edital_progresso(p_edital uuid)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with
  eu as (select auth.uid() uid),
  e as (
    select a.instituicao, a.cargo from public.editais_alvo a, eu
     where a.id = p_edital and a.user_id = eu.uid
  ),
  banco as materialized (
    select q.id,
           coalesce(nullif(btrim(q.disciplina), ''), 'Sem disciplina') disciplina,
           coalesce(nullif(btrim(q.assunto), ''), 'Geral') assunto
      from public.questoes q, e
     where q.origem = 'ACERVO' and not q.oculta
       and q.instituicao = e.instituicao and q.cargo = e.cargo
  ),
  topicos as (
    select disciplina, assunto, count(*) n_cargo,
           public.vm_norm(disciplina) nd, public.vm_norm(assunto) na
      from banco group by disciplina, assunto
  ),
  -- Quantas questões do assunto existem no acervo inteiro (para a meta do assunto).
  acervo as (
    select t.nd, t.na,
           (select count(*) from public.questoes q
             where q.origem = 'ACERVO' and not q.oculta
               and q.disciplina = t.disciplina
               and (case when t.assunto = 'Geral' then coalesce(nullif(btrim(q.assunto), ''), 'Geral') = 'Geral'
                         else q.assunto = t.assunto end)) n_acervo
      from topicos t
  ),
  -- Última resposta do aluno em cada questão.
  ult as (
    select distinct on (a.questao_id) a.questao_id, a.resultado, a.created_at
      from public.question_attempts a
     where a.user_id = (select uid from eu)
     order by a.questao_id, a.created_at desc
  ),
  resp as (
    select public.vm_norm(coalesce(nullif(btrim(q.disciplina), ''), 'Sem disciplina')) nd,
           public.vm_norm(coalesce(nullif(btrim(q.assunto), ''), 'Geral')) na,
           count(*) feitas,
           count(*) filter (where u.resultado = 'ACERTO') acertos,
           count(*) filter (where b.id is not null) feitas_cargo,
           max(u.created_at) ultima
      from ult u
      join public.questoes q on q.id = u.questao_id
      left join banco b on b.id = q.id
     group by 1, 2
  ),
  flash as (
    select public.vm_norm(d.nome) nd, public.vm_norm(s.nome) na, count(*) n
      from public.flashcards f
      join public.questao_assuntos s on s.id = f.assunto_catalogo_id
      join public.questao_disciplinas d on d.id = s.disciplina_id
     where f.user_id = (select uid from eu) and coalesce(f.active, true)
     group by 1, 2
  ),
  res as (
    select public.vm_norm(d.nome) nd, public.vm_norm(s.nome) na, count(*) n
      from public.resumos r
      join public.questao_assuntos s on s.id = r.assunto_catalogo_id
      join public.questao_disciplinas d on d.id = s.disciplina_id
     where r.user_id = (select uid from eu)
     group by 1, 2
  ),
  -- Revisões de flashcard, resumo e caderno de erros, com o assunto de cada item.
  rev_itens as (
    select public.vm_norm(d.nome) nd, public.vm_norm(s.nome) na, rp.review_count, rp.next_review, rp.last_reviewed_at
      from public.review_progress rp
      join public.flashcards f on f.id::text = rp.item_id::text and f.user_id = rp.user_id
      join public.questao_assuntos s on s.id = f.assunto_catalogo_id
      join public.questao_disciplinas d on d.id = s.disciplina_id
     where rp.user_id = (select uid from eu) and rp.method = 'FLASHCARD' and coalesce(f.active, true)
    union all
    select public.vm_norm(d.nome), public.vm_norm(s.nome), rp.review_count, rp.next_review, rp.last_reviewed_at
      from public.review_progress rp
      join public.resumos r on r.id::text = rp.item_id::text and r.user_id = rp.user_id
      join public.questao_assuntos s on s.id = r.assunto_catalogo_id
      join public.questao_disciplinas d on d.id = s.disciplina_id
     where rp.user_id = (select uid from eu) and rp.method = 'RESUMO'
    union all
    select public.vm_norm(coalesce(nullif(btrim(q.disciplina), ''), 'Sem disciplina')),
           public.vm_norm(coalesce(nullif(btrim(q.assunto), ''), 'Geral')),
           rp.review_count, rp.next_review, rp.last_reviewed_at
      from public.review_progress rp
      join public.caderno_itens c on c.questao_id::text = rp.item_id::text and c.user_id = rp.user_id
      join public.questoes q on q.id = c.questao_id
     where rp.user_id = (select uid from eu) and rp.method = 'CADERNO'
       and c.tipo = 'ERROS' and c.recuperada_em is null
  ),
  rev as (
    select nd, na,
           coalesce(sum(review_count), 0) feitas,
           count(*) filter (where next_review is not null
                              and next_review::date <= (now() at time zone 'America/Sao_Paulo')::date) vencidas,
           max(last_reviewed_at) ultima
      from rev_itens group by 1, 2
  ),
  tempo_a as (
    select public.vm_norm(d.nome) nd, public.vm_norm(s.nome) na, sum(coalesce(ss.duration_seconds, 0)) seg
      from public.study_sessions ss
      join public.questao_assuntos s on s.id = ss.assunto_catalogo_id
      join public.questao_disciplinas d on d.id = s.disciplina_id
     where ss.user_id = (select uid from eu)
     group by 1, 2
  ),
  tempo_d as (
    select public.vm_norm(d.nome) nd, sum(coalesce(ss.duration_seconds, 0)) seg
      from public.study_sessions ss
      join public.questao_disciplinas d on d.id = ss.disciplina_catalogo_id
     where ss.user_id = (select uid from eu)
     group by 1
  )
  select case when not exists (select 1 from e) then null else jsonb_build_object(
    'instituicao', (select instituicao from e),
    'cargo', (select cargo from e),
    'assuntos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'disciplina', t.disciplina,
               'assunto', t.assunto,
               'n_cargo', t.n_cargo,
               'n_acervo', coalesce(ac.n_acervo, t.n_cargo),
               'feitas', coalesce(r.feitas, 0),
               'acertos', coalesce(r.acertos, 0),
               'feitas_cargo', coalesce(r.feitas_cargo, 0),
               'flashcards', coalesce(f.n, 0),
               'resumos', coalesce(rs.n, 0),
               'revisoes', coalesce(v.feitas, 0),
               'revisoes_vencidas', coalesce(v.vencidas, 0),
               'tempo_seg', coalesce(ta.seg, 0),
               'ultima_atividade', greatest(r.ultima, v.ultima)
             ) order by t.disciplina, t.assunto)
        from topicos t
        left join acervo ac on ac.nd = t.nd and ac.na = t.na
        left join resp r    on r.nd = t.nd and r.na = t.na
        left join flash f   on f.nd = t.nd and f.na = t.na
        left join res rs    on rs.nd = t.nd and rs.na = t.na
        left join rev v     on v.nd = t.nd and v.na = t.na
        left join tempo_a ta on ta.nd = t.nd and ta.na = t.na
    ), '[]'::jsonb),
    'tempo_disciplina', coalesce((
      select jsonb_object_agg(x.disciplina, x.seg)
        from (select t.disciplina, max(td.seg) seg
                from topicos t join tempo_d td on td.nd = t.nd
               group by t.disciplina) x
    ), '{}'::jsonb)
  ) end
$$;

revoke execute on function public.edital_progresso(uuid) from public, anon;
grant  execute on function public.edital_progresso(uuid) to authenticated;

commit;
