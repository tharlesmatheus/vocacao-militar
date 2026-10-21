/*
 * Geração do comentário "Por Vocação Militar" com IA.
 * Usado pela rota do aluno (/api/questoes/[id]/comentario) e pela geração em
 * lote do painel admin (/api/admin/comentarios/lote). Só roda no servidor.
 */

import { paraIA } from "@/lib/textoFormatado";
import { organizarComentario } from "@/lib/comentarioFormato";

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
    /** Versões com negrito/itálico/sublinhado da fonte (migração 20261023). */
    enunciado_fmt?: string | null;
    alternativas_fmt?: Record<string, string> | null;
};

/** Colunas que as rotas leem para gerar a explicação. */
export const CAMPOS_QUESTAO_COMENTARIO =
    "id,user_id,origem,disciplina,assunto,banca,modalidade,enunciado,alternativas,correta,enunciado_fmt,alternativas_fmt";

/** A questão tem destaques (sublinhado etc.)? Usado para marcar o modelo do comentário. */
export function usaFormatacao(q: QuestaoParaComentario): boolean {
    return !!q.enunciado_fmt || !!(q.alternativas_fmt && Object.keys(q.alternativas_fmt).length);
}

/**
 * Versão do formato da explicação. "v3" = explicação aprofundada: alternativa por
 * alternativa, "Portanto, a alternativa correta é a letra X.", "Ponto-chave:" e
 * "Pegadinha:". Igual ao VM3 (comentarios_ia.py). Sem "+v3" no modelo = formato antigo.
 */
const VERSAO_FORMATO = "v3";

/** Nome gravado em questao_comentarios.modelo ("+fmt" = gerado vendo os destaques; sempre por último). */
export function modeloDoComentario(q: QuestaoParaComentario, modelo: string = GEMINI_MODEL_COMENTARIO): string {
    const base = `${modelo}+${VERSAO_FORMATO}`;
    return usaFormatacao(q) ? `${base}+fmt` : base;
}

function gabaritoPorExtenso(q: QuestaoParaComentario): { certoErrado: boolean; gabarito: string } {
    const certoErrado = (q.modalidade ?? "").toLowerCase().includes("certo");
    const g = (q.correta ?? "").trim().toUpperCase();
    return { certoErrado, gabarito: certoErrado ? (g === "C" ? "CERTO" : g === "E" ? "ERRADO" : g) : g };
}

/**
 * Garante a conclusão no fim ("Portanto, a alternativa correta é a letra X."),
 * sempre com o gabarito oficial: remove a linha "Portanto..." que o modelo tenha
 * escrito (pode vir com a letra errada) e coloca a nossa antes da "Dica:".
 */
