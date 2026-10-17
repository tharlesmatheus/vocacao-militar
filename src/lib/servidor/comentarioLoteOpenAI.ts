/*
 * Comentários "Por Vocação Militar" em lote pela OpenAI Batch API (metade do preço,
 * resultado em até 24 h). Usa o MESMO prompt e a MESMA validação do Gemini
 * (comentarioIA.ts), então o texto sai no mesmo formato ("Portanto...", "Dica:").
 *
 * Fluxo: enviarLote() -> (OpenAI processa) -> consultarLote() -> baixarArquivo() -> lerSaida().
 * Só roda no servidor; a chave fica em OPENAI_API_KEY (Vercel), nunca no navegador.
 */

import { lerComentario, montarPrompt, type QuestaoParaComentario } from "./comentarioIA";

const OPENAI_URL = "https://api.openai.com/v1";
export const OPENAI_MODELO_LOTE = process.env.OPENAI_MODEL_COMENTARIO || "gpt-5-nano";
// Esforço de raciocínio dos modelos GPT-5 (minimal | low | medium | high).
const RACIOCINIO = process.env.OPENAI_RACIOCINIO_COMENTARIO || "low";

/** Estados finais de um lote na OpenAI. */
export const STATUS_FINAIS = ["completed", "failed", "expired", "cancelled"];

const ESQUEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        comentario: { type: "string" },
        gabarito_coerente: { type: "boolean" },
    },
    required: ["comentario", "gabarito_coerente"],
};

function chave(): string {
    const k = process.env.OPENAI_API_KEY;
    if (!k) throw new Error("OPENAI_API_KEY não configurada na Vercel.");
    return k;
}

async function chamar<T>(caminho: string, init: RequestInit = {}): Promise<T> {
    const r = await fetch(`${OPENAI_URL}${caminho}`, {
        ...init,
        headers: { Authorization: `Bearer ${chave()}`, ...(init.headers ?? {}) },
        cache: "no-store",
    });
    if (!r.ok) {
        const corpo = await r.json().catch(() => null);
        throw new Error(`OpenAI HTTP ${r.status}: ${String(corpo?.error?.message ?? "").slice(0, 300)}`);
    }
    return (await r.json()) as T;
}

/** Uma linha do arquivo JSONL do lote (custom_id = id da questão). */
export function linhaDoLote(q: QuestaoParaComentario): string {
    return JSON.stringify({
        custom_id: q.id,
        method: "POST",
        url: "/v1/responses",
        body: {
            model: OPENAI_MODELO_LOTE,
            input: montarPrompt(q),
            reasoning: { effort: RACIOCINIO },
            // O raciocínio conta no limite de saída: folga para não cortar o JSON.
            max_output_tokens: 6000,
            text: { format: { type: "json_schema", name: "comentario_questao", strict: true, schema: ESQUEMA } },
        },
    });
}

export type LoteOpenAI = {
    id: string;
    status: string;
    output_file_id: string | null;
    error_file_id: string | null;
    request_counts?: { total: number; completed: number; failed: number };
    errors?: { data?: { message?: string }[] } | null;
};

/** Sobe o arquivo e cria o lote. Devolve o lote criado. */
export async function enviarLote(questoes: QuestaoParaComentario[], rotulo: string): Promise<LoteOpenAI> {
    if (!questoes.length) throw new Error("Nenhuma questão para enviar.");
    const jsonl = questoes.map(linhaDoLote).join("\n") + "\n";
    const form = new FormData();
    form.append("purpose", "batch");
    form.append("file", new Blob([jsonl], { type: "application/jsonl" }), "comentarios.jsonl");
    const arquivo = await chamar<{ id: string }>("/files", { method: "POST", body: form });

    return chamar<LoteOpenAI>("/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            input_file_id: arquivo.id,
            endpoint: "/v1/responses",
            completion_window: "24h",
            metadata: { origem: "vocacao-militar", rotulo: rotulo.slice(0, 500) },
        }),
    });
}

export function consultarLote(batchId: string): Promise<LoteOpenAI> {
    return chamar<LoteOpenAI>(`/batches/${encodeURIComponent(batchId)}`);
}

export async function baixarArquivo(fileId: string): Promise<string> {
    const r = await fetch(`${OPENAI_URL}/files/${encodeURIComponent(fileId)}/content`, {
        headers: { Authorization: `Bearer ${chave()}` },
        cache: "no-store",
    });
    if (!r.ok) throw new Error(`OpenAI HTTP ${r.status} ao baixar o resultado.`);
    return r.text();
}

/** Junta o texto de saída de uma resposta da Responses API (ignora o raciocínio). */
export function textoDaResposta(body: any): string {
    if (typeof body?.output_text === "string") return body.output_text;
    return ((body?.output ?? []) as any[])
        .filter((item) => item?.type === "message")
        .flatMap((item) => (item.content ?? []) as any[])
        .filter((c) => c?.type === "output_text" && typeof c.text === "string")
        .map((c) => c.text)
        .join("")
        .trim();
}

export type ResultadoLinha =
    | { questaoId: string; ok: true; texto: string; revisar: boolean }
    | { questaoId: string; ok: false; motivo: string };

/** Lê o arquivo de saída do lote e valida cada comentário com as regras do app. */
export function lerSaida(conteudo: string, questoes: Map<string, QuestaoParaComentario>): ResultadoLinha[] {
    const resultados: ResultadoLinha[] = [];
    for (const linha of conteudo.split("\n")) {
        if (!linha.trim()) continue;
        let item: any;
        try {
            item = JSON.parse(linha);
        } catch {
            continue;
        }
        const questaoId = String(item?.custom_id ?? "");
        const q = questoes.get(questaoId);
        if (!q) {
            resultados.push({ questaoId, ok: false, motivo: "questão não encontrada" });
            continue;
        }
        const resp = item?.response;
        if (item?.error || resp?.status_code !== 200) {
            resultados.push({ questaoId, ok: false, motivo: String(item?.error?.message ?? `HTTP ${resp?.status_code}`) });
            continue;
        }
        if (resp.body?.status && resp.body.status !== "completed") {
            resultados.push({ questaoId, ok: false, motivo: `resposta ${resp.body.status}` });
            continue;
        }
        try {
            const json = JSON.parse(textoDaResposta(resp.body));
            resultados.push({ questaoId, ok: true, ...lerComentario(json, q) });
        } catch (e) {
            resultados.push({ questaoId, ok: false, motivo: e instanceof Error ? e.message : String(e) });
        }
    }
    return resultados;
}
