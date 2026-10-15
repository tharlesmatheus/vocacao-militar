import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { exigirAdmin, respostaAdmin } from "@/lib/servidor/admin";
import { CAMPOS_QUESTAO_COMENTARIO, gerarComentario, modeloDoComentario, type QuestaoParaComentario } from "@/lib/servidor/comentarioIA";

/*
 * Geração antecipada dos comentários "Por Vocação Militar" (só admin).
 *
 * GET  -> por disciplina: total de questões do acervo e quantas já têm comentário.
 * POST { disciplina, quantidade? (1–5) } -> gera um pequeno lote e devolve o resultado.
 *
 * O painel chama o POST repetidamente até acabar (ou até o admin parar). Lotes
 * pequenos cabem no tempo máximo de uma função da Vercel e não estouram a cota
 * do Gemini de uma vez. A reserva usa o mesmo índice único da rota do aluno,
 * então nunca há dois comentários para a mesma questão.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CAMPOS = CAMPOS_QUESTAO_COMENTARIO;

export async function GET(req: Request) {
    const auth = await exigirAdmin(req);
    if ("resposta" in auth) return auth.resposta;

    const { data, error } = await supabaseAdmin.rpc("comentarios_por_disciplina");
    if (error) return respostaAdmin({ error: error.message }, 500);
    return respostaAdmin({ disciplinas: data ?? [] });
}

export async function POST(req: Request) {
    const auth = await exigirAdmin(req);
    if ("resposta" in auth) return auth.resposta;

    let corpo: { disciplina?: unknown; quantidade?: unknown };
    try {
        corpo = await req.json();
    } catch {
        return respostaAdmin({ error: "JSON inválido." }, 400);
    }
    const disciplina = typeof corpo.disciplina === "string" ? corpo.disciplina.trim() : "";
    if (!disciplina) return respostaAdmin({ error: "Informe a disciplina." }, 400);
    const quantidade = Math.min(5, Math.max(1, Number(corpo.quantidade) || 4));

    const { data: ids, error: erroIds } = await supabaseAdmin.rpc("questoes_sem_comentario", {
        p_disciplina: disciplina,
        p_limite: quantidade,
    });
    if (erroIds) return respostaAdmin({ error: erroIds.message }, 500);
    const lista = ((ids ?? []) as unknown[]).map(String);
    if (!lista.length) return respostaAdmin({ gerados: 0, falhas: 0, revisar: 0, restantes: 0 });

    const { data: questoes, error: erroQ } = await supabaseAdmin.from("questoes").select(CAMPOS).in("id", lista);
    if (erroQ) return respostaAdmin({ error: erroQ.message }, 500);

    const resultados = await Promise.all(
        ((questoes ?? []) as QuestaoParaComentario[]).map(async (q) => {
            // Reserva (falha com 23505 se outro processo já pegou esta questão).
            const { data: reserva, error } = await supabaseAdmin
                .from("questao_comentarios")
                .insert({ questao_id: q.id, autor_tipo: "PLATAFORMA", status: "gerando", gerado_por: auth.admin.id })
                .select("id")
                .single();
            if (error) return { ok: false, pulada: error.code === "23505" };
            try {
                const { texto, revisar } = await gerarComentario(q);
                const { error: erroUp } = await supabaseAdmin
                    .from("questao_comentarios")
                    .update({ texto, status: "publicado", revisar, modelo: modeloDoComentario(q) })
                    .eq("id", reserva.id);
                if (erroUp) throw new Error(erroUp.message);
                return { ok: true, revisar };
            } catch (e) {
                console.error(`Lote: comentário da questão ${q.id}:`, e);
                // Apaga a reserva para a questão voltar à fila (e o aluno poder gerar).
                await supabaseAdmin.from("questao_comentarios").delete().eq("id", reserva.id);
                return { ok: false, pulada: false };
            }
        })
    );

    return respostaAdmin({
        gerados: resultados.filter((r) => r.ok).length,
        revisar: resultados.filter((r) => r.ok && "revisar" in r && r.revisar).length,
        falhas: resultados.filter((r) => !r.ok && !r.pulada).length,
    });
}
