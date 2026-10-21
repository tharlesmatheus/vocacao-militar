// =====================================================================================
// ARQUIVO: src/app/api/study-sessions/route.ts
//
// Classificação: disciplina_catalogo_id / assunto_catalogo_id (catálogo do usuário).
//
// materia_id/assunto_id eram do edital antigo (tabelas materias/assuntos,
// removidas do banco). Se ainda vierem no payload são ignorados: a sessão
// é gravada sem classificação, e as colunas legadas não são mais escritas.
// =====================================================================================

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Action = "start" | "stop" | "manual";

type StartPayload = {
    action: "start";
    access_token: string;

    disciplina_catalogo_id?: string | null;
    assunto_catalogo_id?: string | null;

    // Edital antigo: aceitos no payload, mas ignorados.
    materia_id?: string | null;
    assunto_id?: string | null;
};

type StopPayload = {
    action: "stop";
    access_token: string;
    session_id: string;
};

type ManualPayload = {
    action: "manual";
    access_token: string;

    disciplina_catalogo_id?: string | null;
    assunto_catalogo_id?: string | null;

    // Edital antigo: aceitos no payload, mas ignorados.
    materia_id?: string | null;
    assunto_id?: string | null;

    duration_seconds: number;
    ended_at?: string;
    started_at?: string;
};

type Body = StartPayload | StopPayload | ManualPayload;

const LIMITE_CRONOMETRO_MS = 4 * 3600 * 1000;

async function inserirSessao(linha: Record<string, unknown>, campos: string) {
    const r = await supabaseAdmin.from("study_sessions").insert([linha]).select(campos).single();
    if (r.error && /origem/i.test(r.error.message)) {
        const { origem: _ignorado, ...semOrigem } = linha;
        return supabaseAdmin.from("study_sessions").insert([semOrigem]).select(campos).single();
    }
    return r;
}

function json(data: unknown, status = 200) {
    return NextResponse.json(data, { status });
}

async function getUserIdFromAccessToken(
    access_token: string
): Promise<string | null> {
    if (!access_token || typeof access_token !== "string") {
        return null;
    }

    const { data, error } =
        await supabaseAdmin.auth.getUser(access_token);

    if (error) return null;

    return data?.user?.id ?? null;
}

async function validateCanonicalPair(
    userId: string,
    disciplinaId: string | null,
    assuntoId: string | null
) {
    if (!disciplinaId && assuntoId) {
        throw new Error(
            "assunto_catalogo_id exige disciplina_catalogo_id."
        );
    }

    if (!disciplinaId) {
        return {
            disciplina_catalogo_id: null,
            assunto_catalogo_id: null,
        };
    }

    const { data: disciplina, error: disciplinaError } =
        await supabaseAdmin
            .from("questao_disciplinas")
            .select("id")
            .eq("id", disciplinaId)
            .eq("user_id", userId)
            .maybeSingle();

    if (disciplinaError || !disciplina) {
        throw new Error(
            "A disciplina canônica informada não pertence ao usuário."
        );
    }

    if (!assuntoId) {
        return {
            disciplina_catalogo_id: disciplinaId,
            assunto_catalogo_id: null,
        };
    }

    const { data: assunto, error: assuntoError } =
        await supabaseAdmin
            .from("questao_assuntos")
            .select("id,disciplina_id")
            .eq("id", assuntoId)
            .eq("user_id", userId)
            .eq("disciplina_id", disciplinaId)
            .maybeSingle();

    if (assuntoError || !assunto) {
        throw new Error(
            "O assunto canônico não pertence à disciplina selecionada."
        );
    }

    return {
        disciplina_catalogo_id: disciplinaId,
        assunto_catalogo_id: assuntoId,
    };
}

