import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GEMINI_MODEL = "gemini-3-flash-preview";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_PROMPT_CHARS = 60_000;

type RequestBody = {
    prompt?: unknown;
};

type AuthResult =
    | { ok: true }
    | { ok: false; status: number; error: string };

function respostaErro(error: string, status: number) {
    return NextResponse.json(
        { error },
        {
            status,
            headers: {
                "Cache-Control": "no-store",
            },
        }
    );
}

async function validarUsuario(
    request: Request
): Promise<AuthResult> {
    const authorization =
        request.headers.get("authorization") ?? "";

    const accessToken = authorization.startsWith("Bearer ")
        ? authorization.slice(7).trim()
        : "";

    if (!accessToken) {
        return {
            ok: false,
            status: 401,
            error: "Usuário não autenticado.",
        };
    }

    const supabaseUrl =
        process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabasePublicKey =
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabasePublicKey) {
        console.error(
            "Variáveis do Supabase ausentes no servidor."
        );

        return {
            ok: false,
            status: 500,
            error: "Configuração de autenticação indisponível.",
        };
    }

    try {
        const authResponse = await fetch(
            `${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`,
            {
                method: "GET",
                headers: {
                    apikey: supabasePublicKey,
                    Authorization: `Bearer ${accessToken}`,
                },
                cache: "no-store",
            }
        );

        if (!authResponse.ok) {
            return {
                ok: false,
                status: 401,
                error: "Sessão inválida ou expirada.",
            };
        }

        return { ok: true };
    } catch (error) {
        console.error(
            "Falha ao validar sessão no Supabase:",
            error
        );

        return {
            ok: false,
            status: 503,
            error: "Não foi possível validar sua sessão.",
        };
    }
}

function extrairTextoGemini(data: unknown): string {
    const payload = data as {
        candidates?: Array<{
            content?: {
                parts?: Array<{ text?: unknown }>;
                text?: unknown;
            };
        }>;
    };

    return String(
        payload?.candidates?.[0]?.content?.parts?.[0]
            ?.text ??
        payload?.candidates?.[0]?.content?.text ??
        ""
    ).trim();
}

function extrairErroGemini(data: unknown): string {
    const payload = data as {
        error?: {
            message?: unknown;
        };
    };

    return String(payload?.error?.message ?? "").trim();
}

export async function POST(request: Request) {
    const auth = await validarUsuario(request);

    if (!auth.ok) {
        return respostaErro(auth.error, auth.status);
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.error(
            "GEMINI_API_KEY não foi configurada no servidor."
        );

        return respostaErro(
            "A integração com a IA não está configurada.",
            500
        );
    }

    let body: RequestBody;

    try {
        body = (await request.json()) as RequestBody;
    } catch {
        return respostaErro("JSON inválido.", 400);
    }

    const prompt =
        typeof body?.prompt === "string"
            ? body.prompt.trim()
            : "";

    if (!prompt) {
        return respostaErro(
            "O campo prompt é obrigatório.",
            400
        );
    }

    if (prompt.length > MAX_PROMPT_CHARS) {
        return respostaErro(
            `O prompt excede o limite de ${MAX_PROMPT_CHARS.toLocaleString(
                "pt-BR"
            )} caracteres.`,
            413
        );
    }

    try {
        const geminiResponse = await fetch(GEMINI_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-goog-api-key": apiKey,
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: prompt,
                            },
                        ],
                    },
                ],
                generationConfig: {
                    responseMimeType: "application/json",
                },
            }),
            cache: "no-store",
        });

        const geminiData = await geminiResponse
            .json()
            .catch(() => null);

        if (!geminiResponse.ok) {
            const detalhe = extrairErroGemini(geminiData);

            console.error(
                `Gemini HTTP ${geminiResponse.status}:`,
                detalhe || "sem detalhes"
            );

            return respostaErro(
                detalhe
                    ? `Gemini: ${detalhe.slice(0, 300)}`
                    : `O Gemini retornou HTTP ${geminiResponse.status}.`,
                502
            );
        }

        const text = extrairTextoGemini(geminiData);

        if (!text) {
            return respostaErro(
                "A IA retornou uma resposta vazia.",
                502
            );
        }

        return NextResponse.json(
            { text },
            {
                status: 200,
                headers: {
                    "Cache-Control": "no-store",
                },
            }
        );
    } catch (error) {
        console.error("Erro ao chamar o Gemini:", error);

        return respostaErro(
            "Não foi possível comunicar com o serviço de IA.",
            502
        );
    }
}
