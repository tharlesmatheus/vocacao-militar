"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Award,
    Brain,
    CheckCircle2,
    Clock3,
    Flame,
    LockKeyhole,
    Medal,
    RefreshCw,
    ShieldCheck,
    Sparkles,
    Star,
    Target,
    Trophy,
} from "lucide-react";

import { supabase } from "@/lib/supabaseClient";
import {
    getGamificationDashboard,
    setGamificationDailyGoal,
    syncGamificationTimezone,
    type GamificationAchievement,
    type GamificationDashboard,
    type GamificationEvent,
} from "@/lib/gamification";

type Filter = "TODAS" | "DESBLOQUEADAS" | "EM_PROGRESSO";

const rankTone: Record<string, string> = {
    Soldado: "text-slate-500",
    Cabo: "text-cyan-500",
    "Terceiro Sargento": "text-lime-500",
    "Segundo Sargento": "text-green-600",
    "Primeiro Sargento": "text-orange-600",
    Subtenente: "text-yellow-300",
    Aspirante: "text-yellow-500",
    "Segundo Tenente": "text-red-500",
    "Primeiro Tenente": "text-violet-600",
    Capitão: "text-amber-500",
    Major: "text-indigo-400",
    "Tenente Coronel": "text-indigo-600",
    Coronel: "text-orange-500",
    General: "text-yellow-500",
};

const rarityTone: Record<string, string> = {
    Comum: "border-slate-200 bg-slate-50 text-slate-700",
    Raro: "border-sky-200 bg-sky-50 text-sky-700",
    "Épico": "border-violet-200 bg-violet-50 text-violet-700",
    Lendário: "border-amber-200 bg-amber-50 text-amber-700",
};

