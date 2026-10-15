import { supabase } from "@/lib/supabaseClient";

const BASE = "id,instituicao,cargo,disciplina,assunto,modalidade,banca,ano,enunciado,alternativas,correta,explicacao";

/**
 * Questões por id (acervo + do aluno) com a formatação (negrito/itálico/sublinhado).
 * Se o banco ainda não tiver as colunas novas (migração 20261023), busca sem elas.
 */
export async function questoesPorIds<T = any>(ids: string[]): Promise<{ data: T[] | null; error: { message: string } | null }> {
    const comFmt = await supabase.rpc("questoes_por_ids", { p_ids: ids }).select(`${BASE},enunciado_fmt,alternativas_fmt`);
    if (!comFmt.error || !/enunciado_fmt|alternativas_fmt|column/i.test(comFmt.error.message)) {
        return { data: (comFmt.data ?? null) as T[] | null, error: comFmt.error };
    }
    const semFmt = await supabase.rpc("questoes_por_ids", { p_ids: ids }).select(BASE);
    return { data: (semFmt.data ?? null) as T[] | null, error: semFmt.error };
}
