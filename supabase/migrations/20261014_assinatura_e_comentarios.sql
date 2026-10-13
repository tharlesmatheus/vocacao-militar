-- =====================================================================
-- Assinatura (Kiwify) + comentários das questões
--
-- Rodar DEPOIS de 20261013_acervo_compartilhado.sql e 20261013b_acervo_consultas.sql.
-- Pode ser executado mais de uma vez.
--
-- Regras de acesso:
--   * O banco de questões (acervo) só aparece para quem tem assinatura ativa
--     (ou é administrador). As questões próprias do aluno continuam dele.
--   * A tabela planos só é alterada pelo servidor (webhook da Kiwify). O aluno
--     apenas lê o próprio plano.
--   * Assinatura cancelada continua valendo até o fim do período pago
--     (access_until). Reembolso e chargeback cortam o acesso na hora.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. Planos e eventos da Kiwify
-- ---------------------------------------------------------------------
alter table public.planos
  add column if not exists user_id          uuid,
  add column if not exists access_until     timestamptz,
  add column if not exists proximo_pagamento timestamptz,
  add column if not exists subscription_id  text,
  add column if not exists ultimo_evento    text,
  add column if not exists ultimo_evento_em timestamptz,
  add column if not exists updated_at       timestamptz default now();

create index if not exists idx_planos_user_id on public.planos (user_id);
create index if not exists idx_planos_email_lower on public.planos (lower(email));

create table if not exists public.kiwify_events (
  id              bigserial primary key,
  event_key       text not null unique,
  order_id        text,
  subscription_id text,
  event           text,
  email           text,
  created_at      timestamptz not null default now()
);
alter table public.kiwify_events
  add column if not exists payload  jsonb,
  add column if not exists aplicado boolean,
  add column if not exists motivo   text;

-- RLS: aluno só LÊ o próprio plano; ninguém escreve pelo navegador.
alter table public.planos enable row level security;
alter table public.kiwify_events enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname, tablename from pg_policies
             where schemaname = 'public' and tablename in ('planos', 'kiwify_events')
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

create policy planos_select_proprio on public.planos
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );
-- kiwify_events: sem políticas = inacessível pelo navegador (só a service role).

-- ---------------------------------------------------------------------
-- 2. Quem tem acesso
-- ---------------------------------------------------------------------
create or replace function public.assinatura_ativa_de(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (select 1 from auth.users u
            where u.id = p_user and (u.raw_app_meta_data ->> 'is_admin') = 'true')
    or exists (
      select 1
      from public.planos p
      join auth.users u on u.id = p_user
      where (p.user_id = p_user or lower(p.email) = lower(u.email))
        and (
          -- ativo: vale até access_until + 3 dias de tolerância para a renovação chegar
          (p.status = 'ativo' and (p.access_until is null or p.access_until > now() - interval '3 days'))
          -- cancelado/atrasado: vale até o fim do período já pago
          or p.access_until > now()
        )
    )
$$;

create or replace function public.assinatura_ativa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.assinatura_ativa_de((select auth.uid()))
$$;

-- Usado pelo webhook para ligar a compra à conta pelo e-mail.
create or replace function public.usuario_id_por_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1
$$;

revoke execute on function public.assinatura_ativa_de(uuid)    from public, anon, authenticated;
revoke execute on function public.usuario_id_por_email(text)  from public, anon, authenticated;
revoke execute on function public.assinatura_ativa()          from public, anon;
grant  execute on function public.assinatura_ativa_de(uuid)    to service_role;
grant  execute on function public.usuario_id_por_email(text)  to service_role;
grant  execute on function public.assinatura_ativa()          to authenticated, service_role;

-- O acervo passa a exigir assinatura.
drop policy if exists questoes_select_own_or_acervo on public.questoes;
create policy questoes_select_own_or_acervo on public.questoes
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (user_id = (select public.acervo_owner_id()) and (select public.assinatura_ativa()))
  );

