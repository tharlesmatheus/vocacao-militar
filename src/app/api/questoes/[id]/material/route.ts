import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { temAssinaturaAtiva, usuarioDaRequisicao } from "@/lib/servidor/usuario";
import { gerarJSON, textoLimpo } from "@/lib/servidor/gemini";

/*
 * Flashcard / resumo a partir de uma questão.
 *
 * GET  -> o que o aluno já criou desta questão + gerações de IA restantes hoje.
 * POST { acao: "gerar", tipo }                       -> rascunho feito pela IA (não salva).
 * POST { acao: "salvar", tipo, frente, verso }       -> salva o flashcard.
 * POST { acao: "salvar", tipo, titulo, conteudo }    -> salva o resumo.
 *
 * Ao salvar, a disciplina e o assunto vêm da própria questão e são criados no
 * catálogo DO ALUNO se ainda não existirem (o catálogo é por usuário). O item
 * fica ligado à questão (questao_origem_id) e entra sozinho no Centro de Revisões.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const LIMITE_DIA = Number(process.env.IA_MATERIAL_LIMITE_DIA || 30);
type Tipo = "FLASHCARD" | "RESUMO";

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

function resposta(corpo: unknown, status = 200) {
    return NextResponse.json(corpo, { status, headers: { "Cache-Control": "no-store" } });
}

async function carregar(req: Request, questaoId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(questaoId)) return { erro: resposta({ error: "Questão inválida." }, 400) };
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return { erro: resposta({ error: "Faça login novamente." }, 401) };

    const { data: q } = await supabaseAdmin
        .from("questoes")
        .select("id,user_id,origem,disciplina,assunto,banca,modalidade,enunciado,alternativas,correta")
        .eq("id", questaoId)
        .maybeSingle<Questao>();
    if (!q) return { erro: resposta({ error: "Questão não encontrada." }, 404) };
    const propria = q.user_id === usuario.id;
    if (!propria && q.origem !== "ACERVO") return { erro: resposta({ error: "Questão não encontrada." }, 404) };
    if (!propria && !(await temAssinaturaAtiva(usuario.id))) {
        return { erro: resposta({ error: "Este recurso faz parte da assinatura." }, 402) };
    }
    return { usuario, q };
}

async function geracoesHoje(userId: string) {
    const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await supabaseAdmin
        .from("ia_geracoes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", desde);
    return count ?? 0;
}

function descreverQuestao(q: Questao, comentario: string | null) {
    const ce = /certo/i.test(q.modalidade ?? "");
    const gabarito = ce ? (q.correta === "C" ? "CERTO" : "ERRADO") : q.correta;
    const alternativas = ce ? "" : Object.entries(q.alternativas ?? {}).map(([l, t]) => `${l}) ${t}`).join("\n");
    return `Disciplina: ${q.disciplina ?? "-"}
Assunto: ${q.assunto ?? "-"}
Banca: ${q.banca ?? "-"}
Tipo: ${ce ? "Certo ou errado" : "Múltipla escolha"}

Enunciado:
${q.enunciado ?? ""}
${alternativas ? `\nAlternativas:\n${alternativas}\n` : ""}
Gabarito oficial: ${gabarito}
${comentario ? `\nComentário do professor (use como base):\n${comentario}\n` : ""}`;
}

function promptFlashcard(q: Questao, comentario: string | null) {
    return `Você é professor de cursinho para concursos policiais. A partir da questão abaixo, crie UM flashcard que fixe o conhecimento cobrado.

REGRAS
1. Frente: uma pergunta curta e direta (até 200 caracteres), que possa ser respondida sem ver a questão. Não copie o enunciado; pergunte o conceito.
2. Verso: a resposta em 1 a 3 frases (até 400 caracteres), com o porquê. Se houver pegadinha da banca, mencione.
3. O gabarito oficial está correto: não o contradiga.
4. Não invente número de artigo, lei, súmula ou data; só cite se tiver certeza absoluta.
5. Sem markdown. Português do Brasil.

Responda SOMENTE com JSON: {"frente": "...", "verso": "..."}

QUESTÃO
${descreverQuestao(q, comentario)}`;
}

function promptResumo(q: Questao, comentario: string | null) {
    return `Você é professor de cursinho para concursos policiais. A partir da questão abaixo, escreva um RESUMO do assunto cobrado, para o aluno revisar depois.

REGRAS
1. Título curto (até 80 caracteres) com o tema, não com o número da questão.
2. Conteúdo entre 150 e 300 palavras, em texto simples, com estas partes, cada uma começando numa linha própria:
   "O que a banca cobra:" (1 a 2 frases)
   "Pontos-chave:" (3 a 5 linhas começando com "- ")
   "Pegadinha:" (o erro que a questão tenta provocar)
3. O gabarito oficial está correto: não o contradiga.
4. Não invente número de artigo, lei, súmula ou data; só cite se tiver certeza absoluta.
5. Sem markdown além dos "- " das listas. Português do Brasil.

Responda SOMENTE com JSON: {"titulo": "...", "conteudo": "..."}

QUESTÃO
${descreverQuestao(q, comentario)}`;
}

/** Garante disciplina/assunto no catálogo do aluno (pelo nome) e devolve os ids. */
async function catalogoDoAluno(userId: string, disciplina: string | null, assunto: string | null) {
    const nomeD = String(disciplina ?? "").trim();
    if (!nomeD) return { disciplinaId: null as string | null, assuntoId: null as string | null };
    const { data: d, error } = await supabaseAdmin
        .from("questao_disciplinas")
        .upsert({ user_id: userId, nome: nomeD, ativo: true }, { onConflict: "user_id,nome_normalizado" })
        .select("id")
        .single();
    if (error) throw new Error("Catálogo (disciplina): " + error.message);
    const disciplinaId = (d as { id: string }).id;

    const nomeA = String(assunto ?? "").trim();
    if (!nomeA) return { disciplinaId, assuntoId: null };
    const { data: a, error: erroA } = await supabaseAdmin
        .from("questao_assuntos")
        .upsert(
            { user_id: userId, disciplina_id: disciplinaId, nome: nomeA, ativo: true },
            { onConflict: "user_id,disciplina_id,nome_normalizado" }
        )
        .select("id")
        .single();
    if (erroA) throw new Error("Catálogo (assunto): " + erroA.message);
    return { disciplinaId, assuntoId: (a as { id: string }).id };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const r = await carregar(req, id);
    if ("erro" in r) return r.erro;
    const uid = r.usuario.id;

    const [fc, rs, usados] = await Promise.all([
        supabaseAdmin.from("flashcards").select("id").eq("user_id", uid).eq("questao_origem_id", id).limit(1),
        supabaseAdmin.from("resumos").select("id").eq("user_id", uid).eq("questao_origem_id", id).limit(1),
        geracoesHoje(uid),
    ]);
    return resposta({
        flashcardId: fc.data?.[0]?.id ?? null,
        resumoId: rs.data?.[0]?.id ?? null,
        restantes: Math.max(0, LIMITE_DIA - usados),
    });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const r = await carregar(req, id);
    if ("erro" in r) return r.erro;
    const { usuario, q } = r;

    let corpo: Record<string, unknown>;
    try {
        corpo = await req.json();
    } catch {
        return resposta({ error: "JSON inválido." }, 400);
    }
    const tipo = corpo.tipo === "RESUMO" ? "RESUMO" : corpo.tipo === "FLASHCARD" ? "FLASHCARD" : null;
    if (!tipo) return resposta({ error: "Tipo inválido." }, 400);

    if (corpo.acao === "gerar") {
        const usados = await geracoesHoje(usuario.id);
        if (usados >= LIMITE_DIA) {
            return resposta({ error: `Você usou as ${LIMITE_DIA} gerações automáticas de hoje. Escreva manualmente ou volte amanhã.` }, 429);
        }
        // O comentário "Por Vocação Militar" (se houver) melhora a precisão.
        const { data: com } = await supabaseAdmin
            .from("questao_comentarios")
            .select("texto")
            .eq("questao_id", id)
            .eq("autor_tipo", "PLATAFORMA")
            .eq("status", "publicado")
            .maybeSingle<{ texto: string }>();
        const comentario = com?.texto ? com.texto.slice(0, 4000) : null;

        try {
            let rascunho: Record<string, string>;
            if (tipo === "FLASHCARD") {
                const j = await gerarJSON<{ frente?: string; verso?: string }>(promptFlashcard(q, comentario));
                rascunho = { frente: textoLimpo(j.frente, 300), verso: textoLimpo(j.verso, 800) };
                if (rascunho.frente.length < 5 || rascunho.verso.length < 5) throw new Error("Flashcard vazio.");
            } else {
                const j = await gerarJSON<{ titulo?: string; conteudo?: string }>(promptResumo(q, comentario));
                rascunho = { titulo: textoLimpo(j.titulo, 120), conteudo: textoLimpo(j.conteudo, 4000) };
                if (rascunho.titulo.length < 3 || rascunho.conteudo.length < 80) throw new Error("Resumo vazio.");
            }
            await supabaseAdmin.from("ia_geracoes").insert({ user_id: usuario.id, tipo, questao_id: id });
            return resposta({ rascunho, restantes: Math.max(0, LIMITE_DIA - usados - 1) });
        } catch (e) {
            console.error(`Material IA (${tipo}) da questão ${id}:`, e);
            return resposta({ error: "Não foi possível gerar agora. Tente de novo ou escreva manualmente." }, 502);
        }
    }

    if (corpo.acao === "salvar") {
        try {
            const { disciplinaId, assuntoId } = await catalogoDoAluno(usuario.id, q.disciplina, q.assunto);
            if (tipo === "FLASHCARD") {
                const frente = String(corpo.frente ?? "").trim().slice(0, 1000);
                const verso = String(corpo.verso ?? "").trim().slice(0, 3000);
                if (!frente || !verso) return resposta({ error: "Preencha a frente e o verso." }, 400);
                const { data, error } = await supabaseAdmin
                    .from("flashcards")
                    .insert({
                        user_id: usuario.id,
                        disciplina_catalogo_id: disciplinaId,
                        assunto_catalogo_id: assuntoId,
                        edital_id: null,
                        materia_id: null,
                        assunto_id: null,
                        frente,
                        verso,
                        active: true,
                        questao_origem_id: id,
                    })
                    .select("id")
                    .single();
                if (error) throw new Error(error.message);
                return resposta({ id: (data as { id: string }).id }, 201);
            }
            const titulo = String(corpo.titulo ?? "").trim().slice(0, 200);
            const conteudo = String(corpo.conteudo ?? "").trim().slice(0, 20000);
            if (!titulo || !conteudo) return resposta({ error: "Preencha o título e o conteúdo." }, 400);
            const { data, error } = await supabaseAdmin
                .from("resumos")
                .insert({
                    user_id: usuario.id,
                    titulo,
                    conteudo,
                    disciplina_catalogo_id: disciplinaId,
                    assunto_catalogo_id: assuntoId,
                    materia_id: null,
                    assunto_id: null,
                    questao_origem_id: id,
                })
                .select("id")
                .single();
            if (error) throw new Error(error.message);
            return resposta({ id: (data as { id: string }).id }, 201);
        } catch (e) {
            console.error(`Salvar ${tipo} da questão ${id}:`, e);
            return resposta({ error: "Não foi possível salvar. Tente novamente." }, 500);
        }
    }

    return resposta({ error: "Ação inválida." }, 400);
}