export function fecharComConclusao(texto: string, q: QuestaoParaComentario): string {
    const { certoErrado, gabarito } = gabaritoPorExtenso(q);
    if (!gabarito) return texto;
    const conclusao = certoErrado
        ? `Portanto, o item está ${gabarito}.`
        : `Portanto, a alternativa correta é a letra ${gabarito}.`;
    const linhas = texto
        .replace(/\s*Portanto,? (a alternativa correta|a resposta correta|o gabarito) é (a )?(letra )?[A-E]\.?/gi, "")
        .split("\n")
        .filter((l) => !/^\s*portanto\b/i.test(l));
    // Fecho: a conclusão entra antes de "Ponto-chave:", "Pegadinha:" ou "Dica:" (o que vier primeiro).
    const iDica = linhas.findIndex((l) => /^\s*(dica|ponto-chave|ponto chave|pegadinha)\s*:/i.test(l));
    const corpo = (iDica >= 0 ? linhas.slice(0, iDica) : linhas).join("\n").trimEnd();
    const dica = iDica >= 0 ? linhas.slice(iDica).join("\n").trim() : "";
    return [corpo, conclusao, dica].filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Texto em português sem nenhum acento (ex.: "combinacao", "propria") = resposta com defeito. */
function semAcentuacao(texto: string): boolean {
    return texto.length > 200 && !/[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(texto);
}

/** Prompt da explicação (o mesmo para o Gemini da rota do aluno e para o lote da OpenAI). */
export function montarPrompt(q: QuestaoParaComentario): string {
    const alternativas = Object.entries(q.alternativas ?? {})
        .map(([letra, texto]) => `${letra}) ${paraIA(q.alternativas_fmt?.[letra], texto)}`)
        .join("\n");
    const destaques = usaFormatacao(q);
    const { certoErrado, gabarito } = gabaritoPorExtenso(q);

    const regra2 = certoErrado
        ? `Explique em 3 a 5 frases por que o item está ${gabarito}: a regra ou o conceito cobrado e o trecho decisivo do enunciado. Depois, numa linha começando por "Como a banca mudaria:", mostre em uma frase como o mesmo ponto apareceria com a resposta oposta. Em seguida escreva a linha "Portanto, o item está ${gabarito}."`
        : `Primeiro, em 3 a 5 frases, explique por que a alternativa correta está certa: a regra ou o conceito cobrado e o raciocínio para chegar nela. Depois, uma linha para CADA alternativa, na ordem, no formato "A) ..." (até 35 palavras): na correta, confirme em poucas palavras; em cada errada, diga exatamente o que a torna errada (a palavra, o prazo, o conceito trocado) e, quando couber, como ela ficaria certa. Em seguida escreva a linha "Portanto, a alternativa correta é a letra ${gabarito}."`;
    const regra10 = destaques
        ? `
10. Na prova, alguns trechos aparecem destacados. Eles estão marcados como [sublinhado: ...], [negrito: ...] ou [itálico: ...]. Quando a questão falar em "termo destacado", "palavra sublinhada" etc., é desse trecho marcado que ela trata. No seu texto, cite o trecho entre aspas, sem os colchetes.`
        : "";

    return `Você é professor(a) de cursinho preparatório para concursos policiais.
Escreva a explicação completa da questão abaixo, para um aluno que estuda por questões e quer entender o assunto
e a forma como a banca cobra, não só a resposta.

REGRAS
1. O gabarito informado é o oficial. Explique por que ele está correto. Não o contradiga.
2. ${regra2}
3. Depois da linha "Portanto...", escreva uma linha começando por "Ponto-chave:" com a regra que o aluno deve
   memorizar deste assunto (até 30 palavras).
4. Se houver uma pegadinha típica (troca de palavra, prazo, conceito parecido, exceção), escreva também uma linha
   começando por "Pegadinha:" (até 30 palavras). Se não houver, não escreva essa linha.
5. Entre 120 e 320 palavras no total. Nada de introdução, repetição do enunciado ou frases genéricas.
6. NÃO invente números de artigos, leis, súmulas, incisos, datas, autores ou precedentes. Só cite um dispositivo se
   tiver certeza absoluta; caso contrário, explique o conceito sem número.
7. Não diga que é uma IA, não fale de "gabarito oficial", não use markdown (sem #, *, tabelas). Texto simples,
   parágrafos curtos, cada alternativa na própria linha.
8. Escreva em português do Brasil, com acentuação e pontuação corretas.
9. Se você acreditar que o gabarito está errado ou que a questão é ambígua, mesmo assim escreva de forma neutra e
   coloque "gabarito_coerente": false.${regra10}

Responda SOMENTE com JSON válido no formato:
{"comentario": "texto do comentário", "gabarito_coerente": true}

QUESTÃO
Disciplina: ${q.disciplina ?? "-"}
Assunto: ${q.assunto ?? "-"}
Banca: ${q.banca ?? "-"}
Tipo: ${certoErrado ? "Certo ou Errado" : "Múltipla escolha"}

Enunciado:
${paraIA(q.enunciado_fmt, q.enunciado)}

${certoErrado ? "" : `Alternativas:\n${alternativas}\n`}
Gabarito: ${gabarito}`;
}

/**
 * Valida e limpa o JSON {"comentario", "gabarito_coerente"} devolvido pela IA
 * (qualquer provedor). Lança erro se o texto não servir.
 */
export function lerComentario(json: any, q: QuestaoParaComentario): { texto: string; revisar: boolean } {
    const texto = String(json?.comentario ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/[*#`]+/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    if (texto.length < 80 || texto.length > 4000) throw new Error(`tamanho inválido (${texto.length})`);
    if (semAcentuacao(texto)) throw new Error("resposta sem acentuação");
    // Organiza em blocos (alternativa por linha, fechos em parágrafo) antes de fixar a conclusão.
    return { texto: fecharComConclusao(organizarComentario(texto), q), revisar: json?.gabarito_coerente === false };
}

type Tentativa = { raciocinio: string | null; prazoMs: number };

/** Uma chamada ao Gemini. Lança erro com o motivo (HTTP, resposta cortada, JSON inválido, tamanho). */
async function tentar(q: QuestaoParaComentario, apiKey: string, t: Tentativa): Promise<{ texto: string; revisar: boolean }> {
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), t.prazoMs);
    try {
        // Sem maxOutputTokens: no Gemini 3 o "raciocínio" conta no limite de saída e
        // um teto baixo corta o JSON no meio (foi o que fez as explicações falharem).
        const r = await fetch(GEMINI_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
            body: JSON.stringify({
                contents: [{ parts: [{ text: montarPrompt(q) }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    temperature: 0.3,
                    ...(t.raciocinio ? { thinkingConfig: { thinkingLevel: t.raciocinio } } : {}),
                },
            }),
            cache: "no-store",
            signal: controle.signal,
        });
        const dados = await r.json().catch(() => null);
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${String(dados?.error?.message ?? "").slice(0, 200)}`);

        const candidato = dados?.candidates?.[0];
        // Junta só as partes de texto da resposta (ignora partes de raciocínio, se vierem).
        const bruto = ((candidato?.content?.parts ?? []) as { text?: string; thought?: boolean }[])
            .filter((p) => !p.thought && typeof p.text === "string")
            .map((p) => p.text)
            .join("")
            .trim();
        if (!bruto) throw new Error(`resposta vazia (finishReason=${candidato?.finishReason ?? "?"})`);

        const semCerca = bruto.replace(/^```(?:json)?\s*|\s*```$/g, "");
        let json: any;
        try {
            json = JSON.parse(semCerca);
        } catch {
            const ini = semCerca.indexOf("{");
            const fim = semCerca.lastIndexOf("}");
            if (ini < 0 || fim <= ini) throw new Error(`JSON inválido (finishReason=${candidato?.finishReason ?? "?"})`);
            json = JSON.parse(semCerca.slice(ini, fim + 1));
        }

        return lerComentario(json, q);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Gera a explicação. Primeiro tenta o modo rápido (raciocínio baixo); se falhar por
 * qualquer motivo, tenta uma vez no modo padrão do modelo, que é o que já funcionava.
 */
export async function gerarComentario(q: QuestaoParaComentario): Promise<{ texto: string; revisar: boolean }> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY não configurada.");

    if (RACIOCINIO) {
        try {
            return await tentar(q, apiKey, { raciocinio: RACIOCINIO, prazoMs: 20_000 });
        } catch (e) {
            console.warn(`Explicação (modo rápido) falhou na questão ${q.id}; tentando no modo padrão:`, e instanceof Error ? e.message : e);
        }
    }
    try {
        return await tentar(q, apiKey, { raciocinio: null, prazoMs: 30_000 });
    } catch (e) {
        throw new Error(`Gemini: ${e instanceof Error ? e.message : String(e)}`);
    }
}
