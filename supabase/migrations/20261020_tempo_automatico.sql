-- =============================================================================
-- 20261020 — Tempo de estudo contado automaticamente.
--
-- O app conta o tempo ATIVO (aba visível + aluno mexendo nos últimos minutos)
-- em questões, simulados, revisão e caderno de erros, e envia a cada ~90 s.
-- Cada envio vira uma linha em study_sessions com a origem do tempo.
--
-- Rode no SQL Editor do Supabase ANTES de publicar o código novo.
-- Idempotente (pode rodar de novo).
-- =============================================================================
begin;

-- De onde veio o tempo: cronometro | lancado | questoes | simulado | revisao | caderno.
-- Linhas antigas ficam com null (o app deduz pelo campo mode).
alter table public.study_sessions add column if not exists origem text;

create index if not exists idx_study_sessions_user_inicio
  on public.study_sessions (user_id, started_at desc);

-- Registra um trecho de tempo ativo. Chamado pelo navegador do aluno.
create or replace function public.registrar_tempo_auto(
  p_origem          text,
  p_segundos        integer,
  p_disciplina_id   uuid default null,
  p_disciplina_nome text default null
)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_seg      integer;
  v_recentes integer;
  v_disc     uuid;
  v_nome     text := left(nullif(btrim(coalesce(p_disciplina_nome, '')), ''), 120);
begin
  if v_uid is null then return 'sem_login'; end if;
  if p_origem is null or p_origem not in ('questoes', 'simulado', 'revisao', 'caderno') then
    raise exception 'Origem inválida.' using errcode = '22023';
  end if;

  v_seg := least(greatest(coalesce(p_segundos, 0), 0), 180);
  if v_seg < 5 then return 'ignorado'; end if;

  -- Cronômetro esquecido há mais de 4 h: fecha nas 4 h.
  update public.study_sessions
     set ended_at = started_at + interval '4 hours',
         duration_seconds = 4 * 3600
   where user_id = v_uid and ended_at is null and started_at <= now() - interval '4 hours';

  -- Cronômetro manual ligado: ele já está contando; não soma em dobro.
  if exists (select 1 from public.study_sessions
             where user_id = v_uid and ended_at is null) then
    return 'cronometro_ativo';
  end if;

  -- Nunca aceita mais tempo do que o relógio permite (várias abas abertas, reenvios).
  select coalesce(sum(duration_seconds), 0)::int into v_recentes
    from public.study_sessions
   where user_id = v_uid
     and origem in ('questoes', 'simulado', 'revisao', 'caderno')
     and ended_at > now() - interval '3 minutes';
  v_seg := least(v_seg, 200 - v_recentes);
  if v_seg < 5 then return 'limite'; end if;

  -- Disciplina: a do catálogo do aluno (id) ou, pelo nome da questão, criada se faltar.
  if p_disciplina_id is not null then
    select id into v_disc from public.questao_disciplinas
     where id = p_disciplina_id and user_id = v_uid;
  end if;
  if v_disc is null and v_nome is not null then
    insert into public.questao_disciplinas (user_id, nome)
    values (v_uid, v_nome)
    on conflict (user_id, nome_normalizado) do update set nome = public.questao_disciplinas.nome
    returning id into v_disc;
  end if;

  insert into public.study_sessions
    (user_id, disciplina_catalogo_id, mode, origem, started_at, ended_at, duration_seconds)
  values
    (v_uid, v_disc, 'manual', p_origem, now() - make_interval(secs => v_seg), now(), v_seg);

  return 'ok';
end $$;

revoke execute on function public.registrar_tempo_auto(text, integer, uuid, text) from public, anon;
grant  execute on function public.registrar_tempo_auto(text, integer, uuid, text) to authenticated;

commit;
