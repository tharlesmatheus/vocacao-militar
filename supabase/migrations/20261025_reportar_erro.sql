-- =====================================================================
-- "Reportar erro" nas questões: o aluno descreve o problema (gabarito,
-- enunciado, alternativas...) e o admin resolve em Admin > Erros reportados.
-- O aluno só envia pela função reportar_erro_questao (valida acesso à
-- questão, limita 20 por dia e não duplica o mesmo aviso em aberto).
-- =====================================================================
begin;

create table if not exists public.questao_reportes (
  id            uuid primary key default gen_random_uuid(),
  questao_id    uuid not null references public.questoes(id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo          text not null check (tipo in ('gabarito', 'enunciado', 'alternativas', 'desatualizada',
                                              'comentario', 'classificacao', 'outro')),
  motivo        text not null check (length(btrim(motivo)) between 5 and 1000),
  status        text not null default 'aberto' check (status in ('aberto', 'resolvido', 'descartado')),
  resposta      text check (resposta is null or length(resposta) <= 1000),
  resolvido_por uuid references auth.users(id) on delete set null,
  resolvido_em  timestamptz,
  created_at    timestamptz not null default now()
);
-- Um aviso em aberto por aluno e questão (enviar de novo atualiza o texto).
create unique index if not exists uq_questao_reportes_aberto
  on public.questao_reportes (questao_id, user_id) where status = 'aberto';
create index if not exists idx_questao_reportes_status on public.questao_reportes (status, created_at desc);
create index if not exists idx_questao_reportes_usuario on public.questao_reportes (user_id, created_at desc);

alter table public.questao_reportes enable row level security;
drop policy if exists questao_reportes_select_proprio on public.questao_reportes;
drop policy if exists questao_reportes_admin on public.questao_reportes;
create policy questao_reportes_select_proprio on public.questao_reportes
  for select to authenticated using (user_id = (select auth.uid()));
create policy questao_reportes_admin on public.questao_reportes
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'is_admin') = 'true')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'is_admin') = 'true');
revoke all on public.questao_reportes from anon;
grant select on public.questao_reportes to authenticated;
grant all on public.questao_reportes to service_role;

create or replace function public.reportar_erro_questao(p_questao uuid, p_tipo text, p_motivo text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if v_uid is null then
    raise exception 'Entre na sua conta para reportar.' using errcode = '28000';
  end if;
  if p_tipo not in ('gabarito', 'enunciado', 'alternativas', 'desatualizada', 'comentario', 'classificacao', 'outro') then
    raise exception 'Tipo de erro inválido.' using errcode = '22023';
  end if;
  if length(v_motivo) < 5 or length(v_motivo) > 1000 then
    raise exception 'Descreva o erro (de 5 a 1000 caracteres).' using errcode = '22023';
  end if;
  if not exists (select 1 from public.questoes q
                 where q.id = p_questao
                   and (q.user_id = v_uid or (q.origem = 'ACERVO' and not q.oculta))) then
    raise exception 'Questão não encontrada.' using errcode = 'P0002';
  end if;
  if (select count(*) from public.questao_reportes
      where user_id = v_uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Você já enviou muitos avisos hoje. Tente amanhã.' using errcode = '54000';
  end if;

  insert into public.questao_reportes (questao_id, user_id, tipo, motivo)
  values (p_questao, v_uid, p_tipo, v_motivo)
  on conflict (questao_id, user_id) where status = 'aberto'
  do update set tipo = excluded.tipo, motivo = excluded.motivo, created_at = now();
  return 'ok';
end;
$$;

revoke execute on function public.reportar_erro_questao(uuid, text, text) from public, anon;
grant execute on function public.reportar_erro_questao(uuid, text, text) to authenticated;

commit;
