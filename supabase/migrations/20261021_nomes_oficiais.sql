-- =============================================================================
-- 20261021 — Nomes oficiais de instituição, cargo e assunto no acervo.
--
-- Problema: a fonte escreve o mesmo cargo de vários jeitos ("Soldado",
-- "Soldado da Polícia Militar", "Soldado PM de 2ª Classe"...), e os filtros
-- mostravam todos. Agora:
--   * questoes.instituicao / cargo / assunto guardam o NOME OFICIAL (é o que
--     filtros, simulados e metas já usam — nada muda para eles);
--   * o nome que veio da fonte fica em *_fonte (nunca se perde);
--   * nomes_equivalencia guarda "nome da fonte -> nome oficial". O publicador
--     do VM3 preenche pelas regras; o admin corrige em Admin > Nomes, e a
--     decisão dele nunca é desfeita por uma nova publicação;
--   * assunto passa a ser o assunto principal da árvore da fonte, e o
--     detalhe vai para questoes.subassunto (novo filtro na tela de questões);
--   * questões de órgãos fora de segurança pública ficam ocultas.
--
-- Rode no SQL Editor do Supabase ANTES de publicar o código novo e ANTES de
-- rodar o publicador do VM3. Idempotente (pode rodar de novo).
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1. Colunas novas nas questões
-- -----------------------------------------------------------------------------
alter table public.questoes
  add column if not exists instituicao_fonte text,
  add column if not exists cargo_fonte       text,
  add column if not exists cargo_area        text,
  add column if not exists assunto_fonte     text,
  add column if not exists subassunto        text,
  -- 'fora_escopo' = escondida pela regra de nomes (volta se a regra mudar).
  -- null com oculta = escondida à mão pelo admin (nunca é reexibida sozinha).
  add column if not exists oculta_motivo     text;

create index if not exists idx_questoes_fonte_nomes
  on public.questoes (instituicao_fonte, cargo_fonte) where origem = 'ACERVO';
create index if not exists idx_questoes_txt_subassunto
  on public.questoes (disciplina, assunto, subassunto) where subassunto is not null;

-- -----------------------------------------------------------------------------
-- 2. Equivalências: nome da fonte -> nome oficial
--    tipo 'instituicao': contexto = ''            nome_fonte = sigla da fonte
--    tipo 'cargo':       contexto = sigla da fonte nome_fonte = cargo da fonte
--    (o mesmo nome de cargo pode significar coisas diferentes em órgãos
--     diferentes: "Psicólogo" na PM é oficial; na Polícia Civil, apoio)
-- -----------------------------------------------------------------------------
create table if not exists public.nomes_equivalencia (
  id                  uuid primary key default gen_random_uuid(),
  tipo                text not null check (tipo in ('instituicao', 'cargo')),
  contexto            text not null default '',
  nome_fonte          text not null,
  nome_oficial        text not null check (length(btrim(nome_oficial)) between 1 and 200),
  area                text,
  instituicao_oficial text,          -- só cargo: quando o cargo muda a instituição
  situacao            text not null default 'regra' check (situacao in ('regra', 'pendente', 'confirmado')),
  motivo              text,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  atualizado_por      uuid,
  constraint nomes_equivalencia_chave unique (tipo, contexto, nome_fonte)
);

create index if not exists idx_nomes_equivalencia_situacao on public.nomes_equivalencia (situacao, tipo);

-- Só o servidor (service role) lê e grava: o aluno nunca acessa esta tabela.
alter table public.nomes_equivalencia enable row level security;
revoke all on public.nomes_equivalencia from anon, authenticated;
grant all on public.nomes_equivalencia to service_role;

create or replace function public.nomes_equivalencia_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists trg_nomes_equivalencia_touch on public.nomes_equivalencia;
create trigger trg_nomes_equivalencia_touch before update on public.nomes_equivalencia
  for each row execute function public.nomes_equivalencia_touch();

