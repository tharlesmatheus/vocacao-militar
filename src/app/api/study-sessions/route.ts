// =====================================================================================
// ARQUIVO: src/app/api/study-sessions/route.ts
// ONDE COLOCAR:
//   - Crie a pasta: src/app/api/study-sessions/
//   - Dentro dela, crie este arquivo: route.ts
//
// OBJETIVO (API):
// - start: cria uma sessão (cronômetro)
// - stop: finaliza uma sessão em aberto (calcula duration_seconds via trigger)
// - manual: cria uma sessão já com duration_seconds (registro manual)
//
// SEGURANÇA:
// - Valida o usuário pelo access_token enviado pelo client.
// - Usa supabaseAdmin (service role) somente no servidor.
// =====================================================================================

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Tipos de ação suportados pela API.
 */
type Action = "start" | "stop" | "manual";

/**
 * Payload de entrada esperado.
 * Observação:
 * - materia_id / assunto_id são opcionais (mas recomendados para agregação).
 */
type Body =
    | {
        action: "start";
        access_token: string;
        materia_id?: string | null;
        assunto_id?: string | null;
    }
    | {
        action: "stop";
        access_token: string;
        session_id: string;
    }
    | {
        action: "manual";
        access_token: string;
        materia_id?: string | null;
        assunto_id?: string | null;
        duration_seconds: number;
        ended_at?: string; // opcional: ISO; senão usamos "now"
        started_at?: string; // opcional: ISO; se não vier, derivamos a partir do ended_at - duração
    };

/**
 * Resposta padronizada em JSON.
 */
function json(data: any, status = 200) {
    return NextResponse.json(data, { status });
}

/**
 * Faz autenticação server-side do usuário usando o access_token do Supabase.
 * - Evita confiar no client para informar user_id.
 *
 * @param access_token JWT do Supabase (session.access_token)
 * @returns user_id (uuid) ou null
 */
async function getUserIdFromAccessToken(access_token: string): Promise<string | null> {
    if (!access_token || typeof access_token !== "string") return null;

    const { data, error } = await supabaseAdmin.auth.getUser(access_token);
    if (error) return null;

    const uid = data?.user?.id;
    return uid || null;
}

/**
 * POST handler:
 * - action=start: cria sessão aberta
 * - action=stop: fecha sessão
 * - action=manual: registra duração manual (sem cronômetro)
 */
export async function POST(req: Request) {
    try {
        const body = (await req.json()) as Partial<Body>;

        const action = body?.action as Action | undefined;
        const access_token = (body as any)?.access_token as string | undefined;

        if (!action || !access_token) {
            return json({ error: "Payload inválido: action e access_token são obrigatórios." }, 400);
        }

        const user_id = await getUserIdFromAccessToken(access_token);
        if (!user_id) {
            return json({ error: "Não autenticado (token inválido/expirado)." }, 401);
        }

        // =========================
        // START (cronômetro)
        // =========================
        if (action === "start") {
            const materia_id = (body as any)?.materia_id ?? null;
            const assunto_id = (body as any)?.assunto_id ?? null;

            // Regra defensiva:
            // - Evita múltiplas sessões abertas ao mesmo tempo para o mesmo usuário.
            // - Se existir uma aberta, retornamos ela (não criamos outra).
            const { data: openSessions, error: openErr } = await supabaseAdmin
                .from("study_sessions")
                .select("id, started_at, materia_id, assunto_id")
                .eq("user_id", user_id)
                .is("ended_at", null)
                .order("started_at", { ascending: false })
                .limit(1);

            if (openErr) {
                return json({ error: "Falha ao verificar sessão em aberto.", details: openErr.message }, 500);
            }

            if (openSessions && openSessions.length) {
                return json({ ok: true, session: openSessions[0], reused_open_session: true });
            }

            const { data, error } = await supabaseAdmin
                .from("study_sessions")
                .insert([
                    {
                        user_id,
                        materia_id,
                        assunto_id,
                        mode: "cronometro",
                        started_at: new Date().toISOString(),
                    },
                ])
                .select("id, started_at, materia_id, assunto_id, mode")
                .single();

            if (error) {
                return json({ error: "Erro ao iniciar sessão.", details: error.message }, 500);
            }

            return json({ ok: true, session: data });
        }

        // =========================
        // STOP (finaliza cronômetro)
        // =========================
        if (action === "stop") {
            const session_id = (body as any)?.session_id as string | undefined;
            if (!session_id) return json({ error: "session_id é obrigatório para stop." }, 400);

            // Atualiza ended_at; trigger calcula duration_seconds.
            const { data, error } = await supabaseAdmin
                .from("study_sessions")
                .update({ ended_at: new Date().toISOString() })
                .eq("id", session_id)
                .eq("user_id", user_id)
                .is("ended_at", null)
                .select("id, started_at, ended_at, duration_seconds, materia_id, assunto_id, mode")
                .single();

            if (error) {
                return json({ error: "Erro ao finalizar sessão.", details: error.message }, 500);
            }

            if (!data) {
                // Pode acontecer se já estava encerrada ou não era do usuário
                return json({ error: "Sessão não encontrada ou já finalizada." }, 404);
            }

            return json({ ok: true, session: data });
        }

        // =========================
        // MANUAL (registro direto)
        // =========================
        if (action === "manual") {
            const materia_id = (body as any)?.materia_id ?? null;
            const assunto_id = (body as any)?.assunto_id ?? null;

            const duration_seconds = Number((body as any)?.duration_seconds);
            if (!Number.isFinite(duration_seconds) || duration_seconds <= 0) {
                return json({ error: "duration_seconds deve ser um número > 0." }, 400);
            }

            const ended_at = (body as any)?.ended_at ? new Date((body as any).ended_at) : new Date();
            if (Number.isNaN(ended_at.getTime())) {
                return json({ error: "ended_at inválido." }, 400);
            }

            // Se started_at vier, usamos; senão derivamos do ended_at - duração.
            const started_at = (body as any)?.started_at
                ? new Date((body as any).started_at)
                : new Date(ended_at.getTime() - duration_seconds * 1000);

            if (Number.isNaN(started_at.getTime())) {
                return json({ error: "started_at inválido." }, 400);
            }

            const { data, error } = await supabaseAdmin
                .from("study_sessions")
                .insert([
                    {
                        user_id,
                        materia_id,
                        assunto_id,
                        mode: "manual",
                        started_at: started_at.toISOString(),
                        ended_at: ended_at.toISOString(),
                        duration_seconds: Math.floor(duration_seconds),
                    },
                ])
                .select("id, started_at, ended_at, duration_seconds, materia_id, assunto_id, mode")
                .single();

            if (error) {
                return json({ error: "Erro ao registrar sessão manual.", details: error.message }, 500);
            }

            return json({ ok: true, session: data });
        }

        return json({ error: "Ação inválida." }, 400);
    } catch (e: any) {
        return json({ error: e?.message || "Erro inesperado." }, 500);
    }
}