function clampPct(value: number) {
    return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function formatNumber(value: number) {
    return new Intl.NumberFormat("pt-BR").format(Math.max(0, Math.round(value)));
}

function formatDateTime(value?: string | null) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function AchievementIcon({ achievement }: { achievement: GamificationAchievement }) {
    const base = "h-7 w-7";

    if (!achievement.unlocked) {
        return <LockKeyhole className={`${base} text-muted-foreground`} />;
    }

    switch (achievement.category) {
        case "RECUPERACAO":
            return <ShieldCheck className={`${base} text-emerald-600`} />;
        case "REVISAO":
            return <Brain className={`${base} text-indigo-600`} />;
        case "FLASHCARDS":
            return <Sparkles className={`${base} text-violet-600`} />;
        case "FOCO":
            return <Clock3 className={`${base} text-sky-600`} />;
        case "CONSTANCIA":
            return <Flame className={`${base} text-orange-500`} />;
        default:
            return <Trophy className={`${base} text-amber-500`} />;
    }
}

function eventPresentation(
    event: GamificationEvent
): { title: string; icon: React.ReactNode } {
    switch (event.event_type) {
        case "QUESTION_ATTEMPT":
            return { title: "Questão respondida", icon: <Target size={16} /> };
        case "QUESTION_CORRECT":
            return { title: "Resposta correta", icon: <CheckCircle2 size={16} /> };
        case "ERROR_RECOVERED":
            return { title: "Erro recuperado", icon: <ShieldCheck size={16} /> };
        case "REVIEW_COMPLETED":
            return { title: "Revisão concluída", icon: <Brain size={16} /> };
        case "FLASHCARD_REMEMBERED":
            return { title: "Flashcard lembrado", icon: <Sparkles size={16} /> };
        case "STUDY_SESSION":
            return { title: "Sessão de estudo", icon: <Clock3 size={16} /> };
        case "DAILY_GOAL_COMPLETED":
            return { title: "Meta diária concluída", icon: <Flame size={16} /> };
        case "ACHIEVEMENT_UNLOCKED":
            return { title: "Conquista desbloqueada", icon: <Trophy size={16} /> };
        case "LEGACY_REVIEW_COUNT":
            return { title: "Histórico de revisões importado", icon: <RefreshCw size={16} /> };
        default:
            return { title: "Progresso registrado", icon: <Star size={16} /> };
    }
}

export default function ConquistasPage() {
    const [dashboard, setDashboard] = useState<GamificationDashboard | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [savingGoal, setSavingGoal] = useState(false);
    const [error, setError] = useState("");
    const [filter, setFilter] = useState<Filter>("TODAS");
    const [category, setCategory] = useState("TODAS");
    const [userName, setUserName] = useState("Aluno");

    const load = useCallback(async (quiet = false) => {
        if (quiet) setRefreshing(true);
        else setLoading(true);

        setError("");

        try {
            const { data: auth, error: authError } = await supabase.auth.getUser();
            if (authError || !auth.user) {
                throw new Error("Usuário não autenticado.");
            }

            setUserName(
                auth.user.user_metadata?.nome ||
                auth.user.email?.split("@")[0] ||
                "Aluno"
            );

            try {
                await syncGamificationTimezone();
            } catch {
                // Fuso horário é uma melhoria de precisão; a página ainda pode carregar.
            }

            const data = await getGamificationDashboard();
            setDashboard(data);
        } catch (e: any) {
            setError(e?.message || "Não foi possível carregar sua central de conquistas.");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        load(false);
    }, [load]);

    useEffect(() => {
        let channel: ReturnType<typeof supabase.channel> | null = null;
        let active = true;

        (async () => {
            const { data } = await supabase.auth.getUser();
            const uid = data.user?.id;
            if (!uid || !active) return;

            channel = supabase
                .channel(`gamification-${uid}`)
                .on(
                    "postgres_changes",
                    {
                        event: "INSERT",
                        schema: "public",
                        table: "gamification_events",
                        filter: `user_id=eq.${uid}`,
                    },
                    () => {
                        load(true);
                    }
                )
                .subscribe();
        })();

        return () => {
            active = false;
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [load]);

    const categories = useMemo<string[]>(() => {
        const achievements: GamificationAchievement[] =
            dashboard?.achievements ?? [];

        const values = new Set<string>(
            achievements.map(
                (item: GamificationAchievement) => item.category
            )
        );

        return ["TODAS", ...Array.from(values)];
    }, [dashboard]);

    const filteredAchievements = useMemo<GamificationAchievement[]>(() => {
        let list: GamificationAchievement[] = dashboard?.achievements ?? [];

        if (category !== "TODAS") {
            list = list.filter(
                (item: GamificationAchievement) => item.category === category
            );
        }

        if (filter === "DESBLOQUEADAS") {
            list = list.filter(
                (item: GamificationAchievement) => item.unlocked
            );
        }

        if (filter === "EM_PROGRESSO") {
            list = list.filter(
                (item: GamificationAchievement) =>
                    !item.unlocked && item.current_value > 0
            );
        }

        return list;
    }, [dashboard, category, filter]);

    const unlockedCount = useMemo<number>(
        () =>
            (dashboard?.achievements ?? []).filter(
                (item: GamificationAchievement) => item.unlocked
            ).length,
        [dashboard]
    );

    const totalAchievements = dashboard?.achievements.length ?? 0;
    const achievementPct = totalAchievements
        ? (unlockedCount / totalAchievements) * 100
        : 0;

    async function changeGoal(goal: number) {
        if (savingGoal) return;

        setSavingGoal(true);
        setError("");

        try {
            await setGamificationDailyGoal(goal);
            await load(true);
        } catch (e: any) {
            setError(e?.message || "Não foi possível alterar a meta diária.");
        } finally {
            setSavingGoal(false);
        }
    }

    if (loading) {
        return (
            <main className="mx-auto flex min-h-[60vh] max-w-7xl items-center justify-center px-4">
                <div className="text-center">
                    <RefreshCw className="mx-auto h-7 w-7 animate-spin text-primary" />
                    <p className="mt-3 text-sm text-muted-foreground">
                        Carregando sua evolução...
                    </p>
                </div>
            </main>
        );
    }

    if (!dashboard) {
        return (
            <main className="mx-auto max-w-4xl px-4 py-10">
                <div className="rounded-2xl border border-border bg-card p-6">
                    <h1 className="text-xl font-semibold">Central de Gamificação</h1>
                    <p className="mt-2 text-sm text-destructive">
                        {error || "Não foi possível carregar os dados."}
                    </p>
                    <button
                        type="button"
                        onClick={() => load(false)}
                        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground"
                    >
                        <RefreshCw size={16} />
                        Tentar novamente
                    </button>
                </div>
            </main>
        );
    }

    const rankProgress = clampPct(dashboard.rank.progress);
    const dailyProgress = dashboard.daily.goal_target
        ? clampPct(
            (dashboard.daily.activity_points / dashboard.daily.goal_target) * 100
        )
        : 0;

    return (
        <main className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className="flex flex-col gap-6">
                <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                            <Trophy size={18} />
                            Central de Gamificação
                        </div>
                        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                            Evolução de {userName}
                        </h1>
                        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                            XP representa esforço útil. Conquistas representam marcos reais de
                            questões, recuperação de erros, revisão, foco e constância.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => load(true)}
                        disabled={refreshing}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"
                    >
                        <RefreshCw
                            size={16}
                            className={refreshing ? "animate-spin" : ""}
                        />
                        Atualizar
                    </button>
                </header>

                {error && (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                        {error}
                    </div>
                )}

                <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-6">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                                    <Medal
                                        className={`h-8 w-8 ${rankTone[dashboard.rank.current.title] ??
                                            "text-primary"
                                            }`}
                                    />
                                </div>
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        Patente atual
                                    </p>
                                    <h2 className="mt-1 text-2xl font-bold">
                                        {dashboard.rank.current.title}
                                    </h2>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {formatNumber(dashboard.profile.xp_total)} XP totais
                                    </p>
                                </div>
                            </div>
                            <Award className="h-6 w-6 text-primary" />
                        </div>

                        <div className="mt-6">
                            <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                                <span className="font-medium">
                                    {dashboard.rank.next
                                        ? `Rumo a ${dashboard.rank.next.title}`
                                        : "Patente máxima alcançada"}
                                </span>
                                <span className="text-muted-foreground">
                                    {dashboard.rank.next
                                        ? `${formatNumber(
                                            dashboard.rank.xp_into_rank
                                        )} / ${formatNumber(dashboard.rank.xp_span)} XP`
                                        : "100%"}
                                </span>
                            </div>
                            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                                <div
                                    className="h-full rounded-full bg-primary transition-all"
                                    style={{ width: `${rankProgress}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Sequência
                                </p>
                                <div className="mt-2 flex items-center gap-2">
                                    <Flame className="h-7 w-7 text-orange-500" />
                                    <span className="text-3xl font-bold">
                                        {dashboard.profile.current_streak}
                                    </span>
                                    <span className="text-sm text-muted-foreground">dias</span>
                                </div>
                            </div>
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">
                            Melhor sequência: {dashboard.profile.best_streak} dias.
                        </p>
                    </div>

                    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Conquistas
                        </p>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold">{unlockedCount}</span>
                            <span className="text-sm text-muted-foreground">
                                de {totalAchievements}
                            </span>
                        </div>
                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                            <div
                                className="h-full rounded-full bg-emerald-500"
                                style={{ width: `${clampPct(achievementPct)}%` }}
                            />
                        </div>
                    </div>
                </section>

                <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-8">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <div className="flex items-center gap-2">
                                    <Target className="h-5 w-5 text-primary" />
                                    <h2 className="font-semibold">Meta diária</h2>
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    A meta usa pontos de atividade, não cliques. Questões e
                                    revisões têm peso maior que tempo passivo.
                                </p>
                            </div>
                            <div className="text-left sm:text-right">
                                <div className="text-2xl font-bold">
                                    {dashboard.daily.activity_points} / {dashboard.daily.goal_target}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    +{dashboard.daily.xp_earned} XP hoje
                                </div>
                            </div>
                        </div>

                        <div className="mt-5 h-3 overflow-hidden rounded-full bg-muted">
                            <div
                                className={`h-full rounded-full transition-all ${dashboard.daily.goal_completed
                                    ? "bg-emerald-500"
                                    : "bg-primary"
                                    }`}
                                style={{ width: `${dailyProgress}%` }}
                            />
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            {[10, 20, 35].map((goal) => (
                                <button
                                    key={goal}
                                    type="button"
                                    disabled={savingGoal || dashboard.daily.goal_completed}
                                    onClick={() => changeGoal(goal)}
                                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${dashboard.profile.daily_goal === goal
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-border bg-card hover:bg-muted"
                                        }`}
                                >
                                    {goal === 10 ? "Leve" : goal === 20 ? "Normal" : "Intensa"}
                                    <span className="ml-1 opacity-80">({goal})</span>
                                </button>
                            ))}

                            {dashboard.daily.goal_completed && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                                    <CheckCircle2 size={14} />
                                    Meta concluída
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-4">
                        <div className="flex items-center gap-2">
                            <Star className="h-5 w-5 text-amber-500" />
                            <h2 className="font-semibold">Próxima conquista</h2>
                        </div>

                        {(() => {
                            const next = dashboard.achievements
                                .filter(
                                    (item: GamificationAchievement) => !item.unlocked
                                )
                                .sort(
                                    (a: GamificationAchievement, b: GamificationAchievement) =>
                                        b.progress - a.progress
                                )[0];

                            if (!next) {
                                return (
                                    <p className="mt-4 text-sm text-muted-foreground">
                                        Você desbloqueou todas as conquistas disponíveis.
                                    </p>
                                );
                            }

                            return (
                                <div className="mt-4">
                                    <div className="flex items-center gap-3">
                                        <AchievementIcon achievement={next} />
                                        <div className="min-w-0">
                                            <div className="font-semibold">{next.title}</div>
                                            <div className="mt-0.5 text-xs text-muted-foreground">
                                                {formatNumber(next.current_value)} / {formatNumber(next.threshold)}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                                        <div
                                            className="h-full rounded-full bg-primary"
                                            style={{ width: `${clampPct(next.progress)}%` }}
                                        />
                                    </div>
                                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                                        {next.description}
                                    </p>
                                </div>
                            );
                        })()}
                    </div>
                </section>

                <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold">Conquistas</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Itens bloqueados continuam visíveis para que o próximo objetivo seja claro.
                            </p>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                            <div className="flex rounded-xl border border-border bg-muted p-1">
                                {(
                                    [
                                        ["TODAS", "Todas"],
                                        ["EM_PROGRESSO", "Em progresso"],
                                        ["DESBLOQUEADAS", "Conquistadas"],
                                    ] as const
                                ).map(([key, label]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setFilter(key)}
                                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${filter === key
                                            ? "bg-background shadow-sm"
                                            : "text-muted-foreground"
                                            }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>

                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none"
                            >
                                {categories.map((item: string) => (
                                    <option key={item} value={item}>
                                        {item === "TODAS" ? "Todas as categorias" : item}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {filteredAchievements.map((item: GamificationAchievement) => (
                            <article
                                key={item.code}
                                className={`relative rounded-2xl border p-5 transition ${item.unlocked
                                    ? "border-border bg-background shadow-sm"
                                    : "border-border/80 bg-muted/30"
                                    }`}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted">
                                        <AchievementIcon achievement={item} />
                                    </div>
                                    <span
                                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${rarityTone[item.rarity] ??
                                            "border-border bg-muted text-muted-foreground"
                                            }`}
                                    >
                                        {item.rarity}
                                    </span>
                                </div>

                                <h3 className="mt-4 font-bold">{item.title}</h3>
                                <p className="mt-1 min-h-[40px] text-sm leading-relaxed text-muted-foreground">
                                    {item.description}
                                </p>

                                <div className="mt-4 flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">
                                        {formatNumber(Math.min(item.current_value, item.threshold))} / {formatNumber(item.threshold)}
                                    </span>
                                    <span className="font-semibold text-primary">
                                        +{formatNumber(item.xp_bonus)} XP
                                    </span>
                                </div>

                                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                                    <div
                                        className={`h-full rounded-full transition-all ${item.unlocked ? "bg-emerald-500" : "bg-primary"
                                            }`}
                                        style={{ width: `${clampPct(item.progress)}%` }}
                                    />
                                </div>

                                <div className="mt-3 text-xs text-muted-foreground">
                                    {item.unlocked ? (
                                        <span className="inline-flex items-center gap-1 text-emerald-700">
                                            <CheckCircle2 size={13} />
                                            Conquistada {formatDateTime(item.unlocked_at)}
                                        </span>
                                    ) : (
                                        `${Math.round(clampPct(item.progress))}% concluído`
                                    )}
                                </div>
                            </article>
                        ))}
                    </div>

                    {filteredAchievements.length === 0 && (
                        <div className="py-10 text-center text-sm text-muted-foreground">
                            Nenhuma conquista corresponde aos filtros selecionados.
                        </div>
                    )}
                </section>

                <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        <h2 className="text-lg font-semibold">Atividade de XP</h2>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Últimos eventos reconhecidos pelo motor de gamificação.
                    </p>

                    <div className="mt-5 divide-y divide-border">
                        {dashboard.recent_events.length === 0 ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">
                                Ainda não há eventos de gamificação.
                            </div>
                        ) : (
                            dashboard.recent_events.map((event: GamificationEvent) => {
                                const present = eventPresentation(event);
                                return (
                                    <div
                                        key={event.id}
                                        className="flex items-center justify-between gap-4 py-3"
                                    >
                                        <div className="flex min-w-0 items-center gap-3">
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
                                                {present.icon}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-medium">
                                                    {present.title}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {formatDateTime(event.occurred_at)}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="shrink-0 text-sm font-bold text-primary">
                                            {event.xp > 0 ? `+${event.xp} XP` : "—"}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </section>
            </div>
        </main>
    );
}
