import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { temAssinaturaAtiva, usuarioDaRequisicao } from "@/lib/servidor/usuario";

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
export const maxDuration = 30;

const GEMINI_MODEL = process.env.GEMINI_MODEL_COMENTARIO || "gemini-3-flash-preview";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const LIMITE_DIARIO = Number(process.env.COMENTARIO_LIMITE_DIA || 40);
const GERACAO_TRAVADA_MS = 90_000; // "gerando" mais antigo que isso é considerado abandonado

type Questao = {
    id: string;
    user_id: string | null;
    origem: string | null;
    disciplina: string | null;
    assunto: string | null;
    banca: string | null;
    modalidade: string | null;
    enunciado: string | null;
    alternativas: Record<string, string> | null;
    correta: string | null;
};

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

function montarPrompt(q: Questao): string {
    const alternativas = Object.entries(q.alternativas ?? {})
        .map(([letra, texto]) => `${letra}) ${texto}`)
        .join("\n");
    const certoErrado = (q.modalidade ?? "").toLowerCase().includes("certo");
    const gabarito = certoErrado
        ? (q.correta === "C" ? "CERTO" : q.correta === "E" ? "ERRADO" : q.correta)
        : q.correta;

    return `Você é professor(a) de cursinho preparatório para concursos públicos e militares.
Escreva o comentário de resolução da questão abaixo para alunos.

REGRAS
1. O gabarito informado é o gabarito oficial. Explique por que ele está correto. Não o contradiga.
2. ${certoErrado
            ? "Explique por que o item está certo ou errado, apontando exatamente o trecho decisivo."
            : "Explique por que a alternativa correta está certa e, em seguida, por que cada uma das outras está errada (uma linha para cada)."}
3. Seja didático, direto e tecnicamente correto. Entre 120 e 350 palavras.
4. NÃO invente números de artigos, leis, súmulas, incisos, datas, autores ou precedentes. Só cite um dispositivo se tiver certeza absoluta; caso contrário, explique o conceito sem número.
5. Não diga que é uma IA, não fale de "gabarito oficial", não use markdown (sem #, *, tabelas). Use parágrafos curtos em texto simples.
6. Termine com uma linha começando por "Dica:" com uma dica prática de prova.
7. Se você acreditar que o gabarito está errado ou que a questão é ambígua, mesmo assim escreva o comentário de forma neutra e coloque "gabarito_coerente": false.

Responda SOMENTE com JSON válido no formato:
{"comentario": "texto do comentário", "gabarito_coerente": true}

QUESTÃO
Disciplina: ${q.disciplina ?? "-"}
Assunto: ${q.assunto ?? "-"}
Banca: ${q.banca ?? "-"}
Tipo: ${certoErrado ? "Certo ou Errado" : "Múltipla escolha"}

Enunciado:
${q.enunciado ?? ""}

${certoErrado ? "" : `Alternativas:\n${alternativas}\n`}
Gabarito: ${gabarito}`;
}

async function gerarComentario(q: Questao): Promise<{ texto: string; revisar: boolean }> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY não configurada.");

    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), 25_000);
    try {
        const r = await fetch(GEMINI_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
            body: JSON.stringify({
                contents: [{ parts: [{ text: montarPrompt(q) }] }],
                generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
            }),
            cache: "no-store",
            signal: controle.signal,
        });
        const dados = await r.json().catch(() => null);
        if (!r.ok) throw new Error(`Gemini HTTP ${r.status}: ${String(dados?.error?.message ?? "").slice(0, 200)}`);

        const bruto = String(dados?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
        const json = JSON.parse(bruto.replace(/^```(?:json)?\s*|\s*```$/g, ""));
        const texto = String(json?.comentario ?? "")
            .replace(/\r\n/g, "\n")
            .replace(/[*#`]+/g, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim();

        if (texto.length < 200 || texto.length > 6000) throw new Error(`Comentário com tamanho inválido (${texto.length}).`);
        return { texto, revisar: json?.gabarito_coerente === false };
    } finally {
        clearTimeout(timer);
    }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id: questaoId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(questaoId)) return resposta({ error: "Questão inválida." }, 400);

    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return resposta({ error: "Faça login para ver os comentários." }, 401);

    // A questão precisa ser do próprio aluno ou do acervo (com assinatura).
    const { data: questao, error: erroQ } = await supabaseAdmin
        .from("questoes")
        .select("id,user_id,origem,disciplina,assunto,banca,modalidade,enunciado,alternativas,correta")
        .eq("id", questaoId)
        .maybeSingle<Questao>();
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

    if (existente?.status === "publicado") return resposta({ comentario: publico(existente) });
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
        return resposta({ error: "Você atingiu o limite diário de novos comentários. Tente amanhã." }, 429);
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
            .or(`status.eq.falhou,and(status.eq.gerando,updated_at.lt.${abandonado})`)
            .select("id");
        if (!retomado?.length) return resposta({ status: "gerando" }, 202);
        reservaId = existente.id;
    }

    try {
        const { texto, revisar } = await gerarComentario(questao);
        const { data: pronto, error } = await supabaseAdmin
            .from("questao_comentarios")
            .update({ texto, status: "publicado", revisar, modelo: GEMINI_MODEL })
            .eq("id", reservaId)
            .select("id,autor_tipo,autor_nome,texto,status,created_at,updated_at")
            .single<ComentarioLinha>();
        if (error || !pronto) throw new Error(error?.message || "Falha ao salvar.");
        return resposta({ comentario: publico(pronto) });
    } catch (e) {
        console.error(`Comentário da questão ${questaoId}:`, e);
        await supabaseAdmin.from("questao_comentarios").update({ status: "falhou" }).eq("id", reservaId);
        return resposta({ error: "Não foi possível gerar o comentário agora. Tente novamente." }, 502);
    }
}
