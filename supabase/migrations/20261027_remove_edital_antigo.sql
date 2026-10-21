-- =============================================================================
-- 20261027 — Remove o edital antigo (tabelas editais, materias, assuntos).
--
-- O edital agora é automático (editais_alvo, 20261026). O antigo só servia para
-- o contador "visto_count", que três funções do banco ainda atualizavam:
--   • complete_review          -> reescrita igual, sem o contador;
--   • fn_after_resumo_insert   -> gatilho do sistema de revisão antigo (tabela
--     revisoes, que o app não lê mais): removido;
--   • fn_after_revisao_update  -> idem: removido.
-- As colunas materia_id/assunto_id/edital_id das outras tabelas continuam
-- (com os valores antigos), só perdem a chave estrangeira.
--
-- Rode DEPOIS de publicar o site sem as leituras do edital antigo.
-- Sem CASCADE de propósito: se aparecer qualquer outra dependência que não
-- conhecemos, o comando falha e nada é apagado.
-- =============================================================================
begin;

-- 1. Gatilhos do sistema de revisão antigo.
drop trigger if exists trg_after_resumo_insert on public.resumos;
do $$ begin
  if to_regclass('public.revisoes') is not null then
    execute 'drop trigger if exists trg_after_revisao_update on public.revisoes';
  end if;
end $$;
drop function if exists public.fn_after_resumo_insert();
drop function if exists public.fn_after_revisao_update();

-- 2. Revisão concluída: igual a antes, sem atualizar assuntos.visto_count.
create or replace function public.complete_review(
  p_method text, p_item_id uuid, p_result text default null, p_duration_seconds integer default 0)
returns table(next_stage integer, next_review date, review_count integer)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
    v_uid uuid;
    v_progress public.review_progress%rowtype;
    v_intervals integer[];
    v_len integer;
    v_current_stage integer;
    v_next_stage integer;
    v_days integer;
    v_next_date date;
    v_new_count integer;
begin
    v_uid := auth.uid();

    if v_uid is null then
        raise exception 'Usuário não autenticado.';
    end if;

    if p_method not in ('CADERNO', 'FLASHCARD', 'RESUMO') then
        raise exception 'Método de revisão inválido.';
    end if;

    select *
      into v_progress
      from public.review_progress
     where user_id = v_uid
       and method = p_method
       and item_id = p_item_id
     for update;

    if not found then
        raise exception 'Progresso de revisão não encontrado para este item.';
    end if;

    select intervals_days
      into v_intervals
      from public.review_method_settings
     where user_id = v_uid
       and method = p_method;

    if v_intervals is null or cardinality(v_intervals) < 1 then
        v_intervals := array[1,7,15,30,90]::integer[];
    end if;

    v_len := cardinality(v_intervals);

    -- se a configuração foi reduzida, prende a etapa à última existente
    v_current_stage := greatest(1, least(v_progress.etapa, v_len));

    if v_current_stage < v_len then
        v_next_stage := v_current_stage + 1;
    else
        v_next_stage := v_current_stage;
    end if;

    v_days := greatest(1, coalesce(v_intervals[v_next_stage], v_intervals[v_len], 1));
    v_next_date := current_date + v_days;
    v_new_count := v_progress.review_count + 1;

    update public.review_progress
       set etapa = v_next_stage,
           review_count = v_new_count,
           next_review = v_next_date,
           last_reviewed_at = now(),
           updated_at = now()
     where id = v_progress.id;

    -- materia_id/assunto_id eram do edital antigo: não grava mais.
    insert into public.review_history (
        user_id, method, item_id, materia_id, assunto_id,
        etapa_before, etapa_after, resultado, duration_seconds, reviewed_at
    )
    values (
        v_uid, p_method, p_item_id, null, null,
        v_current_stage, v_next_stage,
        nullif(trim(coalesce(p_result, '')), ''),
        greatest(0, coalesce(p_duration_seconds, 0)),
        now()
    );

    -- Caderno de erros: registra também a tentativa da questão.
    if p_method = 'CADERNO' and p_result in ('ACERTO', 'ERRO') then
        insert into public.question_attempts (user_id, questao_id, resultado, is_revisao, created_at)
        values (v_uid, p_item_id, p_result, true, now());
    end if;

    return query
    select v_next_stage, v_next_date, v_new_count;
end;
$function$;

-- 3. Chaves estrangeiras que apontam para o edital antigo.
alter table if exists public.resumos           drop constraint if exists resumos_edital_id_fkey,
                                                drop constraint if exists resumos_materia_id_fkey,
                                                drop constraint if exists resumos_assunto_id_fkey;
alter table if exists public.flashcards        drop constraint if exists flashcards_edital_id_fkey,
                                                drop constraint if exists flashcards_materia_id_fkey,
                                                drop constraint if exists flashcards_assunto_id_fkey;
alter table if exists public.questoes          drop constraint if exists questoes_edital_id_fkey,
                                                drop constraint if exists questoes_materia_id_fkey,
                                                drop constraint if exists questoes_assunto_id_fkey;
alter table if exists public.pomodoro_sessions drop constraint if exists pomodoro_sessions_edital_id_fkey,
                                                drop constraint if exists pomodoro_sessions_materia_id_fkey,
                                                drop constraint if exists pomodoro_sessions_assunto_id_fkey;
alter table if exists public.study_sessions    drop constraint if exists study_sessions_materia_id_fkey,
                                                drop constraint if exists study_sessions_assunto_id_fkey;
alter table if exists public.review_progress   drop constraint if exists review_progress_materia_id_fkey,
                                                drop constraint if exists review_progress_assunto_id_fkey;
alter table if exists public.review_history    drop constraint if exists review_history_materia_id_fkey,
                                                drop constraint if exists review_history_assunto_id_fkey;

-- 4. As tabelas (assuntos -> materias -> editais, por causa das chaves entre elas).
drop table if exists public.assuntos;
drop table if exists public.materias;
drop table if exists public.editais;

commit;