async function resolveClassification(
    userId: string,
    body: Partial<StartPayload | ManualPayload>
) {
    const disciplinaCatalogoId =
        body.disciplina_catalogo_id ?? null;

    const assuntoCatalogoId =
        body.assunto_catalogo_id ?? null;

    // Sem ids canônicos => sessão sem classificação (validateCanonicalPair
    // devolve nulls). Ids legados não são mais convertidos.
    return validateCanonicalPair(
        userId,
        disciplinaCatalogoId,
        assuntoCatalogoId
    );
}

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as Partial<Body>;

        const action = body?.action as Action | undefined;
        const accessToken =
            (body as { access_token?: string })?.access_token;

        if (!action || !accessToken) {
            return json(
                {
                    error:
                        "Payload inválido: action e access_token são obrigatórios.",
                },
                400
            );
        }

        const userId =
            await getUserIdFromAccessToken(accessToken);

        if (!userId) {
            return json(
                {
                    error:
                        "Não autenticado (token inválido/expirado).",
                },
                401
            );
        }

        if (action === "start") {
            const startBody = body as Partial<StartPayload>;

            const canonical =
                await resolveClassification(userId, startBody);

            const { data: openSessions, error: openErr } =
                await supabaseAdmin
                    .from("study_sessions")
                    .select(
                        "id,started_at,materia_id,assunto_id,disciplina_catalogo_id,assunto_catalogo_id,mode"
                    )
                    .eq("user_id", userId)
                    .is("ended_at", null)
                    .order("started_at", {
                        ascending: false,
                    })
                    .limit(1);

            if (openErr) {
                return json(
                    {
                        error:
                            "Falha ao verificar sessão em aberto.",
                        details: openErr.message,
                    },
                    500
                );
            }

            // Sessão aberta esquecida (mais de 4 h): fecha com 4 h e começa uma nova.
            const aberta = openSessions?.[0] as { id: string; started_at: string } | undefined;
            if (aberta && Date.now() - new Date(aberta.started_at).getTime() >= LIMITE_CRONOMETRO_MS) {
                await supabaseAdmin
                    .from("study_sessions")
                    .update({
                        ended_at: new Date(new Date(aberta.started_at).getTime() + LIMITE_CRONOMETRO_MS).toISOString(),
                        duration_seconds: LIMITE_CRONOMETRO_MS / 1000,
                    })
                    .eq("id", aberta.id)
                    .eq("user_id", userId);
                openSessions.splice(0, openSessions.length);
            }

            if (openSessions?.length) {
                return json({
                    ok: true,
                    session: openSessions[0],
                    reused_open_session: true,
                });
            }

            const { data, error } = await inserirSessao(
                {
                    user_id: userId,

                    // Canônico
                    disciplina_catalogo_id:
                        canonical.disciplina_catalogo_id,
                    assunto_catalogo_id:
                        canonical.assunto_catalogo_id,

                    mode: "cronometro",
                    origem: "cronometro",
                    started_at:
                        new Date().toISOString(),
                },
                "id,started_at,materia_id,assunto_id,disciplina_catalogo_id,assunto_catalogo_id,mode"
            );

            if (error) {
                return json(
                    {
                        error: "Erro ao iniciar sessão.",
                        details: error.message,
                    },
                    500
                );
            }

            return json({
                ok: true,
                session: data,
            });
        }

        if (action === "stop") {
            const sessionId =
                (body as Partial<StopPayload>)
                    ?.session_id;

            if (!sessionId) {
                return json(
                    {
                        error:
                            "session_id é obrigatório para stop.",
                    },
                    400
                );
            }

            // Cronômetro esquecido: encerra com no máximo 4 horas.
            const { data: aberta } = await supabaseAdmin
                .from("study_sessions")
                .select("started_at")
                .eq("id", sessionId)
                .eq("user_id", userId)
                .maybeSingle<{ started_at: string }>();
            const inicio = aberta ? new Date(aberta.started_at).getTime() : NaN;
            const fim = Number.isFinite(inicio)
                ? Math.min(Date.now(), inicio + LIMITE_CRONOMETRO_MS)
                : Date.now();

            const { data, error } = await supabaseAdmin
                .from("study_sessions")
                .update({
                    ended_at: new Date(fim).toISOString(),
                    ...(Number.isFinite(inicio)
                        ? { duration_seconds: Math.max(0, Math.round((fim - inicio) / 1000)) }
                        : {}),
                })
                .eq("id", sessionId)
                .eq("user_id", userId)
                .is("ended_at", null)
                .select(
                    "id,started_at,ended_at,duration_seconds,materia_id,assunto_id,disciplina_catalogo_id,assunto_catalogo_id,mode"
                )
                .single();

            if (error) {
                return json(
                    {
                        error:
                            "Erro ao finalizar sessão.",
                        details: error.message,
                    },
                    500
                );
            }

            if (!data) {
                return json(
                    {
                        error:
                            "Sessão não encontrada ou já finalizada.",
                    },
                    404
                );
            }

            return json({
                ok: true,
                session: data,
            });
        }

        if (action === "manual") {
            const manualBody =
                body as Partial<ManualPayload>;

            const durationSeconds = Number(
                manualBody.duration_seconds
            );

            if (
                !Number.isFinite(durationSeconds) ||
                durationSeconds <= 0 ||
                durationSeconds > 12 * 3600
            ) {
                return json(
                    {
                        error:
                            "duration_seconds deve ser um número > 0.",
                    },
                    400
                );
            }

            const endedAt =
                manualBody.ended_at
                    ? new Date(manualBody.ended_at)
                    : new Date();

            if (Number.isNaN(endedAt.getTime()) || endedAt.getTime() > Date.now() + 60_000) {
                return json(
                    { error: "Data inválida: não pode ser no futuro." },
                    400
                );
            }

            const startedAt =
                manualBody.started_at
                    ? new Date(manualBody.started_at)
                    : new Date(
                        endedAt.getTime() -
                        durationSeconds * 1000
                    );

            if (Number.isNaN(startedAt.getTime())) {
                return json(
                    { error: "started_at inválido." },
                    400
                );
            }

            const canonical =
                await resolveClassification(
                    userId,
                    manualBody
                );

            const { data, error } = await inserirSessao(
                    {
                        user_id: userId,

                        disciplina_catalogo_id:
                            canonical.disciplina_catalogo_id,
                        assunto_catalogo_id:
                            canonical.assunto_catalogo_id,

                        mode: "manual",
                        origem: "lancado",
                        started_at:
                            startedAt.toISOString(),
                        ended_at:
                            endedAt.toISOString(),
                        duration_seconds:
                            Math.floor(durationSeconds),
                    },
                "id,started_at,ended_at,duration_seconds,materia_id,assunto_id,disciplina_catalogo_id,assunto_catalogo_id,mode"
            );

            if (error) {
                return json(
                    {
                        error:
                            "Erro ao registrar sessão manual.",
                        details: error.message,
                    },
                    500
                );
            }

            return json({
                ok: true,
                session: data,
            });
        }

        return json(
            { error: "Ação inválida." },
            400
        );
    } catch (error) {
        return json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Erro inesperado.",
            },
            500
        );
    }
}
