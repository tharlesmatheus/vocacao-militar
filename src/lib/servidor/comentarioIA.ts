/*
 * Geração do comentário "Por Vocação Militar" com IA.
 * Usado pela rota do aluno (/api/questoes/[id]/comentario) e pela geração em
 * lote do painel admin (/api/admin/comentarios/lote). Só roda no servidor.
 */

export const GEMINI_MODEL_COMENTARIO = process.env.GEMINI_MODEL_COMENTARIO || "gemini-3-flash-preview";
// Nível de raciocínio do Gemini 3 (minimal | low | medium | high). Vazio = padrão do modelo.
const RACIOCINIO = process.env.GEMINI_RACIOCINIO_COMENTARIO ?? "low";
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

    return `Você é professor(a) de cursinho preparatório para concursos policiais.
Escreva a explicação da questão abaixo: curta, objetiva e fácil de revisar.

REGRAS
1. O gabarito informado é o oficial. Explique por que ele está correto. Não o contradiga.
2. ${certoErrado
            ? "Em 2 a 4 frases, diga por que o item está certo ou errado, citando o trecho decisivo do enunciado."
            : "Primeiro, em 2 a 3 frases, por que a alternativa correta está certa. Depois, uma linha curta para cada alternativa errada, no formato \"A) motivo\" (no máximo 15 palavras cada)."}
3. Entre 50 e 150 palavras no total. Nada de introdução, repetição do enunciado ou conclusão genérica.
4. NÃO invente números de artigos, leis, súmulas, incisos, datas, autores ou precedentes. Só cite um dispositivo se tiver certeza absoluta; caso contrário, explique o conceito sem número.
5. Não diga que é uma IA, não fale de "gabarito oficial", não use markdown (sem #, *, tabelas). Texto simples, parágrafos curtos.
6. Se houver uma pegadinha típica de prova, termine com uma linha começando por "Dica:" (no máximo 20 palavras). Se não houver, não escreva dica.
7. Se você acreditar que o gabarito está errado ou que a questão é ambígua, mesmo assim escreva de forma neutra e coloque "gabarito_coerente": false.

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
        // Raciocínio "low" deixa a resposta bem mais rápida; a explicação é curta e o
        // gabarito já vem pronto, então não precisa de raciocínio longo.
        const chamar = (comRaciocinioBaixo: boolean) =>
            fetch(GEMINI_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: montarPrompt(q) }] }],
                    generationConfig: {
                        responseMimeType: "application/json",
                        temperature: 0.3,
                        maxOutputTokens: 2048,
                        ...(comRaciocinioBaixo ? { thinkingConfig: { thinkingLevel: RACIOCINIO } } : {}),
                    },
                }),
                cache: "no-store",
                signal: controle.signal,
            });
        let r = await chamar(!!RACIOCINIO);
        let dados = await r.json().catch(() => null);
        // Modelo que não aceita o nível de raciocínio: tenta de novo sem ele.
        if (r.status === 400 && RACIOCINIO && /thinking/i.test(String(dados?.error?.message ?? ""))) {
            console.warn("Gemini recusou thinkingLevel; usando o padrão do modelo.");
            r = await chamar(false);
            dados = await r.json().catch(() => null);
        }
        if (!r.ok) throw new Error(`Gemini HTTP ${r.status}: ${String(dados?.error?.message ?? "").slice(0, 200)}`);

        const bruto = String(dados?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
        const json = JSON.parse(bruto.replace(/^```(?:json)?\s*|\s*```$/g, ""));
        const texto = String(json?.comentario ?? "")
            .replace(/\r\n/g, "\n")
            .replace(/[*#`]+/g, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim();

        if (texto.length < 120 || texto.length > 3000) throw new Error(`Explicação com tamanho inválido (${texto.length}).`);
        return { texto, revisar: json?.gabarito_coerente === false };
    } finally {
        clearTimeout(timer);
    }
}

