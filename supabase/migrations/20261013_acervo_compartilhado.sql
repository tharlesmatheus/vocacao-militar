-- =====================================================================
-- Acervo compartilhado de questões (Vocação)
--
-- Objetivo: as questões publicadas pelo VM3 ficam num "acervo" que todo
-- usuário autenticado pode LER. As questões, os catálogos, as tentativas,
-- os cadernos e os flashcards de cada usuário continuam privados.
--
-- Modelo: o acervo pertence a um usuário técnico (conta que nunca faz
-- login). Assim, as chaves estrangeiras compostas (catálogo + user_id) e os
-- índices únicos existentes continuam valendo sem nenhuma alteração.
--
-- ANTES DE RODAR:
--   1. Supabase > Authentication > Users > Add user > Create new user
--      e-mail: acervo@vocacao.interno  (senha longa aleatória; marque
--      "Auto Confirm User"). Ninguém fará login com essa conta.
--   2. Se usar outro e-mail, troque-o na função acervo_owner_id() abaixo.
--
-- Pode ser executado mais de uma vez (idempotente).
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. Dono do acervo
-- ---------------------------------------------------------------------
create or replace function public.acervo_owner_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where email = 'acervo@vocacao.interno' limit 1
$$;

comment on function public.acervo_owner_id() is
  'UUID do usuário técnico dono do acervo compartilhado de questões.';

do $$
begin
  if public.acervo_owner_id() is null then
    raise exception 'Crie primeiro o usuário acervo@vocacao.interno em Authentication > Users.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Procedência das questões (permite republicar sem duplicar)
-- ---------------------------------------------------------------------
alter table public.questoes
  add column if not exists origem     text not null default 'USUARIO',
  add column if not exists origem_ref text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'questoes_origem_ref_key') then
    alter table public.questoes add constraint questoes_origem_ref_key unique (origem_ref);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'questoes_origem_check') then
    alter table public.questoes add constraint questoes_origem_check
      check (origem in ('USUARIO', 'ACERVO'));
  end if;
end $$;

create index if not exists idx_questoes_origem on public.questoes (origem);

-- ---------------------------------------------------------------------
-- 3. RLS em questoes (HOJE ESTÁ DESLIGADO: qualquer pessoa com a chave
--    pública do site consegue ler, alterar e apagar todas as questões)
-- ---------------------------------------------------------------------
alter table public.questoes enable row level security;

drop policy if exists questoes_select_own_or_acervo on public.questoes;
drop policy if exists questoes_insert_own on public.questoes;
drop policy if exists questoes_update_own on public.questoes;
drop policy if exists questoes_delete_own on public.questoes;

create policy questoes_select_own_or_acervo on public.questoes
  for select to authenticated
  using (user_id = (select auth.uid()) or user_id = (select public.acervo_owner_id()));

create policy questoes_insert_own on public.questoes
  for insert to authenticated
  with check (user_id = (select auth.uid()) and origem = 'USUARIO');

create policy questoes_update_own on public.questoes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and origem = 'USUARIO');

create policy questoes_delete_own on public.questoes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 4. Catálogos: o usuário lê os próprios + os do acervo; escreve só os próprios
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['questao_instituicoes','questao_cargos','questao_bancas',
                           'questao_disciplinas','questao_assuntos']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_own_rows', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_own_or_acervo', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);

    execute format($f$create policy %I on public.%I for select to authenticated
      using (user_id = (select auth.uid()) or user_id = (select public.acervo_owner_id()))$f$,
      t || '_select_own_or_acervo', t);
    execute format($f$create policy %I on public.%I for insert to authenticated
      with check (user_id = (select auth.uid()))$f$, t || '_insert_own', t);
    execute format($f$create policy %I on public.%I for update to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$f$,
      t || '_update_own', t);
    execute format($f$create policy %I on public.%I for delete to authenticated
      using (user_id = (select auth.uid()))$f$, t || '_delete_own', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. Tentativas e cadernos podem apontar para questões do acervo
-- ---------------------------------------------------------------------
drop policy if exists question_attempts_insert_own on public.question_attempts;
create policy question_attempts_insert_own on public.question_attempts
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.questoes q
      where q.id = question_attempts.questao_id
        and (q.user_id = (select auth.uid()) or q.user_id = (select public.acervo_owner_id()))
    )
  );

-- Antes só conferia o user_id; agora também exige que a questão seja visível.
drop policy if exists "insert own" on public.caderno_itens;
create policy "insert own" on public.caderno_itens
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.questoes q
      where q.id = caderno_itens.questao_id
        and (q.user_id = (select auth.uid()) or q.user_id = (select public.acervo_owner_id()))
    )
  );

commit;

-- Conferência rápida (opcional):
-- select public.acervo_owner_id();
-- select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by 1, 2;