-- -----------------------------------------------------------------------------
-- 3. Aplica as equivalências nas questões do acervo.
--    Sem parâmetros: todas. Com parâmetros: só aquela instituição/cargo da fonte.
--    Só toca nas linhas que mudam. Devolve quantas mudaram.
-- -----------------------------------------------------------------------------
create or replace function public.aplicar_nomes_oficiais(
  p_instituicao_fonte text default null,
  p_cargo_fonte       text default null
)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_qtd integer;
begin
  with eq as (
    select q.id, q.instituicao_fonte, q.cargo_fonte, q.oculta, q.oculta_motivo,
           ie.nome_oficial as inst_of,
           ce.nome_oficial as cargo_of, ce.area, ce.instituicao_oficial
    from public.questoes q
    left join public.nomes_equivalencia ie
           on ie.tipo = 'instituicao' and ie.contexto = '' and ie.nome_fonte = q.instituicao_fonte
    left join public.nomes_equivalencia ce
           on ce.tipo = 'cargo' and ce.contexto = q.instituicao_fonte and ce.nome_fonte = q.cargo_fonte
    where q.origem = 'ACERVO' and q.instituicao_fonte is not null
      and (p_instituicao_fonte is null or q.instituicao_fonte = p_instituicao_fonte)
      and (p_cargo_fonte is null or q.cargo_fonte = p_cargo_fonte)
  ),
  f as (
    select eq.*, (coalesce(inst_of, '') = 'Fora do escopo' or coalesce(cargo_of, '') = 'Fora do escopo') as fora
    from eq
  ),
  novo as (
    select id,
           case when fora then instituicao_fonte
                else coalesce(nullif(instituicao_oficial, ''), inst_of, instituicao_fonte) end   as instituicao,
           case when fora then cargo_fonte else coalesce(cargo_of, cargo_fonte) end             as cargo,
           case when fora then null else nullif(btrim(coalesce(area, '')), '') end               as cargo_area,
           case when fora then true
                when oculta_motivo = 'fora_escopo' then false
                else oculta end                                                                 as oculta,
           case when fora and not (oculta and oculta_motivo is null) then 'fora_escopo'
                when not fora and oculta_motivo = 'fora_escopo' then null
                else oculta_motivo end                                                          as oculta_motivo
    from f
  )
  update public.questoes q
     set instituicao = n.instituicao, cargo = n.cargo, cargo_area = n.cargo_area,
         oculta = n.oculta, oculta_motivo = n.oculta_motivo
    from novo n
   where q.id = n.id
     and (q.instituicao, q.cargo, q.cargo_area, q.oculta, q.oculta_motivo)
         is distinct from (n.instituicao, n.cargo, n.cargo_area, n.oculta, n.oculta_motivo);
  get diagnostics v_qtd = row_count;
  return v_qtd;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Metas dos alunos: se a instituição/cargo da meta deixou de existir
--    (nome antigo), troca pelo nome oficial mais comum daquelas questões.
-- -----------------------------------------------------------------------------
create or replace function public.migrar_metas_alunos()
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_qtd integer;
begin
  with orfas as (
    select p.user_id, p.meta_instituicao, p.meta_cargo
    from public.aluno_perfil p
    where p.meta_instituicao is not null
      and not exists (
        select 1 from public.questoes q
        where q.origem = 'ACERVO' and not q.oculta
          and q.instituicao = p.meta_instituicao
          and (p.meta_cargo is null or q.cargo = p.meta_cargo))
  ),
  melhor as (
    select o.user_id, m.instituicao, m.cargo
    from orfas o
    cross join lateral (
      select q.instituicao, case when o.meta_cargo is null then null else q.cargo end as cargo, count(*) as n
      from public.questoes q
      where q.origem = 'ACERVO' and not q.oculta
        and (q.instituicao_fonte = o.meta_instituicao or q.instituicao = o.meta_instituicao)
        and (o.meta_cargo is null or q.cargo_fonte = o.meta_cargo or q.cargo = o.meta_cargo)
      group by 1, 2
      order by n desc
      limit 1
    ) m
  )
  update public.aluno_perfil p
     set meta_instituicao = m.instituicao, meta_cargo = m.cargo
    from melhor m
   where p.user_id = m.user_id;
  get diagnostics v_qtd = row_count;
  return v_qtd;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Catálogos do acervo: nomes que nenhuma questão usa mais ficam inativos.
