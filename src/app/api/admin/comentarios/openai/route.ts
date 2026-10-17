import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { exigirAdmin, respostaAdmin } from "@/lib/servidor/admin";
import { CAMPOS_QUESTAO_COMENTARIO, modeloDoComentario, type QuestaoParaComentario } from "@/lib/servidor/comentarioIA";
import {
    OPENAI_MODELO_LOTE,
    STATUS_FINAIS,
    baixarArquivo,
    consultarLote,
    enviarLote,
    lerSaida,
} from "@/lib/servidor/comentarioLoteOpenAI";

/*
 * Comentários em lote pela OpenAI Batch API (só admin).
 *
 * GET  ?instituicoes=PM PE,PC PE -> quantas questões dessas instituições têm comentário
 *                                   + últimos lotes (atualiza o status dos que estão na fila).
 * POST { acao: "criar", instituicoes: string[], limite?: number } -> envia um lote.
 * POST { acao: "importar", id }  -> grava os comentários de um lote pronto (pode repetir sem duplicar).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_POR_LOTE = 5000;
const STATUS_ABERTOS = ["validating", "in_progress", "finalizing", "cancelling", "enviado"];

type LoteLinha = {
    id: string;
    batch_id: string;
    modelo: string;
    instituicoes: string[];
    total: number;
    status: string;
    importados: number;
    ignorados: number;
    falhas: number;
    erro: string | null;
    created_at: string;
    updated_at: string;
};

function listaDeInstituicoes(valor: unknown): string[] {
    const bruto = Array.isArray(valor) ? valor : String(valor ?? "").split(",");
    return [...new Set(bruto.map((v) => String(v).trim()).filter(Boolean))].slice(0, 20);
}

async function carregarQuestoes(ids: string[]): Promise<QuestaoParaComentario[]> {
    const todas: QuestaoParaComentario[] = [];
    for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabaseAdmin
            .from("questoes")
            .select(CAMPOS_QUESTAO_COMENTARIO)
            .in("id", ids.slice(i, i + 200));
        if (error) throw new Error(error.message);
        todas.push(...((data ?? []) as unknown as QuestaoParaComentario[]));
    }
    return todas;
}

export async function GET(req: Request) {
    const auth = await exigirAdmin(req);
    if ("resposta" in auth) return auth.resposta;

    const instituicoes = listaDeInstituicoes(new URL(req.url).searchParams.get("instituicoes"));
    let resumo: unknown[] = [];
    if (instituicoes.length) {
        const { data, error } = await supabaseAdmin.rpc("comentarios_por_instituicao", { p_instituicoes: instituicoes });
        if (error) return respostaAdmin({ error: error.message }, 500);
        resumo = data ?? [];
    }

    const { data: lotes, error } = await supabaseAdmin
        .from("comentario_lotes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(15);
    if (error) return respostaAdmin({ error: error.message }, 500);

    // Atualiza o status dos lotes que ainda estão na fila da OpenAI.
    const atualizados = await Promise.all(
        ((lotes ?? []) as LoteLinha[]).map(async (l) => {
            if (!STATUS_ABERTOS.includes(l.status)) return l;
            try {
                const remoto = await consultarLote(l.batch_id);
                if (remoto.status === l.status) return l;
                const erro = remoto.errors?.data?.[0]?.message ?? null;
                await supabaseAdmin
                    .from("comentario_lotes")
                    .update({ status: remoto.status, erro, updated_at: new Date().toISOString() })
                    .eq("id", l.id);
                return { ...l, status: remoto.status, erro };
            } catch (e) {
                return { ...l, erro: e instanceof Error ? e.message : String(e) };
            }
        })
    );

    return respostaAdmin({ modelo: OPENAI_MODELO_LOTE, resumo, lotes: atualizados });
}

export async function POST(req: Request) {
    const auth = await exigirAdmin(req);
    if ("resposta" in auth) return auth.resposta;

    let corpo: { acao?: unknown; instituicoes?: unknown; limite?: unknown; id?: unknown };
    try {
        corpo = await req.json();
    } catch {
        return respostaAdmin({ error: "JSON inválido." }, 400);
    }

    try {
        if (corpo.acao === "criar") return await criar(corpo, auth.admin.id);
        if (corpo.acao === "importar") return await importar(String(corpo.id ?? ""));
        return respostaAdmin({ error: "Ação inválida." }, 400);
    } catch (e) {
        console.error("Lote OpenAI:", e);
        return respostaAdmin({ error: e instanceof Error ? e.message : String(e) }, 502);
    }
}

async function criar(corpo: { instituicoes?: unknown; limite?: unknown }, adminId: string) {
    const instituicoes = listaDeInstituicoes(corpo.instituicoes);
    if (!instituicoes.length) return respostaAdmin({ error: "Informe ao menos uma instituição." }, 400);
    const limite = Math.min(MAX_POR_LOTE, Math.max(1, Number(corpo.limite) || 1000));

    // Um lote por vez: evita pagar duas vezes pelas mesmas questões (clique duplo, aba repetida).
    const { data: abertos } = await supabaseAdmin
        .from("comentario_lotes")
        .select("id")
        .in("status", STATUS_ABERTOS)
        .limit(1);
    if (abertos?.length) {
        return respostaAdmin({ error: "Já existe um lote na fila. Espere ele terminar e importe antes de enviar outro." }, 409);
    }

    const { data: ids, error } = await supabaseAdmin.rpc("questoes_sem_comentario_inst", {
        p_instituicoes: instituicoes,
        p_limite: limite,
    });
    if (error) return respostaAdmin({ error: error.message }, 500);
    const lista = ((ids ?? []) as unknown[]).map(String);
    if (!lista.length) return respostaAdmin({ error: "Todas as questões dessas instituições já têm comentário." }, 400);

    const questoes = await carregarQuestoes(lista);
    const lote = await enviarLote(questoes, instituicoes.join(", "));

    const { data: salvo, error: erroSalvar } = await supabaseAdmin
        .from("comentario_lotes")
        .insert({
            batch_id: lote.id,
            modelo: OPENAI_MODELO_LOTE,
            instituicoes,
            total: questoes.length,
            status: lote.status || "enviado",
            criado_por: adminId,
        })
        .select("*")
        .single();
    if (erroSalvar) {
        // O lote já existe na OpenAI: devolve o id para não se perder.
        return respostaAdmin({ error: `Lote ${lote.id} enviado, mas não foi registrado: ${erroSalvar.message}` }, 500);
    }
    return respostaAdmin({ lote: salvo });
}

async function importar(id: string) {
    if (!id) return respostaAdmin({ error: "Informe o lote." }, 400);
    const { data: lote, error } = await supabaseAdmin.from("comentario_lotes").select("*").eq("id", id).maybeSingle<LoteLinha>();
    if (error) return respostaAdmin({ error: error.message }, 500);
    if (!lote) return respostaAdmin({ error: "Lote não encontrado." }, 404);

    const remoto = await consultarLote(lote.batch_id);
    if (!STATUS_FINAIS.includes(remoto.status)) {
        return respostaAdmin({ error: `O lote ainda está na fila da OpenAI (${remoto.status}).` }, 409);
    }
    if (!remoto.output_file_id) {
        const erro = remoto.errors?.data?.[0]?.message ?? "A OpenAI não devolveu resultados.";
        await supabaseAdmin.from("comentario_lotes").update({ status: remoto.status, erro, updated_at: new Date().toISOString() }).eq("id", id);
        return respostaAdmin({ error: erro }, 400);
    }

    const conteudo = await baixarArquivo(remoto.output_file_id);
    const ids = [...new Set(conteudo.split("\n").map((l) => {
        try { return String(JSON.parse(l)?.custom_id ?? ""); } catch { return ""; }
    }).filter(Boolean))];
    const questoes = new Map((await carregarQuestoes(ids)).map((q) => [q.id, q]));
    const resultados = lerSaida(conteudo, questoes);

    const itens = resultados.flatMap((r) => r.ok
        ? [{ questao_id: r.questaoId, texto: r.texto, revisar: r.revisar, modelo: modeloDoComentario(questoes.get(r.questaoId)!, OPENAI_MODELO_LOTE) }]
        : []);
    let gravados = 0;
    for (let i = 0; i < itens.length; i += 300) {
        const { data, error: erroIns } = await supabaseAdmin.rpc("inserir_comentarios_lote", { p_itens: itens.slice(i, i + 300) });
        if (erroIns) return respostaAdmin({ error: `Gravados ${gravados}; parou em: ${erroIns.message}` }, 500);
        gravados += Number(data ?? 0);
    }

    // Questões que não voltaram no arquivo de saída (falharam na OpenAI) também contam como falha.
    const falhas = resultados.filter((r) => !r.ok).length + Math.max(0, lote.total - resultados.length);
    const motivos = resultados.filter((r) => !r.ok).slice(0, 3).map((r) => (r as { motivo: string }).motivo);
    const resumo = {
        status: "importado",
        importados: gravados,
        ignorados: itens.length - gravados,
        falhas,
        revisar: itens.filter((i) => i.revisar).length,
        erro: motivos.length ? `Exemplos de falha: ${motivos.join(" | ").slice(0, 500)}` : null,
    };
    await supabaseAdmin
        .from("comentario_lotes")
        .update({ status: resumo.status, importados: resumo.importados, ignorados: resumo.ignorados, falhas: resumo.falhas,
                  erro: resumo.erro, updated_at: new Date().toISOString() })
        .eq("id", id);
    return respostaAdmin(resumo);
}
