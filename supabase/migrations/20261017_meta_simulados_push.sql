-- =============================================================================
-- 20261017 — Meta do aluno (concurso alvo), boas-vindas, simulados,
--            lembretes no celular (Web Push) e comentários em lote (admin).
--
-- Rode no SQL Editor do Supabase. É idempotente (pode rodar de novo).
-- Depende de: 20261013* (acervo), 20261014 (assinatura), 20261016 (oculta).
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1. Perfil do aluno: meta e boas-vindas
-- -----------------------------------------------------------------------------
create table if not exists public.aluno_perfil (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  meta_instituicao        text,
  meta_cargo              text,          -- null = todos os cargos da instituição
  meta_definida_em        timestamptz,
  boas_vindas_ocultas_em  timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint aluno_perfil_meta_ok check (meta_cargo is null or meta_instituicao is not null)
);

alter table public.aluno_perfil enable row level security;

drop policy if exists aluno_perfil_select on public.aluno_perfil;
create policy aluno_perfil_select on public.aluno_perfil for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists aluno_perfil_insert on public.aluno_perfil;
create policy aluno_perfil_insert on public.aluno_perfil for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists aluno_perfil_update on public.aluno_perfil;
create policy aluno_perfil_update on public.aluno_perfil for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function public.aluno_perfil_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_aluno_perfil_touch on public.aluno_perfil;
create trigger trg_aluno_perfil_touch before update on public.aluno_perfil
  for each row execute function public.aluno_perfil_touch();

-- Índice para os filtros por meta (instituição + cargo) no acervo.
create index if not exists idx_questoes_acervo_meta
  on public.questoes (instituicao, cargo) where origem = 'ACERVO' and not oculta;

-- Instituições/cargos que existem no acervo (para o seletor de meta).
-- security definer: a lista de nomes não é sensível e precisa aparecer mesmo
-- antes de o pagamento ser confirmado.
create or replace function public.metas_disponiveis()
returns table (instituicao text, cargo text, total bigint)
language sql stable security definer set search_path = public as $$
  select q.instituicao, q.cargo, count(*)::bigint
  from public.questoes q
  where q.origem = 'ACERVO' and not q.oculta
    and coalesce(q.instituicao, '') <> '' and coalesce(q.cargo, '') <> ''
  group by q.instituicao, q.cargo
  order by count(*) desc, q.instituicao, q.cargo
$$;

-- Painel da meta: total de questões, respondidas, acertos (última tentativa
-- de cada questão) e o mesmo por disciplina. security invoker: obedece ao RLS.
create or replace function public.painel_meta()
returns jsonb
language sql stable security invoker set search_path = public as $$
  with p as (
    select meta_instituicao as i, meta_cargo as c
    from public.aluno_perfil where user_id = auth.uid()
  ),
  q as (
    select qq.id, coalesce(nullif(qq.disciplina, ''), 'Sem disciplina') as disciplina
    from public.questoes qq, p
    where p.i is not null and qq.origem = 'ACERVO'
      and qq.instituicao = p.i and (p.c is null or qq.cargo = p.c)
  ),
  t as (
    select distinct on (a.questao_id) a.questao_id, a.resultado
    from public.question_attempts a
    join q on q.id = a.questao_id
    where a.user_id = auth.uid()
    order by a.questao_id, a.created_at desc
  ),
  d as (
    select q.disciplina,
           count(*)::int                                           as total,
           count(t.questao_id)::int                                as respondidas,
           count(*) filter (where t.resultado = 'ACERTO')::int     as acertos
    from q left join t on t.questao_id = q.id
    group by q.disciplina
  )
  select jsonb_build_object(
    'instituicao', (select i from p),
    'cargo',       (select c from p),
    'total',       coalesce((select sum(total) from d), 0),
    'respondidas', coalesce((select sum(respondidas) from d), 0),
    'acertos',     coalesce((select sum(acertos) from d), 0),
    'disciplinas', coalesce((select jsonb_agg(jsonb_build_object(
                      'disciplina', disciplina, 'total', total,
                      'respondidas', respondidas, 'acertos', acertos) order by total desc) from d), '[]'::jsonb)
  )
$$;

-- -----------------------------------------------------------------------------
-- 2. Simulados
-- -----------------------------------------------------------------------------
create table if not exists public.simulados (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  titulo         text not null,
  instituicao    text,
  cargo          text,
  modalidade     text,                       -- 'MULTIPLA' | 'CERTO_ERRADO' | null (misto)
  chave_ranking  text not null,              -- quem é comparado com quem
  questao_ids    uuid[] not null,
  respostas      jsonb not null default '{}'::jsonb,   -- { "<questao_id>": "A" }
  duracao_seg    integer not null check (duracao_seg between 60 and 6 * 3600),
  iniciado_em    timestamptz not null default now(),
  expira_em      timestamptz not null,
  finalizado_em  timestamptz,
  total          integer not null,
  acertos        integer,
  erros          integer,
  nota           numeric(5, 2),              -- % de acerto (0–100)
  nota_liquida   integer,                    -- certo/errado: acertos − erros (estilo Cebraspe)
  created_at     timestamptz not null default now()
);

