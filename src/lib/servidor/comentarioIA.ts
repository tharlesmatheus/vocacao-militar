/*
 * Geração do comentário "Por Vocação Militar" com IA.
 * Usado pela rota do aluno (/api/questoes/[id]/comentario) e pela geração em
 * lote do painel admin (/api/admin/comentarios/lote). Só roda no servidor.
 */

export const GEMINI_MODEL_COMENTARIO = process.env.GEMINI_MODEL_COMENTARIO || "gemini-3-flash-preview";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_COMENTARIO}:generateContent`;

export type QuestaoParaComentario = {
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

function montarPrompt(q: QuestaoParaComentario): string {
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

export async function gerarComentario(q: QuestaoParaComentario): Promise<{ texto: string; revisar: boolean }> {
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