-- ---------------------------------------------------------------------
-- 3. Comentários das questões
--    autor_tipo = 'PLATAFORMA' -> exibido como "Vocação Militar" (1 por questão)
--    autor_tipo = 'ALUNO'      -> comentários dos alunos
-- ---------------------------------------------------------------------
create table if not exists public.questao_comentarios (
  id          uuid primary key default gen_random_uuid(),
  questao_id  uuid not null references public.questoes(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  autor_tipo  text not null check (autor_tipo in ('PLATAFORMA', 'ALUNO')),
  autor_nome  text not null default '',
  texto       text not null default '',
  status      text not null default 'publicado'
              check (status in ('gerando', 'publicado', 'oculto', 'falhou')),
  revisar     boolean not null default false,   -- conteúdo marcado para revisão do admin
  modelo      text,                              -- uso interno (nunca exibido ao aluno)
  gerado_por  uuid,                              -- aluno que disparou a geração (limite diário)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint questao_comentarios_texto_ok check (
    status <> 'publicado' or length(btrim(texto)) between 1 and 6000
  )
);

-- Garante UM comentário da plataforma por questão, mesmo com cliques simultâneos.
create unique index if not exists uq_questao_comentarios_plataforma
  on public.questao_comentarios (questao_id) where autor_tipo = 'PLATAFORMA';
create index if not exists idx_questao_comentarios_questao
  on public.questao_comentarios (questao_id, created_at);
create index if not exists idx_questao_comentarios_gerado_por
  on public.questao_comentarios (gerado_por, created_at) where autor_tipo = 'PLATAFORMA';

-- Nome do autor vem do cadastro (o aluno não escolhe o nome que aparece).
create or replace function public.questao_comentarios_preparar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome text;
begin
  if new.autor_tipo = 'ALUNO' then
    select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'nome'), ''), split_part(u.email, '@', 1))
      into v_nome
      from auth.users u where u.id = new.user_id;
    new.autor_nome := left(coalesce(v_nome, 'Aluno'), 80);
    new.texto := btrim(new.texto);
  else
    new.autor_nome := 'Vocação Militar';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_questao_comentarios_preparar on public.questao_comentarios;
create trigger trg_questao_comentarios_preparar
  before insert or update on public.questao_comentarios
  for each row execute function public.questao_comentarios_preparar();

alter table public.questao_comentarios enable row level security;

drop policy if exists questao_comentarios_select on public.questao_comentarios;
drop policy if exists questao_comentarios_insert_aluno on public.questao_comentarios;
drop policy if exists questao_comentarios_update_aluno on public.questao_comentarios;
drop policy if exists questao_comentarios_delete_aluno on public.questao_comentarios;
drop policy if exists questao_comentarios_admin on public.questao_comentarios;

-- Lê comentários publicados das questões que ele pode ver (o RLS de questoes decide).
create policy questao_comentarios_select on public.questao_comentarios
  for select to authenticated
  using (
    status = 'publicado'
    and exists (select 1 from public.questoes q where q.id = questao_comentarios.questao_id)
  );

create policy questao_comentarios_insert_aluno on public.questao_comentarios
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and autor_tipo = 'ALUNO'
    and status = 'publicado'
    and revisar = false
    and gerado_por is null
    and exists (select 1 from public.questoes q where q.id = questao_comentarios.questao_id)
  );

create policy questao_comentarios_update_aluno on public.questao_comentarios
  for update to authenticated
  using (user_id = (select auth.uid()) and autor_tipo = 'ALUNO')
  with check (user_id = (select auth.uid()) and autor_tipo = 'ALUNO' and status = 'publicado' and revisar = false);

create policy questao_comentarios_delete_aluno on public.questao_comentarios
  for delete to authenticated
  using (user_id = (select auth.uid()) and autor_tipo = 'ALUNO');

-- Administrador vê tudo (inclusive ocultos e marcados para revisão) e modera.
create policy questao_comentarios_admin on public.questao_comentarios
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'is_admin') = 'true')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'is_admin') = 'true');

-- Denúncias de comentários
create table if not exists public.questao_comentario_denuncias (
  id            uuid primary key default gen_random_uuid(),
  comentario_id uuid not null references public.questao_comentarios(id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  motivo        text not null default '' check (length(motivo) <= 500),
  created_at    timestamptz not null default now(),
  unique (comentario_id, user_id)
);
alter table public.questao_comentario_denuncias enable row level security;
drop policy if exists denuncias_insert_propria on public.questao_comentario_denuncias;
drop policy if exists denuncias_select_propria on public.questao_comentario_denuncias;
drop policy if exists denuncias_admin on public.questao_comentario_denuncias;
create policy denuncias_insert_propria on public.questao_comentario_denuncias
  for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.questao_comentarios c where c.id = comentario_id));
create policy denuncias_select_propria on public.questao_comentario_denuncias
  for select to authenticated using (user_id = (select auth.uid()));
create policy denuncias_admin on public.questao_comentario_denuncias
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'is_admin') = 'true')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'is_admin') = 'true');

grant select, insert, update, delete on public.questao_comentarios to authenticated;
grant select, insert on public.questao_comentario_denuncias to authenticated;
revoke all on public.questao_comentarios, public.questao_comentario_denuncias from anon;

-- As explicações que já existem viram o comentário da plataforma dessas questões.
insert into public.questao_comentarios (questao_id, autor_tipo, texto, status, modelo)
select q.id, 'PLATAFORMA', btrim(q.explicacao), 'publicado', 'importado'
from public.questoes q
where q.origem = 'ACERVO' and length(btrim(coalesce(q.explicacao, ''))) > 0
on conflict do nothing;

commit;
