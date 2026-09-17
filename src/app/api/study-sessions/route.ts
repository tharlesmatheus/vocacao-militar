// =====================================================================================
// ARQUIVO: src/app/api/study-sessions/route.ts
//
// Compatível com:
// - fluxo legado: materia_id / assunto_id
// - fluxo canônico: disciplina_catalogo_id / assunto_catalogo_id
//
// A página nova de Tempo de Estudo usa o catálogo canônico.
// A landing antiga ainda pode enviar materia_id/assunto_id; a API converte
// esses IDs para o catálogo canônico sempre que encontra correspondência.
// =====================================================================================

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Action = "start" | "stop" | "manual";

type StartPayload = {
    action: "start";
    access_token: string;

    disciplina_catalogo_id?: string | null;
    assunto_catalogo_id?: string | null;

    // Compatibilidade com telas ainda não migradas.
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

    // Compatibilidade com telas ainda não migradas.
    materia_id?: string | null;
    assunto_id?: string | null;

    duration_seconds: number;
    ended_at?: string;
    started_at?: string;
};

type Body = StartPayload | StopPayload | ManualPayload;

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

function normalizeCatalogName(value: string | null | undefined) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR")
        .replace(/[^a-z0-9]+/g, "");
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

async function resolveCanonicalFromLegacy(
    userId: string,
    materiaId: string | null,
    assuntoId: string | null
) {
    if (!materiaId) {
        return {
            disciplina_catalogo_id: null,
            assunto_catalogo_id: null,
        };
    }

    const { data: materia, error: materiaError } =
        await supabaseAdmin
            .from("materias")
            .select("id,nome")
            .eq("id", materiaId)
            .eq("user_id", userId)
            .maybeSingle();

    if (materiaError || !materia) {
        return {
            disciplina_catalogo_id: null,
            assunto_catalogo_id: null,
        };
    }

    const disciplinaKey = normalizeCatalogName(materia.nome);

    const { data: disciplina } = await supabaseAdmin
        .from("questao_disciplinas")
        .select("id")
        .eq("user_id", userId)
        .eq("nome_normalizado", disciplinaKey)
        .maybeSingle();

    if (!disciplina?.id) {
        return {
            disciplina_catalogo_id: null,
            assunto_catalogo_id: null,
        };
    }

    if (!assuntoId) {
        return {
            disciplina_catalogo_id: disciplina.id,
            assunto_catalogo_id: null,
        };
    }

    const { data: assuntoLegado } = await supabaseAdmin
        .from("assuntos")
        .select("id,nome,materia_id")
        .eq("id", assuntoId)
        .eq("user_id", userId)
        .maybeSingle();

    if (
        !assuntoLegado?.id ||
        String(assuntoLegado.materia_id ?? "") !== String(materiaId)
    ) {
        return {
            disciplina_catalogo_id: disciplina.id,
            assunto_catalogo_id: null,
        };
    }

    const assuntoKey = normalizeCatalogName(assuntoLegado.nome);

    const { data: assuntoCanonico } = await supabaseAdmin
        .from("questao_assuntos")
        .select("id")
        .eq("user_id", userId)
        .eq("disciplina_id", disciplina.id)
        .eq("nome_normalizado", assuntoKey)
        .maybeSingle();

    return {
        disciplina_catalogo_id: disciplina.id,
        assunto_catalogo_id: assuntoCanonico?.id ?? null,
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

    const materiaId = body.materia_id ?? null;
    const assuntoId = body.assunto_id ?? null;

    if (disciplinaCatalogoId || assuntoCatalogoId) {
        return validateCanonicalPair(
            userId,
            disciplinaCatalogoId,
            assuntoCatalogoId
        );
    }

    return resolveCanonicalFromLegacy(
        userId,
        materiaId,
        assuntoId
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

            const materiaId = startBody.materia_id ?? null;
            const assuntoId = startBody.assunto_id ?? null;

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

            if (openSessions?.length) {
                return json({
                    ok: true,
                    session: openSessions[0],
                    reused_open_session: true,
                });
            }

            const { data, error } = await supabaseAdmin
                .from("study_sessions")
                .insert([
                    {
                        user_id: userId,

                        // Canônico
                        disciplina_catalogo_id:
                            canonical.disciplina_catalogo_id,
                        assunto_catalogo_id:
                            canonical.assunto_catalogo_id,

                        // Legado opcional
                        materia_id: materiaId,
                        assunto_id: assuntoId,

                        mode: "cronometro",
                        started_at:
                            new Date().toISOString(),
                    },
                ])
                .select(
                    "id,started_at,materia_id,assunto_id,disciplina_catalogo_id,assunto_catalogo_id,mode"
                )
                .single();

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

            const { data, error } = await supabaseAdmin
                .from("study_sessions")
                .update({
                    ended_at:
                        new Date().toISOString(),
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
                durationSeconds <= 0
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

            if (Number.isNaN(endedAt.getTime())) {
                return json(
                    { error: "ended_at inválido." },
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

            const { data, error } = await supabaseAdmin
                .from("study_sessions")
                .insert([
                    {
                        user_id: userId,

                        disciplina_catalogo_id:
                            canonical.disciplina_catalogo_id,
                        assunto_catalogo_id:
                            canonical.assunto_catalogo_id,

                        materia_id:
                            manualBody.materia_id ?? null,
                        assunto_id:
                            manualBody.assunto_id ?? null,

                        mode: "manual",
                        started_at:
                            startedAt.toISOString(),
                        ended_at:
                            endedAt.toISOString(),
                        duration_seconds:
                            Math.floor(durationSeconds),
                    },
                ])
                .select(
                    "id,started_at,ended_at,duration_seconds,materia_id,assunto_id,disciplina_catalogo_id,assunto_catalogo_id,mode"
                )
                .single();

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
