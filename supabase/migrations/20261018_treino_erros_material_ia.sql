-- =============================================================================
-- 20261018 — Treino de erros (questão "recuperada"), "Acertei no chute",
--            flashcard/resumo gerado a partir da questão (limite diário de IA).
--
-- Rode no SQL Editor do Supabase ANTES de publicar o código novo.
-- Idempotente (pode rodar de novo).
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1. Caderno de erros: progresso de recuperação
--    Uma questão errada sai do caderno ativo quando o aluno acerta 2 vezes
--    seguidas; errou de novo, volta. O tipo 'ACERTOS' passa a ser exibido como
--    "Acertei no chute" (o valor no banco não muda, nada se perde).
-- -----------------------------------------------------------------------------
alter table public.caderno_itens add column if not exists acertos_seguidos smallint not null default 0;
alter table public.caderno_itens add column if not exists recuperada_em timestamptz;
alter table public.caderno_itens add column if not exists ultima_tentativa_em timestamptz;

create index if not exists idx_caderno_itens_ativos
  on public.caderno_itens (user_id, tipo) where recuperada_em is null;

-- Registra o resultado de uma questão que está no caderno de erros do aluno.
-- Chamada depois de cada "Conferir resposta" (Questões, Cadernos, Simulados).
create or replace function public.registrar_treino_caderno(p_questao uuid, p_acertou boolean)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v public.caderno_itens%rowtype;
begin
  update public.caderno_itens c
     set acertos_seguidos   = case when p_acertou then least(c.acertos_seguidos + 1, 100) else 0 end,
         ultima_tentativa_em = now(),
         recuperada_em      = case
                                when not p_acertou then null
                                when c.recuperada_em is not null then c.recuperada_em
                                when c.acertos_seguidos + 1 >= 2 then now()
                                else null
                              end
   where c.user_id = auth.uid() and c.questao_id = p_questao and c.tipo = 'ERROS'
  returning * into v;

  if not found then
    return jsonb_build_object('no_caderno', false);
  end if;
  return jsonb_build_object(
    'no_caderno', true,
    'acertos_seguidos', v.acertos_seguidos,
    'recuperada', v.recuperada_em is not null
  );
end $$;

-- Números da página Cadernos (por tipo).
create or replace function public.resumo_cadernos()
returns jsonb
language sql stable security invoker set search_path = public as $$
  with c as (
    select * from public.caderno_itens where user_id = auth.uid()
  ),
  pend as (
    select count(*)::int as n
    from c
    where c.tipo = 'ERROS' and c.recuperada_em is null
      and exists (
        select 1 from public.review_progress r
        where r.user_id = auth.uid() and r.method = 'CADERNO' and r.item_id = c.questao_id
          and r.next_review is not null
          and r.next_review::date <= (now() at time zone 'America/Sao_Paulo')::date)
  )
  select jsonb_build_object(
    'erros_ativos',  (select count(*) from c where tipo = 'ERROS' and recuperada_em is null),
    'recuperadas',   (select count(*) from c where tipo = 'ERROS' and recuperada_em is not null),
    'erros_total',   (select count(*) from c where tipo = 'ERROS'),
    'chute',         (select count(*) from c where tipo = 'ACERTOS'),
    'para_revisar',  (select n from pend)
  )
$$;

-- -----------------------------------------------------------------------------
-- 2. Flashcard / resumo gerado da questão
-- -----------------------------------------------------------------------------
alter table if exists public.resumos add column if not exists questao_origem_id uuid;
create index if not exists idx_resumos_questao_origem on public.resumos (user_id, questao_origem_id)
  where questao_origem_id is not null;
create index if not exists idx_flashcards_questao_origem on public.flashcards (user_id, questao_origem_id)
  where questao_origem_id is not null;

-- Cada geração com IA (inclusive "gerar de novo") conta no limite diário do aluno.
create table if not exists public.ia_geracoes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  tipo        text not null check (tipo in ('FLASHCARD', 'RESUMO')),
  questao_id  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists idx_ia_geracoes_user_dia on public.ia_geracoes (user_id, created_at desc);

alter table public.ia_geracoes enable row level security;
drop policy if exists ia_geracoes_select_own on public.ia_geracoes;
create policy ia_geracoes_select_own on public.ia_geracoes for select to authenticated
  using (user_id = (select auth.uid()));
-- Inserções só pelo servidor (service_role), que controla o limite.

-- -----------------------------------------------------------------------------
-- 3. Permissões
-- -----------------------------------------------------------------------------
revoke execute on function public.registrar_treino_caderno(uuid, boolean) from public, anon;
revoke execute on function public.resumo_cadernos() from public, anon;
grant  execute on function public.registrar_treino_caderno(uuid, boolean) to authenticated;
grant  execute on function public.resumo_cadernos() to authenticated;
grant  select on public.ia_geracoes to authenticated;
grant  all    on public.ia_geracoes to service_role;

commit;