create index if not exists idx_simulados_user on public.simulados (user_id, created_at desc);
create index if not exists idx_simulados_ranking on public.simulados (chave_ranking, nota) where finalizado_em is not null;

alter table public.simulados enable row level security;
-- O aluno só LÊ os próprios simulados; criar, salvar e corrigir passa pelas
-- funções abaixo (a nota é calculada no banco, não no navegador).
drop policy if exists simulados_select_own on public.simulados;
create policy simulados_select_own on public.simulados for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.criar_simulado(
  p_instituicao text default null,
  p_cargo       text default null,
  p_modalidade  text default null,   -- 'MULTIPLA' | 'CERTO_ERRADO' | null
  p_quantidade  integer default 20,
  p_duracao_min integer default null
)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_qtd   integer := least(greatest(coalesce(p_quantidade, 20), 5), 100);
  v_inst  text := nullif(btrim(coalesce(p_instituicao, '')), '');
  v_cargo text := nullif(btrim(coalesce(p_cargo, '')), '');
  v_mod   text := case when p_modalidade in ('MULTIPLA', 'CERTO_ERRADO') then p_modalidade end;
  v_ids   uuid[];
  v_dur   integer;
  v_id    uuid;
  v_tit   text;
begin
  if v_uid is null then raise exception 'Faça login para criar um simulado.' using errcode = '28000'; end if;
  if not public.assinatura_ativa() then
    raise exception 'Os simulados fazem parte da assinatura.' using errcode = '42501';
  end if;
  -- Evita abuso: no máximo 10 simulados criados por dia.
  if (select count(*) from public.simulados where user_id = v_uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Limite de 10 simulados por dia atingido.' using errcode = '54000';
  end if;

  -- Sorteio: instituição + cargo; se faltar questão, só instituição.
  for tentativa in 1..2 loop
    select array_agg(id) into v_ids from (
      select q.id from public.questoes q
      where q.origem = 'ACERVO' and not q.oculta
        and (v_inst is null or q.instituicao = v_inst)
        and (v_cargo is null or q.cargo = v_cargo)
        and (v_mod is null
             or (v_mod = 'CERTO_ERRADO' and q.modalidade ilike '%certo%')
             or (v_mod = 'MULTIPLA' and q.modalidade not ilike '%certo%'))
      order by random()
      limit v_qtd
    ) s;
    exit when coalesce(array_length(v_ids, 1), 0) >= v_qtd or v_cargo is null;
    v_cargo := null;
  end loop;

  if coalesce(array_length(v_ids, 1), 0) < 5 then
    raise exception 'Não há questões suficientes para esse simulado. Tente outra instituição ou tipo.' using errcode = 'P0002';
  end if;

  -- Tempo padrão: 3 min por questão de múltipla escolha, 1,5 min por item certo/errado.
  v_dur := coalesce(p_duracao_min, ceil(array_length(v_ids, 1) * case when v_mod = 'CERTO_ERRADO' then 1.5 else 3 end)::int) * 60;
  v_dur := least(greatest(v_dur, 60), 6 * 3600);

  v_tit := concat_ws(' • ', coalesce(v_inst, 'Geral'), v_cargo, array_length(v_ids, 1) || ' questões');

  insert into public.simulados (user_id, titulo, instituicao, cargo, modalidade, chave_ranking,
                                questao_ids, duracao_seg, expira_em, total)
  values (v_uid, v_tit, v_inst, v_cargo, v_mod,
          concat_ws('|', coalesce(v_inst, 'GERAL'), coalesce(v_cargo, '*'), coalesce(v_mod, 'MISTO'), array_length(v_ids, 1)),
          v_ids, v_dur, now() + make_interval(secs => v_dur), array_length(v_ids, 1))
  returning id into v_id;

  return v_id;
end $$;

-- Questões do simulado na ordem sorteada. O gabarito só aparece depois de finalizado.
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
                'correta', case when s.finalizado_em is not null then q.correta end)
              order by u.ord)
       from unnest(s.questao_ids) with ordinality as u(qid, ord)
       join public.questoes q on q.id = u.qid), '[]'::jsonb))
  end
  from public.simulados s
  where s.id = p_id and s.user_id = auth.uid()
$$;

