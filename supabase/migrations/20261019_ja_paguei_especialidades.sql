-- =============================================================================
-- 20261019 — "Já paguei" (conferência na API da Kiwify) e filtro de
--            disciplinas de saúde/especialistas.
--
-- Rode no SQL Editor do Supabase ANTES de publicar o código novo.
-- Idempotente (pode rodar de novo).
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1. "Já paguei": registro das conferências (limite por aluno + auditoria)
--    Só o servidor (service_role) lê e grava.
-- -----------------------------------------------------------------------------
create table if not exists public.verificacoes_pagamento (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  email       text not null,
  resultado   text not null,          -- liberado | ja_ativo | nao_encontrado | erro
  pedido_id   text,
  criado_em   timestamptz not null default now()
);
create index if not exists idx_verificacoes_pagamento_user
  on public.verificacoes_pagamento (user_id, criado_em desc);

alter table public.verificacoes_pagamento enable row level security;
-- Sem políticas: inacessível pelo navegador.
grant all on public.verificacoes_pagamento to service_role;
grant usage, select on sequence public.verificacoes_pagamento_id_seq to service_role;

-- -----------------------------------------------------------------------------
-- 2. Disciplinas de saúde e de cargos especialistas
--    Ficam escondidas quando o aluno não escolheu cargo (sem meta, ou meta
--    "todos os cargos" da instituição) e não filtrou a disciplina.
--    Para mudar a lista: insira ou apague linhas nesta tabela.
-- -----------------------------------------------------------------------------
create table if not exists public.disciplinas_especialidade (
  nome text primary key
);

insert into public.disciplinas_especialidade (nome) values
  -- Saúde
  ('Medicina'), ('Odontologia'), ('Farmácia'), ('Enfermagem'), ('Psicologia'),
  ('Veterinária'), ('Fisioterapia'), ('Nutrição'), ('Fonoaudiologia'),
  ('Direito Sanitário e Saúde'), ('Serviço Social'), ('Educação Física'),
  -- Engenharias e áreas técnicas
  ('Engenharia Civil'), ('Engenharia Elétrica e Engenharia Eletrônica'), ('Engenharia Mecânica'),
  ('Engenharia Florestal'), ('Engenharia Agronômica'), ('Engenharia de Telecomunicações'),
  ('Engenharia Química'), ('Engenharia Ambiental e Sanitária'), ('Engenharia Mecatrônica'),
  ('Engenharia de Materiais'), ('Engenharia Naval'), ('Engenharia de Recursos Hídricos/Hidráulica'),
  ('Engenharia Cartográfica e de Agrimensura'), ('Engenharia de Minas'), ('Engenharia Metalúrgica'),
  ('Arquitetura'), ('Geologia'), ('Meteorologia'), ('Tecnologia da Informação'),
  -- Outras carreiras de apoio
  ('Pedagogia'), ('Teologia e Religiões'), ('Biblioteconomia'), ('Arquivologia'),
  ('Comunicação Social'), ('Relações Públicas'), ('Artes'),
  ('Contabilidade de Custos'), ('Auditoria'), ('Análise das Demonstrações Contábeis'),
  ('Conhecimentos Específicos de um determinado Cargo/Área')
on conflict (nome) do nothing;

alter table public.disciplinas_especialidade enable row level security;
drop policy if exists disciplinas_especialidade_leitura on public.disciplinas_especialidade;
create policy disciplinas_especialidade_leitura on public.disciplinas_especialidade
  for select to authenticated using (true);
grant select on public.disciplinas_especialidade to authenticated;
grant all    on public.disciplinas_especialidade to service_role;

-- -----------------------------------------------------------------------------
-- 3. Lista de questões com a opção de esconder especialidades
--    (novo parâmetro no fim; sem ele o comportamento é o de antes)
-- -----------------------------------------------------------------------------
drop function if exists public.listar_questoes(text, text, text, text, text, text, text, boolean, integer, integer);

create or replace function public.listar_questoes(
  p_origem                  text    default null,  -- 'USUARIO' | 'ACERVO' | null (todas)
  p_instituicao             text    default null,
  p_cargo                   text    default null,
  p_disciplina              text    default null,
  p_assunto                 text    default null,
  p_modalidade              text    default null,
  p_banca                   text    default null,
  p_excluir_respondidas     boolean default false,
  p_limite                  integer default 10,
  p_offset                  integer default 0,
  p_ocultar_especialidades  boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select q.id, q.user_id, q.origem, q.instituicao, q.cargo, q.disciplina, q.assunto,
           q.modalidade, q.banca, q.ano, q.enunciado, q.alternativas, q.correta, q.explicacao,
           q.comentarios, q.erros, q.created_at, q.materia_id, q.assunto_id, q.edital_id
    from public.questoes q
    where (p_origem      is null or q.origem      = p_origem)
      and (p_instituicao is null or q.instituicao = p_instituicao)
      and (p_cargo       is null or q.cargo       = p_cargo)
      and (p_disciplina  is null or q.disciplina  = p_disciplina)
      and (p_assunto     is null or q.assunto     = p_assunto)
      and (p_modalidade  is null or q.modalidade  = p_modalidade)
      and (p_banca       is null or q.banca       = p_banca)
      and (not coalesce(p_excluir_respondidas, false) or not exists (
            select 1 from public.question_attempts a
            where a.questao_id = q.id and a.user_id = (select auth.uid())))
      -- Questões do próprio aluno nunca são escondidas; escolher cargo ou
      -- disciplina também mostra tudo.
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

revoke execute on function public.listar_questoes(text, text, text, text, text, text, text, boolean, integer, integer, boolean) from public, anon;
grant  execute on function public.listar_questoes(text, text, text, text, text, text, text, boolean, integer, integer, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Simulado: sem cargo de especialista escolhido, não sorteia especialidades
--    (vale também quando o cargo pedido tem poucas questões e o sorteio
--    cai para a instituição inteira).
-- -----------------------------------------------------------------------------
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
  v_esp   boolean;   -- incluir disciplinas de especialidade?
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

  -- Só inclui especialidades se o próprio cargo pedido é de especialista
  -- (ex.: Oficial Dentista): pelo menos 30% das questões dele são dessas
  -- disciplinas. Algumas questões soltas num cargo comum não contam.
  select coalesce(avg((e.nome is not null)::int), 0) >= 0.3 into v_esp
  from public.questoes q
  left join public.disciplinas_especialidade e on e.nome = q.disciplina
  where v_cargo is not null and q.origem = 'ACERVO' and not q.oculta and q.cargo = v_cargo
    and (v_inst is null or q.instituicao = v_inst);

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
        and (v_esp or not exists (select 1 from public.disciplinas_especialidade e where e.nome = q.disciplina))
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

commit;
