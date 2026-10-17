-- =====================================================================
-- Comentários "Por Vocação Militar" em lote pela OpenAI Batch API.
--
-- O painel admin escolhe instituições (ex.: PM PE, PC PE), o servidor manda
-- as questões sem comentário para a fila da OpenAI e, quando o lote fica
-- pronto (minutos a 24 h), importa os textos. Tudo só pelo service_role.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. Registro dos lotes enviados
-- ---------------------------------------------------------------------
create table if not exists public.comentario_lotes (
  id            uuid primary key default gen_random_uuid(),
  batch_id      text not null unique,          -- id do lote na OpenAI
  modelo        text not null,
  instituicoes  text[] not null default '{}',
  total         integer not null default 0,    -- questões enviadas
  status        text not null default 'enviado',
  importados    integer not null default 0,
  ignorados     integer not null default 0,    -- já tinham comentário na hora de importar
  falhas        integer not null default 0,
  erro          text,
  criado_por    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_comentario_lotes_criado on public.comentario_lotes (created_at desc);

-- Sem políticas: só o servidor (service_role) lê e escreve.
alter table public.comentario_lotes enable row level security;
revoke all on public.comentario_lotes from public, anon, authenticated;
grant select, insert, update on public.comentario_lotes to service_role;

-- ---------------------------------------------------------------------
-- 2. Quantas questões de cada instituição já têm comentário
-- ---------------------------------------------------------------------
create or replace function public.comentarios_por_instituicao(p_instituicoes text[])
returns table (instituicao text, total bigint, com_comentario bigint)
language sql stable security definer set search_path = public as $$
  select q.instituicao, count(*)::bigint, count(c.id)::bigint
  from public.questoes q
  left join public.questao_comentarios c
         on c.questao_id = q.id and c.autor_tipo = 'PLATAFORMA' and c.status in ('publicado', 'oculto')
  where q.origem = 'ACERVO' and not q.oculta
    and q.instituicao = any (p_instituicoes)
  group by q.instituicao
  order by 2 desc
$$;

-- ---------------------------------------------------------------------
-- 3. Questões sem comentário dessas instituições (para montar o lote)
-- ---------------------------------------------------------------------
create or replace function public.questoes_sem_comentario_inst(p_instituicoes text[], p_limite integer default 1000)
returns setof uuid
language sql stable security definer set search_path = public as $$
  select q.id
  from public.questoes q
  where q.origem = 'ACERVO' and not q.oculta
    and q.instituicao = any (p_instituicoes)
    and not exists (select 1 from public.questao_comentarios c
                    where c.questao_id = q.id and c.autor_tipo = 'PLATAFORMA'
                      and c.status in ('publicado', 'oculto', 'gerando'))
  order by q.id
  limit least(greatest(coalesce(p_limite, 1000), 1), 5000)
$$;

-- ---------------------------------------------------------------------
-- 4. Grava os comentários do lote de uma vez.
--    Questão que já ganhou comentário enquanto o lote rodava fica como está;
--    só substitui uma tentativa que falhou.
-- ---------------------------------------------------------------------
create or replace function public.inserir_comentarios_lote(p_itens jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  insert into public.questao_comentarios (questao_id, autor_tipo, texto, status, revisar, modelo)
  select i.questao_id, 'PLATAFORMA', i.texto, 'publicado', coalesce(i.revisar, false), i.modelo
  from jsonb_to_recordset(p_itens) as i(questao_id uuid, texto text, revisar boolean, modelo text)
  where exists (select 1 from public.questoes q where q.id = i.questao_id)
    and length(btrim(coalesce(i.texto, ''))) between 1 and 6000
  on conflict (questao_id) where autor_tipo = 'PLATAFORMA'
  do update set texto = excluded.texto, status = 'publicado', revisar = excluded.revisar,
                modelo = excluded.modelo, updated_at = now()
     where questao_comentarios.status = 'falhou';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.comentarios_por_instituicao(text[])          from public, anon, authenticated;
revoke execute on function public.questoes_sem_comentario_inst(text[], integer) from public, anon, authenticated;
revoke execute on function public.inserir_comentarios_lote(jsonb)              from public, anon, authenticated;
grant execute on function public.comentarios_por_instituicao(text[])           to service_role;
grant execute on function public.questoes_sem_comentario_inst(text[], integer)  to service_role;
grant execute on function public.inserir_comentarios_lote(jsonb)               to service_role;

commit;
