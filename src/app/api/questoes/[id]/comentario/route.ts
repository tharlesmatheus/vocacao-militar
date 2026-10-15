import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { temAssinaturaAtiva, usuarioDaRequisicao } from "@/lib/servidor/usuario";
import { CAMPOS_QUESTAO_COMENTARIO, gerarComentario, modeloDoComentario, type QuestaoParaComentario } from "@/lib/servidor/comentarioIA";

/*
 * POST /api/questoes/:id/comentario
 *
 * Devolve o comentário "Por Vocação Militar" da questão. Se ainda não existir,
 * gera UMA vez (com IA, a partir do enunciado, das alternativas e do gabarito)
 * e grava; os próximos alunos recebem o comentário salvo.
 *
 * Respostas:
 *   200 { comentario }              pronto
 *   202 { status: "gerando" }       outro aluno disparou a geração; tente de novo em instantes
 *   401 / 402 / 404 / 429 / 502     sem login / sem assinatura / questão invisível / limite diário / falha
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Inclui as explicações preparadas em segundo plano quando o aluno erra.
const LIMITE_DIARIO = Number(process.env.COMENTARIO_LIMITE_DIA || 100);
const GERACAO_TRAVADA_MS = 90_000; // "gerando" mais antigo que isso é considerado abandonado


type ComentarioLinha = {
    id: string;
    autor_tipo: string;
    autor_nome: string;
    texto: string;
    status: string;
    created_at: string;
    updated_at: string;
};

function resposta(corpo: unknown, status = 200) {
    return NextResponse.json(corpo, { status, headers: { "Cache-Control": "no-store" } });
}

function publico(c: ComentarioLinha) {
    // Nunca expõe campos internos (modelo, gerado_por, revisar).
    return { id: c.id, autor_tipo: c.autor_tipo, autor_nome: c.autor_nome, texto: c.texto, created_at: c.created_at };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id: questaoId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(questaoId)) return resposta({ error: "Questão inválida." }, 400);

    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return resposta({ error: "Faça login para ver os comentários." }, 401);

    // A questão precisa ser do próprio aluno ou do acervo (com assinatura).
    const { data: questao, error: erroQ } = await supabaseAdmin
        .from("questoes")
        .select(CAMPOS_QUESTAO_COMENTARIO)
        .eq("id", questaoId)
        .maybeSingle<QuestaoParaComentario>();
    if (erroQ) return resposta({ error: "Erro ao carregar a questão." }, 500);
    if (!questao) return resposta({ error: "Questão não encontrada." }, 404);

    const daPropria = questao.user_id === usuario.id;
    if (!daPropria && questao.origem !== "ACERVO") return resposta({ error: "Questão não encontrada." }, 404);
    if (!(await temAssinaturaAtiva(usuario.id))) {
        return resposta({ error: "Os comentários fazem parte da assinatura.", assinatura: false }, 402);
    }

    // Já existe?
    const { data: existente } = await supabaseAdmin
        .from("questao_comentarios")
        .select("id,autor_tipo,autor_nome,texto,status,created_at,updated_at")
        .eq("questao_id", questaoId)
        .eq("autor_tipo", "PLATAFORMA")
        .maybeSingle<ComentarioLinha>();

    // Publicada sem texto útil (falha antiga): gera de novo em vez de mostrar um quadro vazio.
    const semTexto = existente?.status === "publicado" && (existente.texto ?? "").trim().length < 40;
    if (existente?.status === "publicado" && !semTexto) return resposta({ comentario: publico(existente) });
    if (existente?.status === "oculto") return resposta({ comentario: null });

    // Limite diário de gerações por aluno (protege o custo da IA).
    const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await supabaseAdmin
        .from("questao_comentarios")
        .select("id", { count: "exact", head: true })
        .eq("autor_tipo", "PLATAFORMA")
        .eq("gerado_por", usuario.id)
        .gte("created_at", desde);
    if ((count ?? 0) >= LIMITE_DIARIO) {
        return resposta({ error: "Você atingiu o limite diário de novas explicações. Tente amanhã." }, 429);
    }

    // Reserva a geração: só UM aluno gera; os demais esperam o resultado.
    let reservaId: string | null = null;
    if (!existente) {
        const { data: criado, error } = await supabaseAdmin
            .from("questao_comentarios")
            .insert({ questao_id: questaoId, autor_tipo: "PLATAFORMA", status: "gerando", gerado_por: usuario.id })
            .select("id")
            .single();
        if (error) {
            if (error.code === "23505") return resposta({ status: "gerando" }, 202);
            return resposta({ error: "Não foi possível preparar o comentário." }, 500);
        }
        reservaId = criado.id;
    } else {
        const abandonado = new Date(Date.now() - GERACAO_TRAVADA_MS).toISOString();
        const { data: retomado } = await supabaseAdmin
            .from("questao_comentarios")
            .update({ status: "gerando", gerado_por: usuario.id })
            .eq("id", existente.id)
            .or(semTexto
                ? "status.eq.publicado"
                : `status.eq.falhou,and(status.eq.gerando,updated_at.lt.${abandonado})`)
            .select("id");
        if (!retomado?.length) return resposta({ status: "gerando" }, 202);
        reservaId = existente.id;
    }

    try {
        const { texto, revisar } = await gerarComentario(questao);
        const { data: pronto, error } = await supabaseAdmin
            .from("questao_comentarios")
            .update({ texto, status: "publicado", revisar, modelo: modeloDoComentario(questao) })
            .eq("id", reservaId)
            .select("id,autor_tipo,autor_nome,texto,status,created_at,updated_at")
            .single<ComentarioLinha>();
        if (error || !pronto) throw new Error(error?.message || "Falha ao salvar.");
        return resposta({ comentario: publico(pronto) });
    } catch (e) {
        console.error(`Comentário da questão ${questaoId}:`, e);
        await supabaseAdmin.from("questao_comentarios").update({ status: "falhou" }).eq("id", reservaId);
        return resposta({ error: "Não foi possível carregar a explicação agora. Tente novamente." }, 502);
    }
}
