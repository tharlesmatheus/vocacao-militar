/*
 * Geração do comentário "Por Vocação Militar" com IA.
 * Usado pela rota do aluno (/api/questoes/[id]/comentario) e pela geração em
 * lote do painel admin (/api/admin/comentarios/lote). Só roda no servidor.
 */

import { paraIA } from "@/lib/textoFormatado";

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

/** Nome gravado em questao_comentarios.modelo ("+fmt" = gerado vendo os destaques). */
export function modeloDoComentario(q: QuestaoParaComentario): string {
    return usaFormatacao(q) ? `${GEMINI_MODEL_COMENTARIO}+fmt` : GEMINI_MODEL_COMENTARIO;
}

function montarPrompt(q: QuestaoParaComentario): string {
    const alternativas = Object.entries(q.alternativas ?? {})
        .map(([letra, texto]) => `${letra}) ${paraIA(q.alternativas_fmt?.[letra], texto)}`)
        .join("\n");
    const destaques = usaFormatacao(q);
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
7. Se você acreditar que o gabarito está errado ou que a questão é ambígua, mesmo assim escreva de forma neutra e coloque "gabarito_coerente": false.${destaques ? `
8. Na prova, alguns trechos aparecem destacados. Eles estão marcados como [sublinhado: ...], [negrito: ...] ou [itálico: ...]. Quando a questão falar em "termo destacado", "palavra sublinhada" etc., é desse trecho marcado que ela trata. No seu texto, cite o trecho entre aspas, sem os colchetes.` : ""}

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

        const texto = String(json?.comentario ?? "")
            .replace(/\r\n/g, "\n")
            .replace(/[*#`]+/g, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
        if (texto.length < 80 || texto.length > 4000) throw new Error(`tamanho inválido (${texto.length})`);
        return { texto, revisar: json?.gabarito_coerente === false };
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