-- Salva as respostas durante a prova (para não perder se a aba fechar).
create or replace function public.salvar_respostas_simulado(p_id uuid, p_respostas jsonb)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  update public.simulados s
     set respostas = public._respostas_validas(s.questao_ids, p_respostas)
   where s.id = p_id and s.user_id = auth.uid()
     and s.finalizado_em is null
     and now() <= s.expira_em + interval '2 minutes';
end $$;

-- Mantém só pares { questao_do_simulado: letra A–E/C/E }.
create or replace function public._respostas_validas(p_ids uuid[], p_respostas jsonb)
returns jsonb
language sql immutable set search_path = public as $$
  select coalesce(jsonb_object_agg(k, upper(v)), '{}'::jsonb)
  from jsonb_each_text(coalesce(p_respostas, '{}'::jsonb)) as e(k, v)
  where k ~* '^[0-9a-f-]{36}$' and k::uuid = any(p_ids) and upper(v) in ('A', 'B', 'C', 'D', 'E')
$$;

create or replace function public.resultado_simulado(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with s as (
    select * from public.simulados where id = p_id and user_id = auth.uid() and finalizado_em is not null
  ),
  r as (
    select count(*)::int as participantes,
           count(*) filter (where o.nota < s.nota)::int as abaixo
    from public.simulados o, s
    where o.chave_ranking = s.chave_ranking and o.finalizado_em is not null
      and o.finalizado_em > now() - interval '180 days'
  ),
  d as (
    select coalesce(nullif(q.disciplina, ''), 'Sem disciplina') as disciplina,
           count(*)::int as total,
           count(*) filter (where upper(s.respostas ->> q.id::text) = upper(q.correta))::int as acertos
    from s join public.questoes q on q.id = any(s.questao_ids)
    group by 1
  )
  select jsonb_build_object(
    'id', s.id, 'titulo', s.titulo, 'total', s.total, 'acertos', s.acertos, 'erros', s.erros,
    'brancos', s.total - s.acertos - s.erros, 'nota', s.nota, 'nota_liquida', s.nota_liquida,
    'tempo_seg', greatest(0, extract(epoch from (s.finalizado_em - s.iniciado_em))::int),
    'duracao_seg', s.duracao_seg, 'finalizado_em', s.finalizado_em,
    'participantes', r.participantes,
    -- % de alunos (mesmo tipo de simulado) que tiraram nota MENOR que a sua.
    'percentil', case when r.participantes > 1 then round(100.0 * r.abaixo / (r.participantes - 1)) end,
    'disciplinas', coalesce((select jsonb_agg(jsonb_build_object('disciplina', disciplina, 'total', total, 'acertos', acertos)
                                              order by total desc) from d), '[]'::jsonb))
  from s, r
$$;

create or replace function public.finalizar_simulado(p_id uuid, p_respostas jsonb default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  s        public.simulados%rowtype;
  v_resp   jsonb;
  v_acertos integer;
  v_erros   integer;
  v_todos_ce boolean;
begin
  select * into s from public.simulados where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'Simulado não encontrado.' using errcode = 'P0002'; end if;
  if s.finalizado_em is not null then return public.resultado_simulado(p_id); end if;

  -- Respostas enviadas depois do tempo (+2 min de tolerância) são ignoradas:
  -- vale o que foi salvo durante a prova.
  v_resp := case when p_respostas is not null and now() <= s.expira_em + interval '2 minutes'
                 then public._respostas_validas(s.questao_ids, p_respostas)
                 else s.respostas end;

  select count(*) filter (where upper(v_resp ->> q.id::text) = upper(q.correta)),
         count(*) filter (where v_resp ? q.id::text and upper(v_resp ->> q.id::text) <> upper(q.correta)),
         bool_and(q.modalidade ilike '%certo%')
    into v_acertos, v_erros, v_todos_ce
  from public.questoes q where q.id = any(s.questao_ids);

  update public.simulados
     set respostas = v_resp,
         acertos = v_acertos,
         erros = v_erros,
         nota = round(100.0 * v_acertos / greatest(s.total, 1), 2),
         nota_liquida = case when v_todos_ce then v_acertos - v_erros end,
         finalizado_em = least(now(), s.expira_em)
   where id = p_id;

  -- As respostas entram nas estatísticas e no "excluir respondidas".
  insert into public.question_attempts (user_id, questao_id, resultado, is_revisao)
  select s.user_id, q.id,
         case when upper(v_resp ->> q.id::text) = upper(q.correta) then 'ACERTO' else 'ERRO' end,
         false
  from public.questoes q
  where q.id = any(s.questao_ids) and v_resp ? q.id::text;

  return public.resultado_simulado(p_id);
end $$;

-- -----------------------------------------------------------------------------
-- 3. Lembretes no celular (Web Push)
-- -----------------------------------------------------------------------------
create table if not exists public.push_inscricoes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  user_agent    text,
  created_at    timestamptz not null default now(),
  ultimo_envio  timestamptz
);
create index if not exists idx_push_inscricoes_user on public.push_inscricoes (user_id);

alter table public.push_inscricoes enable row level security;
drop policy if exists push_select_own on public.push_inscricoes;
create policy push_select_own on public.push_inscricoes for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists push_insert_own on public.push_inscricoes;
create policy push_insert_own on public.push_inscricoes for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists push_update_own on public.push_inscricoes;
create policy push_update_own on public.push_inscricoes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists push_delete_own on public.push_inscricoes;
create policy push_delete_own on public.push_inscricoes for delete to authenticated
  using (user_id = (select auth.uid()));

-- Quem tem celular inscrito e quantas revisões vencem hoje (horário de Brasília).
-- Só o servidor (service_role) chama.
create or replace function public.lembretes_do_dia()
returns table (user_id uuid, revisoes bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if to_regclass('public.review_progress') is null then return; end if;
  return query execute $q$
    select r.user_id, count(*)::bigint
    from public.review_progress r
    where r.next_review is not null
      and r.next_review::date <= (now() at time zone 'America/Sao_Paulo')::date
      and exists (select 1 from public.push_inscricoes p where p.user_id = r.user_id)
    group by r.user_id
  $q$;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Comentários "Por Vocação Militar" em lote (painel admin, service_role)
-- -----------------------------------------------------------------------------
create or replace function public.comentarios_por_disciplina()
returns table (disciplina text, total bigint, com_comentario bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(q.disciplina, ''), 'Sem disciplina'),
         count(*)::bigint,
         count(c.id)::bigint
  from public.questoes q
  left join public.questao_comentarios c
         on c.questao_id = q.id and c.autor_tipo = 'PLATAFORMA' and c.status in ('publicado', 'oculto')
  where q.origem = 'ACERVO' and not q.oculta
  group by 1
  order by 2 desc
$$;

create or replace function public.questoes_sem_comentario(p_disciplina text, p_limite integer default 4)
returns setof uuid
language sql stable security definer set search_path = public as $$
  select q.id
  from public.questoes q
  where q.origem = 'ACERVO' and not q.oculta
    and coalesce(nullif(q.disciplina, ''), 'Sem disciplina') = p_disciplina
    and not exists (select 1 from public.questao_comentarios c
                    where c.questao_id = q.id and c.autor_tipo = 'PLATAFORMA'
                      and c.status in ('publicado', 'oculto', 'gerando'))
  order by q.id
  limit least(greatest(coalesce(p_limite, 4), 1), 20)
$$;

-- -----------------------------------------------------------------------------
-- 5. Permissões das funções
-- -----------------------------------------------------------------------------
revoke execute on function public.metas_disponiveis()                                   from public, anon;
revoke execute on function public.painel_meta()                                         from public, anon;
revoke execute on function public.criar_simulado(text, text, text, integer, integer)   from public, anon;
revoke execute on function public.questoes_do_simulado(uuid)                            from public, anon;
revoke execute on function public.salvar_respostas_simulado(uuid, jsonb)                from public, anon;
revoke execute on function public._respostas_validas(uuid[], jsonb)                     from public, anon, authenticated;
revoke execute on function public.resultado_simulado(uuid)                              from public, anon;
revoke execute on function public.finalizar_simulado(uuid, jsonb)                       from public, anon;
revoke execute on function public.lembretes_do_dia()                                    from public, anon, authenticated;
revoke execute on function public.comentarios_por_disciplina()                          from public, anon, authenticated;
revoke execute on function public.questoes_sem_comentario(text, integer)                from public, anon, authenticated;

grant select, insert, update          on public.aluno_perfil    to authenticated;
grant select                          on public.simulados       to authenticated;
grant select, insert, update, delete  on public.push_inscricoes to authenticated;
grant all on public.aluno_perfil, public.simulados, public.push_inscricoes to service_role;

grant execute on function public.metas_disponiveis()                                    to authenticated;
grant execute on function public.painel_meta()                                          to authenticated;
grant execute on function public.criar_simulado(text, text, text, integer, integer)    to authenticated;
grant execute on function public.questoes_do_simulado(uuid)                             to authenticated;
grant execute on function public.salvar_respostas_simulado(uuid, jsonb)                 to authenticated;
grant execute on function public.resultado_simulado(uuid)                               to authenticated;
grant execute on function public.finalizar_simulado(uuid, jsonb)                        to authenticated;
grant execute on function public.lembretes_do_dia()                                     to service_role;
grant execute on function public.comentarios_por_disciplina()                           to service_role;
grant execute on function public.questoes_sem_comentario(text, integer)                 to service_role;

commit;
