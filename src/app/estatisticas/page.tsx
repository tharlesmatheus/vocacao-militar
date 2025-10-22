"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    ResponsiveContainer,
    Tooltip,
    CartesianGrid,
} from "recharts";

/** Tipos e helpers */
type Phase = "study" | "break";
type Daily = { dia: string; tempo_min: number };
type TopItem = { nome: string; minutos: number };

type Maps = {
    edital: Record<string, string>;
    materia: Record<string, string>;
    assunto: Record<string, string>;
};

const ONE_DAY = 24 * 60 * 60 * 1000;

function startOfLocalDay(ts = Date.now()) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d;
}
function iso(dt: Date) {
    return dt.toISOString();
}
function fmtHMS(totalSeconds: number) {
    const d = Math.floor(totalSeconds / 86400);
    const h = Math.floor((totalSeconds % 86400) / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const parts: string[] = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    if (m || (!d && !h)) parts.push(`${m}m`);
    return parts.join(" ");
}
function toLocalDateLabel(dt: string | Date) {
    const d = typeof dt === "string" ? new Date(dt) : dt;
    return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
}
function clampMin0(n: number) {
    return n < 0 ? 0 : n;
}

/** Página */
export default function EstatisticasPage() {
    const [days, setDays] = useState<7 | 30 | 90>(7);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    // métricas
    const [tempoTotalSeg, setTempoTotalSeg] = useState(0);
    const [sessoesCount, setSessoesCount] = useState(0);
    const [mediaSessaoMin, setMediaSessaoMin] = useState(0);
    const [streakDias, setStreakDias] = useState(0);

    const [resumosPeriodo, setResumosPeriodo] = useState(0);
    const [resumosTotal, setResumosTotal] = useState(0);

    const [revisoesPeriodo, setRevisoesPeriodo] = useState(0);
    const [revisoesTotal, setRevisoesTotal] = useState(0);
    const [revisoesPendentes, setRevisoesPendentes] = useState(0);

    // séries/gráficos
    const [diario, setDiario] = useState<Daily[]>([]);
    const [topMaterias, setTopMaterias] = useState<TopItem[]>([]);
    const [topAssuntos, setTopAssuntos] = useState<TopItem[]>([]);

    // mapas de nomes
    const [maps, setMaps] = useState<Maps>({ edital: {}, materia: {}, assunto: {} });

    useEffect(() => {
        (async () => {
            setLoading(true);
            setErro(null);
            try {
                // 1) usuário
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error("Não foi possível obter usuário logado.");
                const uid = user.id;

                // 2) datas
                const today0 = startOfLocalDay();
                const from = new Date(today0.getTime() - (days - 1) * ONE_DAY); // inclui hoje
                const fromISO = iso(from);

                // 3) nomes para mapeamento
                const [eds, mats, asss] = await Promise.all([
                    supabase.from("editais").select("id,nome").eq("user_id", uid),
                    supabase.from("materias").select("id,nome").eq("user_id", uid),
                    supabase.from("assuntos").select("id,nome").eq("user_id", uid),
                ]);
                const editalMap: Record<string, string> = {};
                (eds.data ?? []).forEach((e: any) => (editalMap[e.id] = e.nome));
                const materiaMap: Record<string, string> = {};
                (mats.data ?? []).forEach((m: any) => (materiaMap[m.id] = m.nome));
                const assuntoMap: Record<string, string> = {};
                (asss.data ?? []).forEach((a: any) => (assuntoMap[a.id] = a.nome));
                setMaps({ edital: editalMap, materia: materiaMap, assunto: assuntoMap });

                // 4) Pomodoro (somente study + finalizados)
                const { data: sess } = await supabase
                    .from("pomodoro_sessions")
                    .select("phase, duration_seconds, started_at, materia_id, assunto_id")
                    .eq("user_id", uid)
                    .eq("phase", "study" as Phase)
                    .not("duration_seconds", "is", null)
                    .gte("started_at", fromISO)
                    .order("started_at", { ascending: true });

                // 5) Resumos (período + total)
                const [resPeriodo, resTot] = await Promise.all([
                    supabase
                        .from("resumos")
                        .select("id", { count: "exact", head: true })
                        .eq("user_id", uid)
                        .gte("created_at", fromISO),
                    supabase
                        .from("resumos")
                        .select("id", { count: "exact", head: true })
                        .eq("user_id", uid),
                ]);
                setResumosPeriodo(resPeriodo.count ?? 0);
                setResumosTotal(resTot.count ?? 0);

                // 6) Revisões (concluídas período + total + pendentes)
                const [revPeriodo, revTot, revPend] = await Promise.all([
                    supabase
                        .from("revisoes")
                        .select("id", { count: "exact", head: true })
                        .eq("user_id", uid)
                        .not("done_at", "is", null)
                        .gte("done_at", fromISO),
                    supabase
                        .from("revisoes")
                        .select("id", { count: "exact", head: true })
                        .eq("user_id", uid)
                        .not("done_at", "is", null),
                    supabase
                        .from("revisoes")
                        .select("id", { count: "exact", head: true })
                        .eq("user_id", uid)
                        .is("done_at", null),
                ]);
                setRevisoesPeriodo(revPeriodo.count ?? 0);
                setRevisoesTotal(revTot.count ?? 0);
                setRevisoesPendentes(revPend.count ?? 0);

                // 7) Processa sessões → métricas e séries
                const sessions = (sess ?? []) as Array<{
                    duration_seconds: number | null;
                    started_at: string;
                    materia_id: string | null;
                    assunto_id: string | null;
                }>;

                // base diária com todos os dias do período (0 minutos)
                const daysArr: Daily[] = Array.from({ length: days }, (_, i) => {
                    const d = new Date(from.getTime() + i * ONE_DAY);
                    return { dia: toLocalDateLabel(d), tempo_min: 0 };
                });

                let totalSeconds = 0;
                let count = 0;
                const byDay: Record<string, number> = {};
                const byMateria: Record<string, number> = {};
                const byAssunto: Record<string, number> = {};

                for (const s of sessions) {
                    const dur = s.duration_seconds ?? 0;
                    totalSeconds += dur;
                    count += 1;

                    // agrupa por dia (local)
                    const d = new Date(s.started_at);
                    const k = startOfLocalDay(d.getTime()).toISOString().slice(0, 10); // key yyyy-mm-dd
                    byDay[k] = (byDay[k] ?? 0) + dur;

                    // por matéria/assunto (para ranking)
                    if (s.materia_id) byMateria[s.materia_id] = (byMateria[s.materia_id] ?? 0) + dur;
                    if (s.assunto_id) byAssunto[s.assunto_id] = (byAssunto[s.assunto_id] ?? 0) + dur;
                }

                // preenche série diária (em minutos)
                for (let i = 0; i < days; i++) {
                    const d = new Date(from.getTime() + i * ONE_DAY);
                    const key = d.toISOString().slice(0, 10);
                    const sec = byDay[key] ?? 0;
                    daysArr[i].tempo_min = Math.round(sec / 60);
                }
                setDiario(daysArr);

                setTempoTotalSeg(totalSeconds);
                setSessoesCount(count);
                setMediaSessaoMin(count ? Math.round(totalSeconds / 60 / count) : 0);

                // streak diário (conta dias consecutivos com >0 minuto, terminando hoje)
                let streak = 0;
                for (let i = daysArr.length - 1; i >= 0; i--) {
                    if (daysArr[i].tempo_min > 0) streak++;
                    else break;
                }
                setStreakDias(streak);

                // Top 5 matérias e assuntos (min)
                const topM = Object.entries(byMateria)
                    .map(([id, sec]) => ({ nome: mapsLabel(id, materiaMap), minutos: Math.round(sec / 60) }))
                    .sort((a, b) => b.minutos - a.minutos)
                    .slice(0, 5);
                const topA = Object.entries(byAssunto)
                    .map(([id, sec]) => ({ nome: mapsLabel(id, assuntoMap), minutos: Math.round(sec / 60) }))
                    .sort((a, b) => b.minutos - a.minutos)
                    .slice(0, 5);
                setTopMaterias(topM);
                setTopAssuntos(topA);

                function mapsLabel(id: string, map: Record<string, string>) {
                    return map[id] || id.slice(0, 8) + "…";
                }
            } catch (e: any) {
                setErro(e?.message || "Falha ao carregar estatísticas.");
            } finally {
                setLoading(false);
            }
        })();
    }, [days]);

    const cards = useMemo(() => {
        return [
            { label: "Tempo estudado", valor: fmtHMS(tempoTotalSeg) },
            { label: "Sessões (Pomodoro)", valor: sessoesCount },
            { label: "Média por sessão", valor: `${mediaSessaoMin} min` },
            { label: "Resumos no período", valor: resumosPeriodo },
            { label: "Revisões concluídas", valor: revisoesPeriodo },
            { label: "Streak de estudo", valor: `${streakDias} dia(s)` },
        ];
    }, [tempoTotalSeg, sessoesCount, mediaSessaoMin, resumosPeriodo, revisoesPeriodo, streakDias]);

    return (
        <div className="w-full max-w-6xl mx-auto px-2 sm:px-4 md:px-8 py-8 flex flex-col gap-8">
            {/* header de período */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-2xl font-semibold">Estatísticas</h1>
                <div className="flex gap-2">
                    {[7, 30, 90].map((n) => (
                        <button
                            key={n}
                            onClick={() => setDays(n as 7 | 30 | 90)}
                            className={`rounded-xl px-3 py-1.5 border ${days === n ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border"
                                }`}
                        >
                            {n} dias
                        </button>
                    ))}
                </div>
            </div>

            {/* feedback */}
            {loading && <div className="text-center text-muted-foreground font-semibold">Carregando estatísticas…</div>}
            {erro && <div className="text-center text-destructive font-semibold">{erro}</div>}

            {!loading && !erro && (
                <>
                    {/* Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                        {cards.map((c, i) => (
                            <div key={i} className="rounded-2xl bg-card border border-border py-6 px-2 flex flex-col items-center shadow-sm">
                                <span className="text-xs sm:text-sm text-muted-foreground mb-1 font-medium">{c.label}</span>
                                <span className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">{c.valor}</span>
                            </div>
                        ))}
                    </div>

                    {/* Série diária: Tempo estudado */}
                    <div className="bg-card rounded-2xl shadow-lg border border-border px-4 sm:px-8 py-6">
                        <h2 className="text-base sm:text-lg font-bold mb-4 text-foreground">Tempo estudado por dia (min)</h2>
                        <div className="w-full h-48 sm:h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={diario}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                    <XAxis dataKey="dia" stroke="var(--muted-foreground)" fontSize={13} />
                                    <YAxis stroke="var(--muted-foreground)" fontSize={13} allowDecimals={false} />
                                    <Tooltip
                                        contentStyle={{
                                            background: "var(--muted)",
                                            border: "1px solid var(--border)",
                                            color: "var(--foreground)",
                                            fontFamily: "inherit",
                                            borderRadius: 12,
                                        }}
                                        cursor={{ fill: "var(--primary)", opacity: 0.1 }}
                                    />
                                    <Bar dataKey="tempo_min" fill="var(--primary)" radius={[8, 8, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Rankings */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="bg-card rounded-2xl shadow-lg border border-border px-4 sm:px-8 py-6">
                            <h2 className="text-base sm:text-lg font-bold mb-4 text-foreground">Top 5 matérias por tempo (min)</h2>
                            <div className="w-full h-48">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={topMaterias}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                        <XAxis dataKey="nome" stroke="var(--muted-foreground)" fontSize={12} interval={0} angle={-20} height={60} />
                                        <YAxis stroke="var(--muted-foreground)" fontSize={13} allowDecimals={false} />
                                        <Tooltip
                                            contentStyle={{
                                                background: "var(--muted)",
                                                border: "1px solid var(--border)",
                                                color: "var(--foreground)",
                                                fontFamily: "inherit",
                                                borderRadius: 12,
                                            }}
                                            cursor={{ fill: "var(--primary)", opacity: 0.1 }}
                                        />
                                        <Bar dataKey="minutos" fill="var(--primary)" radius={[8, 8, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="bg-card rounded-2xl shadow-lg border border-border px-4 sm:px-8 py-6">
                            <h2 className="text-base sm:text-lg font-bold mb-4 text-foreground">Top 5 assuntos por tempo (min)</h2>
                            <div className="w-full h-48">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={topAssuntos}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                        <XAxis dataKey="nome" stroke="var(--muted-foreground)" fontSize={12} interval={0} angle={-20} height={60} />
                                        <YAxis stroke="var(--muted-foreground)" fontSize={13} allowDecimals={false} />
                                        <Tooltip
                                            contentStyle={{
                                                background: "var(--muted)",
                                                border: "1px solid var(--border)",
                                                color: "var(--foreground)",
                                                fontFamily: "inherit",
                                                borderRadius: 12,
                                            }}
                                            cursor={{ fill: "var(--primary)", opacity: 0.1 }}
                                        />
                                        <Bar dataKey="minutos" fill="var(--primary)" radius={[8, 8, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Rodapé com totais gerais */}
                    <div className="rounded-2xl bg-card border border-border px-4 sm:px-8 py-5">
                        <div className="text-sm text-muted-foreground">
                            <div className="flex flex-wrap gap-x-6 gap-y-2">
                                <span><strong>Resumos (total):</strong> {resumosTotal}</span>
                                <span><strong>Revisões concluídas (total):</strong> {revisoesTotal}</span>
                                <span><strong>Revisões pendentes:</strong> {revisoesPendentes}</span>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
