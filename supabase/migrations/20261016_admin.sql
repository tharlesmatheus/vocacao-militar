-- =====================================================================
-- Painel administrativo
--   * questoes.oculta: o admin tira uma questão do acervo sem apagá-la
--     (tentativas e cadernos dos alunos continuam íntegros).
--   * Alunos não cadastram mais questões: só o admin, pelo servidor.
--   * Denúncias ganham "resolvida" para a fila de moderação.
-- Pode ser executado mais de uma vez.
-- =====================================================================
begin;

alter table public.questoes
  add column if not exists oculta boolean not null default false;
create index if not exists idx_questoes_oculta on public.questoes (oculta) where oculta;

-- Questão oculta some para os alunos (o admin acessa pelo servidor).
drop policy if exists questoes_select_own_or_acervo on public.questoes;
create policy questoes_select_own_or_acervo on public.questoes
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      user_id = (select public.acervo_owner_id())
      and not oculta
      and (select public.assinatura_ativa())
    )
  );

-- Cadastro de questões passa a ser exclusivo do admin (rota /api/admin/questoes,
-- com a service role). O aluno continua editando/apagando as próprias antigas.
drop policy if exists questoes_insert_own on public.questoes;

alter table public.questao_comentario_denuncias
  add column if not exists resolvida boolean not null default false;
create index if not exists idx_denuncias_pendentes
  on public.questao_comentario_denuncias (created_at) where not resolvida;

create index if not exists idx_comentarios_revisar
  on public.questao_comentarios (created_at) where revisar;

commit;
