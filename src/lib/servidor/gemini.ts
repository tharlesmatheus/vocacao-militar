/*
 * Chamada ao Gemini pedindo JSON. Só no servidor (usa GEMINI_API_KEY).
 */
export const GEMINI_MODEL_PADRAO = process.env.GEMINI_MODEL_COMENTARIO || "gemini-3-flash-preview";

export async function gerarJSON<T = unknown>(prompt: string, opcoes: { temperatura?: number; timeoutMs?: number } = {}): Promise<T> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY não configurada.");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_PADRAO}:generateContent`;

    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), opcoes.timeoutMs ?? 25_000);
    try {
        const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json", temperature: opcoes.temperatura ?? 0.4 },
            }),
            cache: "no-store",
            signal: controle.signal,
        });
        const dados = await r.json().catch(() => null);
        if (!r.ok) throw new Error(`Gemini HTTP ${r.status}: ${String(dados?.error?.message ?? "").slice(0, 200)}`);
        const bruto = String(dados?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
        return JSON.parse(bruto.replace(/^```(?:json)?\s*|\s*```$/g, "")) as T;
    } finally {
        clearTimeout(timer);
    }
}

/** Remove marcações de markdown que a IA às vezes devolve. */
export function textoLimpo(valor: unknown, max: number) {
    return String(valor ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/[*#`]+/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, max);
}