-- -----------------------------------------------------------------------------
create or replace function public.limpar_catalogos_acervo()
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_dono uuid := public.acervo_owner_id();
  v_inst integer; v_cargo integer; v_ass integer;
begin
  update public.questao_instituicoes c
     set ativo = exists (select 1 from public.questoes q where q.questao_instituicao_id = c.id)
   where c.user_id = v_dono
     and c.ativo is distinct from exists (select 1 from public.questoes q where q.questao_instituicao_id = c.id);
  get diagnostics v_inst = row_count;

  update public.questao_cargos c
     set ativo = exists (select 1 from public.questoes q where q.questao_cargo_id = c.id)
   where c.user_id = v_dono
     and c.ativo is distinct from exists (select 1 from public.questoes q where q.questao_cargo_id = c.id);
  get diagnostics v_cargo = row_count;

  update public.questao_assuntos c
     set ativo = exists (select 1 from public.questoes q where q.questao_assunto_id = c.id)
   where c.user_id = v_dono
     and c.ativo is distinct from exists (select 1 from public.questoes q where q.questao_assunto_id = c.id);
  get diagnostics v_ass = row_count;

  return jsonb_build_object('instituicoes', v_inst, 'cargos', v_cargo, 'assuntos', v_ass);
end $$;

-- -----------------------------------------------------------------------------
-- 6. Admin > Nomes (chamadas só pelo servidor, com a service role)
-- -----------------------------------------------------------------------------
create or replace function public.admin_nomes_listar(
  p_tipo     text default null,   -- 'instituicao' | 'cargo' | null
  p_situacao text default null,   -- 'pendente' | 'regra' | 'confirmado' | null
  p_busca    text default null
)
returns table (
  id uuid, tipo text, contexto text, nome_fonte text, nome_oficial text, area text,
  instituicao_oficial text, situacao text, motivo text, atualizado_em timestamptz, questoes bigint
)
language sql stable security definer set search_path = public as $$
  select e.id, e.tipo, e.contexto, e.nome_fonte, e.nome_oficial, e.area, e.instituicao_oficial,
         e.situacao, e.motivo, e.atualizado_em,
         case when e.tipo = 'instituicao' then
           (select count(*) from public.questoes q
             where q.origem = 'ACERVO' and q.instituicao_fonte = e.nome_fonte)
         else
           (select count(*) from public.questoes q
             where q.origem = 'ACERVO' and q.instituicao_fonte = e.contexto and q.cargo_fonte = e.nome_fonte)
         end
  from public.nomes_equivalencia e
  where (p_tipo is null or e.tipo = p_tipo)
    and (p_situacao is null or e.situacao = p_situacao)
    and (p_busca is null or btrim(p_busca) = ''
         or e.nome_fonte ilike '%' || btrim(p_busca) || '%'
         or e.nome_oficial ilike '%' || btrim(p_busca) || '%'
         or e.contexto ilike '%' || btrim(p_busca) || '%')
  order by (e.situacao = 'pendente') desc, e.tipo, e.nome_oficial, e.contexto, e.nome_fonte
  limit 3000
$$;

