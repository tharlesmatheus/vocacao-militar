-- =============================================================================
-- 20261028 — Refazer comentários no formato novo (v3: alternativa por alternativa,
-- ponto-chave e pegadinha).
--
-- inserir_comentarios_lote (20261024) nunca troca um comentário que já existe.
-- Esta função troca: é usada pelo VM3 com --refazer.
-- Comentário OCULTADO no admin continua oculto e não é trocado.
-- Só o service_role (VM3) pode chamar. Rode no SQL Editor do Supabase. Idempotente.
-- =============================================================================
begin;

create or replace function public.substituir_comentarios_lote(p_itens jsonb)
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
     where questao_comentarios.status in ('publicado', 'falhou', 'gerando');
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.substituir_comentarios_lote(jsonb) from public, anon, authenticated;
grant  execute on function public.substituir_comentarios_lote(jsonb) to service_role;

commit;
