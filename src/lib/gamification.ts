import { supabase } from "@/lib/supabaseClient";

export type GamificationAchievement = {
    code: string;
    title: string;
    description: string;
    category: string;
    rarity: string;
    metric: string;
    threshold: number;
    xp_bonus: number;
    current_value: number;
    progress: number;
    unlocked: boolean;
    unlocked_at: string | null;
};

export type GamificationEvent = {
    id: string;
    event_type: string;
    source_type: string | null;
    source_id: string | null;
    xp: number;
    metadata: Record<string, unknown>;
    occurred_at: string;
};

export type GamificationDashboard = {
    profile: {
        xp_total: number;
        current_streak: number;
        best_streak: number;
        last_qualified_date: string | null;
        daily_goal: number;
        timezone: string;
    };
    rank: {
        current: {
            code: string;
            title: string;
            min_xp: number;
        };
        next: {
            code: string;
            title: string;
            min_xp: number;
        } | null;
        progress: number;
        xp_into_rank: number;
        xp_span: number;
    };
    daily: {
        date: string;
        activity_points: number;
        xp_earned: number;
        goal_target: number;
        goal_completed: boolean;
        goal_completed_at: string | null;
    };
    achievements: GamificationAchievement[];
    recent_events: GamificationEvent[];
};

function normalizeDashboard(raw: any): GamificationDashboard {
    const profile = raw?.profile ?? {};
    const rank = raw?.rank ?? {};
    const daily = raw?.daily ?? {};

    return {
        profile: {
            xp_total: Number(profile.xp_total ?? 0),
            current_streak: Number(profile.current_streak ?? 0),
            best_streak: Number(profile.best_streak ?? 0),
            last_qualified_date: profile.last_qualified_date ?? null,
            daily_goal: Number(profile.daily_goal ?? 20),
            timezone: String(profile.timezone ?? "America/Sao_Paulo"),
        },
        rank: {
            current: {
                code: String(rank?.current?.code ?? "SOLDADO"),
                title: String(rank?.current?.title ?? "Soldado"),
                min_xp: Number(rank?.current?.min_xp ?? 0),
            },
            next: rank?.next
                ? {
                    code: String(rank.next.code),
                    title: String(rank.next.title),
                    min_xp: Number(rank.next.min_xp ?? 0),
                }
                : null,
            progress: Number(rank.progress ?? 0),
            xp_into_rank: Number(rank.xp_into_rank ?? 0),
            xp_span: Number(rank.xp_span ?? 0),
        },
        daily: {
            date: String(daily.date ?? ""),
            activity_points: Number(daily.activity_points ?? 0),
            xp_earned: Number(daily.xp_earned ?? 0),
            goal_target: Number(daily.goal_target ?? profile.daily_goal ?? 20),
            goal_completed: Boolean(daily.goal_completed),
            goal_completed_at: daily.goal_completed_at ?? null,
        },
        achievements: Array.isArray(raw?.achievements)
            ? raw.achievements.map((item: any) => ({
                code: String(item.code ?? ""),
                title: String(item.title ?? ""),
                description: String(item.description ?? ""),
                category: String(item.category ?? "GERAL"),
                rarity: String(item.rarity ?? "Comum"),
                metric: String(item.metric ?? ""),
                threshold: Number(item.threshold ?? 0),
                xp_bonus: Number(item.xp_bonus ?? 0),
                current_value: Number(item.current_value ?? 0),
                progress: Number(item.progress ?? 0),
                unlocked: Boolean(item.unlocked),
                unlocked_at: item.unlocked_at ?? null,
            }))
            : [],
        recent_events: Array.isArray(raw?.recent_events)
            ? raw.recent_events.map((item: any) => ({
                id: String(item.id ?? ""),
                event_type: String(item.event_type ?? ""),
                source_type: item.source_type ?? null,
                source_id: item.source_id ?? null,
                xp: Number(item.xp ?? 0),
                metadata:
                    item.metadata && typeof item.metadata === "object"
                        ? item.metadata
                        : {},
                occurred_at: String(item.occurred_at ?? ""),
            }))
            : [],
    };
}

export async function getGamificationDashboard(): Promise<GamificationDashboard> {
    const { data, error } = await supabase.rpc("get_gamification_dashboard");

    if (error) {
        throw new Error(error.message || "Não foi possível carregar a gamificação.");
    }

    return normalizeDashboard(data);
}

export async function setGamificationDailyGoal(goal: number) {
    const clean = Math.max(5, Math.min(100, Math.round(goal)));
    const { data, error } = await supabase.rpc("set_gamification_daily_goal", {
        p_goal: clean,
    });

    if (error) {
        throw new Error(error.message || "Não foi possível alterar a meta diária.");
    }

    return data;
}

export async function syncGamificationTimezone() {
    const timezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";

    const { error } = await supabase.rpc("set_gamification_timezone", {
        p_timezone: timezone,
    });

    if (error) {
        throw new Error(error.message || "Não foi possível sincronizar o fuso horário.");
    }
}

export async function recordReviewResultForGamification(params: {
    method: "CADERNO" | "FLASHCARD" | "RESUMO";
    itemId: string;
    result: "ACERTO" | "ERRO" | "CONCLUIDO";
}) {
    const { data, error } = await supabase.rpc(
        "record_review_result_for_gamification",
        {
            p_method: params.method,
            p_item_id: params.itemId,
            p_result: params.result,
        }
    );

    if (error) {
        throw new Error(error.message || "Não foi possível registrar a recompensa da revisão.");
    }

    return {
        ok: Boolean(data?.ok),
        bonusXp: Number(data?.bonus_xp ?? 0),
        xpTotal: Number(data?.xp_total ?? 0),
    };
}