-- Define o nome oficial de um nome da fonte. p_todas (só cargo): aplica a
-- todas as instituições onde esse mesmo nome de cargo aparece.
create or replace function public.admin_nome_definir(
  p_id           uuid,
  p_nome_oficial text,
  p_area         text default null,
  p_todas        boolean default false,
  p_admin        uuid default null
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_eq   public.nomes_equivalencia;
  v_nome text := left(btrim(coalesce(p_nome_oficial, '')), 200);
  v_area text := nullif(left(btrim(coalesce(p_area, '')), 200), '');
  v_alvo record;
  v_qtd  integer := 0;
  v_linhas integer := 0;
begin
  select * into v_eq from public.nomes_equivalencia where id = p_id;
  if not found then raise exception 'Nome não encontrado.' using errcode = 'P0002'; end if;
  if v_nome = '' then raise exception 'Informe o nome oficial.' using errcode = '22023'; end if;

  for v_alvo in
    update public.nomes_equivalencia e
       set nome_oficial = v_nome,
           area = case when e.tipo = 'cargo' then v_area else null end,
           situacao = 'confirmado',
           atualizado_por = p_admin
     where e.id = p_id
        or (coalesce(p_todas, false) and e.tipo = 'cargo' and v_eq.tipo = 'cargo' and e.nome_fonte = v_eq.nome_fonte)
    returning e.tipo, e.contexto, e.nome_fonte
  loop
    v_linhas := v_linhas + 1;
    if v_alvo.tipo = 'instituicao' then
      v_qtd := v_qtd + public.aplicar_nomes_oficiais(v_alvo.nome_fonte, null);
    else
      v_qtd := v_qtd + public.aplicar_nomes_oficiais(v_alvo.contexto, v_alvo.nome_fonte);
    end if;
  end loop;

  perform public.migrar_metas_alunos();
  return jsonb_build_object('nomes', v_linhas, 'questoes', v_qtd);
end $$;

-- -----------------------------------------------------------------------------
-- 7. Tela de questões: filtro de subassunto e o cargo com a área
-- -----------------------------------------------------------------------------
drop function if exists public.listar_questoes(text, text, text, text, text, text, text, boolean, integer, integer, boolean);

create or replace function public.listar_questoes(
  p_origem                  text    default null,
  p_instituicao             text    default null,
  p_cargo                   text    default null,
  p_disciplina              text    default null,
  p_assunto                 text    default null,
  p_modalidade              text    default null,
  p_banca                   text    default null,
  p_excluir_respondidas     boolean default false,
  p_limite                  integer default 10,
  p_offset                  integer default 0,
  p_ocultar_especialidades  boolean default false,
  p_subassunto              text    default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select q.id, q.user_id, q.origem, q.instituicao, q.cargo, q.cargo_area, q.disciplina, q.assunto, q.subassunto,
           q.modalidade, q.banca, q.ano, q.enunciado, q.alternativas, q.correta, q.explicacao,
           q.comentarios, q.erros, q.created_at, q.materia_id, q.assunto_id, q.edital_id
    from public.questoes q
    where (p_origem      is null or q.origem      = p_origem)
      and (p_instituicao is null or q.instituicao = p_instituicao)
      and (p_cargo       is null or q.cargo       = p_cargo)
      and (p_disciplina  is null or q.disciplina  = p_disciplina)
      and (p_assunto     is null or q.assunto     = p_assunto)
      and (p_subassunto  is null or q.subassunto  = p_subassunto)
      and (p_modalidade  is null or q.modalidade  = p_modalidade)
      and (p_banca       is null or q.banca       = p_banca)
      and (not coalesce(p_excluir_respondidas, false) or not exists (
            select 1 from public.question_attempts a
            where a.questao_id = q.id and a.user_id = (select auth.uid())))
      and (not coalesce(p_ocultar_especialidades, false)
           or p_cargo is not null or p_disciplina is not null
           or q.origem <> 'ACERVO'
           or not exists (select 1 from public.disciplinas_especialidade e where e.nome = q.disciplina))
  ),
  pagina as (
    select b.*,
           row_number() over (order by (b.origem = 'USUARIO') desc, b.created_at desc nulls last, b.id) as ordem
    from base b
    order by (b.origem = 'USUARIO') desc, b.created_at desc nulls last, b.id
    limit least(greatest(coalesce(p_limite, 10), 1), 50)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'itens', coalesce((select jsonb_agg(to_jsonb(p) - 'ordem' order by p.ordem) from pagina p), '[]'::jsonb)
  );
$$;

drop function if exists public.opcoes_filtro_questoes(text, text, text);

create or replace function public.opcoes_filtro_questoes(
  p_origem      text default null,
  p_instituicao text default null,
  p_disciplina  text default null,
  p_assunto     text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with v as materialized (
    select instituicao, cargo, banca, disciplina, assunto, subassunto, modalidade
    from public.questoes
    where p_origem is null or origem = p_origem
  )
  select jsonb_build_object(
    'instituicoes', (select coalesce(jsonb_agg(x order by x), '[]'::jsonb)
                     from (select distinct instituicao x from v where coalesce(instituicao, '') <> '') s),
    'cargos',       (select coalesce(jsonb_agg(x order by x), '[]'::jsonb)
                     from (select distinct cargo x from v
                           where coalesce(cargo, '') <> '' and (p_instituicao is null or instituicao = p_instituicao)) s),
    'bancas',       (select coalesce(jsonb_agg(x order by x), '[]'::jsonb)
                     from (select distinct banca x from v where coalesce(banca, '') <> '') s),
    'disciplinas',  (select coalesce(jsonb_agg(x order by x), '[]'::jsonb)
                     from (select distinct disciplina x from v where coalesce(disciplina, '') <> '') s),
    'modalidades',  (select coalesce(jsonb_agg(x order by x), '[]'::jsonb)
                     from (select distinct modalidade x from v where coalesce(modalidade, '') <> '') s),
    'assuntos',     case when p_disciplina is null then '[]'::jsonb else
                    (select coalesce(jsonb_agg(x order by x), '[]'::jsonb)
                     from (select distinct assunto x from v
                           where coalesce(assunto, '') <> '' and disciplina = p_disciplina) s) end,
    'subassuntos',  case when p_disciplina is null or p_assunto is null then '[]'::jsonb else
                    (select coalesce(jsonb_agg(x order by x), '[]'::jsonb)
                     from (select distinct subassunto x from v
                           where coalesce(subassunto, '') <> '' and disciplina = p_disciplina
                             and assunto = p_assunto) s) end
  );
$$;

-- -----------------------------------------------------------------------------
-- 8. Permissões
-- -----------------------------------------------------------------------------
revoke execute on function public.aplicar_nomes_oficiais(text, text)                     from public, anon, authenticated;
revoke execute on function public.migrar_metas_alunos()                                  from public, anon, authenticated;
revoke execute on function public.limpar_catalogos_acervo()                              from public, anon, authenticated;
revoke execute on function public.admin_nomes_listar(text, text, text)                   from public, anon, authenticated;
revoke execute on function public.admin_nome_definir(uuid, text, text, boolean, uuid)    from public, anon, authenticated;
grant  execute on function public.aplicar_nomes_oficiais(text, text)                     to service_role;
grant  execute on function public.migrar_metas_alunos()                                  to service_role;
grant  execute on function public.limpar_catalogos_acervo()                              to service_role;
grant  execute on function public.admin_nomes_listar(text, text, text)                   to service_role;
grant  execute on function public.admin_nome_definir(uuid, text, text, boolean, uuid)    to service_role;

revoke execute on function public.listar_questoes(text, text, text, text, text, text, text, boolean, integer, integer, boolean, text) from public, anon;
grant  execute on function public.listar_questoes(text, text, text, text, text, text, text, boolean, integer, integer, boolean, text) to authenticated;
revoke execute on function public.opcoes_filtro_questoes(text, text, text, text) from public, anon;
grant  execute on function public.opcoes_filtro_questoes(text, text, text, text) to authenticated;

commit;
