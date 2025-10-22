"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    BarChart,
    Bar,
} from "recharts";

/* ===================== HELPERS ===================== */
type Daily = { dia: string; minutos: number; questoes: number };
type TopItem = { nome: string; valor: number };

const ONE_DAY = 24 * 60 * 60 * 1000;
const fmtHMS = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h ? `${h}h ${m}m` : `${m}m`;
};
const startOfLocalDay = (t = Date.now()) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d;
};
const br = (d: Date) => d.toLocaleDateString("pt-BR");

/* ===================== PAGE ===================== */
export default function EstatisticasPage() {
    const [days, setDays] = useState<7 | 30 | 90>(30);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    // cards
    const [tempoTotalSeg, setTempoTotalSeg] = useState(0);
    const [sessoes, setSessoes] = useState(0);
    const [questoesTotal, setQuestoesTotal] = useState(0);
    const [acertoTotal, setAcertoTotal] = useState(0);

    // séries/gráficos
    const [serie, setSerie] = useState<Daily[]>([]);
    const [topMateriasTempo, setTopMateriasTempo] = useState<TopItem[]>([]);
    const [topAssuntosTempo, setTopAssuntosTempo] = useState<TopItem[]>([]);
    const [matAcc, setMatAcc] = useState<TopItem[]>([]);
    const [assAcc, setAssAcc] = useState<TopItem[]>([]);

    useEffect(() => {
        (async () => {
            setLoading(true);
            setErro(null);
            try {
                const {
                    data: { user },
                } = await supabase.auth.getUser();
                if (!user) throw new Error("Sem usuário.");

                // janelas
                const today0 = startOfLocalDay();
                const from = new Date(today0.getTime() - (days - 1) * ONE_DAY);
                const fromISO = from.toISOString();

                /* ---------- nomes de matérias/assuntos ---------- */
                const [mats, asss] = await Promise.all([
                    supabase.from("materias").select("id,nome").eq("user_id", user.id),
                    supabase.from("assuntos").select("id,nome").eq("user_id", user.id),
                ]);
                const matName: Record<string, string> = {};
                (mats.data ?? []).forEach((m: any) => (matName[m.id] = m.nome));
                const assName: Record<string, string> = {};
                (asss.data ?? []).forEach((a: any) => (assName[a.id] = a.nome));

                /* ---------- Pomodoro (se existir) ---------- */
                const { data: sess } = await supabase
                    .from("pomodoro_sessions")
                    .select("phase,duration_seconds,started_at,materia_id,assunto_id")
                    .eq("user_id", user.id)
                    .eq("phase", "study")
                    .not("duration_seconds", "is", null)
                    .gte("started_at", fromISO)
                    .order("started_at", { ascending: true });

                const byDayMin: Record<string, number> = {};
                const byMatSec: Record<string, number> = {};
                const byAssSec: Record<string, number> = {};

                let totalSec = 0;
                let count = 0;

                for (const s of sess ?? []) {
                    const dur = s.duration_seconds ?? 0;
                    totalSec += dur;
                    count++;
                    const d = new Date(s.started_at);
                    const key = new Date(d.getFullYear(), d.getMonth(), d.getDate())
                        .toISOString()
                        .slice(0, 10);
                    byDayMin[key] = (byDayMin[key] ?? 0) + Math.round(dur / 60);

                    if (s.materia_id)
                        byMatSec[s.materia_id] = (byMatSec[s.materia_id] ?? 0) + dur;
                    if (s.assunto_id)
                        byAssSec[s.assunto_id] = (byAssSec[s.assunto_id] ?? 0) + dur;
                }

                setTempoTotalSeg(totalSec);
                setSessoes(count);

                /* ---------- Estatísticas (única tabela) ---------- */
                const { data: est } = await supabase
                    .from("estatisticas")
                    .select("questoes_respondidas,taxa_acerto,progresso_semanal,acc_por_materia,acc_por_assunto")
                    .eq("user_id", user.id)
                    .maybeSingle();

                setQuestoesTotal(est?.questoes_respondidas ?? 0);
                setAcertoTotal(Math.round(Number(est?.taxa_acerto ?? 0)));

                // map de questões por dia (progresso_semanal usa dd/MM/yyyy)
                const progArr: Array<{ dia: string; questoes: number }> = Array.isArray(
                    est?.progresso_semanal
                )
                    ? est!.progresso_semanal
                    : [];

                const byDayQ: Record<string, number> = {};
                for (const p of progArr) {
                    // converte dd/MM/yyyy -> ISO-day
                    const [dd, mm, yyyy] = String(p.dia || "").split("/");
                    if (dd && mm && yyyy) {
                        const key = new Date(
                            Number(yyyy),
                            Number(mm) - 1,
                            Number(dd)
                        )
                            .toISOString()
                            .slice(0, 10);
                        byDayQ[key] = (byDayQ[key] ?? 0) + Number(p.questoes ?? 0);
                    }
                }

                // série unificada (dias contínuos)
                const s: Daily[] = [];
                for (let i = 0; i < days; i++) {
                    const d = new Date(from.getTime() + i * ONE_DAY);
                    const iso = new Date(d.getFullYear(), d.getMonth(), d.getDate())
                        .toISOString()
                        .slice(0, 10);
                    s.push({
                        dia: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
                        minutos: byDayMin[iso] ?? 0,
                        questoes: byDayQ[iso] ?? 0,
                    });
                }
                setSerie(s);

                // top 5 tempo (mat/ass)
                setTopMateriasTempo(
                    Object.entries(byMatSec)
                        .map(([id, sec]) => ({ nome: matName[id] || id.slice(0, 8) + "…", valor: Math.round(sec / 60) }))
                        .sort((a, b) => b.valor - a.valor)
                        .slice(0, 5)
                );
                setTopAssuntosTempo(
                    Object.entries(byAssSec)
                        .map(([id, sec]) => ({ nome: assName[id] || id.slice(0, 8) + "…", valor: Math.round(sec / 60) }))
                        .sort((a, b) => b.valor - a.valor)
                        .slice(0, 5)
                );

                // acertos por matéria/assunto (TOTAL)
                const matsAcc = (est?.acc_por_materia ?? {}) as Record<
                    string,
                    { total: number; corretas: number }
                >;
                const asssAcc = (est?.acc_por_assunto ?? {}) as Record<
                    string,
                    { total: number; corretas: number }
                >;

                setMatAcc(
                    Object.entries(matsAcc)
                        .map(([id, v]) => ({
                            nome: matName[id] || id.slice(0, 8) + "…",
                            valor: v.total ? Math.round((v.corretas / v.total) * 100) : 0,
                        }))
                        .sort((a, b) => b.valor - a.valor)
                        .slice(0, 8)
                );

                setAssAcc(
                    Object.entries(asssAcc)
                        .map(([id, v]) => ({
                            nome: assName[id] || id.slice(0, 8) + "…",
                            valor: v.total ? Math.round((v.corretas / v.total) * 100) : 0,
                        }))
                        .sort((a, b) => b.valor - a.valor)
                        .slice(0, 8)
                );
            } catch (e: any) {
                setErro(e?.message || "Falha ao carregar.");
            } finally {
                setLoading(false);
            }
        })();
    }, [days]);

    const cards = useMemo(
        () => [
            { label: "Tempo total", value: fmtHMS(tempoTotalSeg), icon: "⏱️", tone: "from-sky-500 to-cyan-500" },
            { label: "Sessões", value: sessoes, icon: "🍅", tone: "from-violet-500 to-fuchsia-500" },
            { label: "Questões (total)", value: questoesTotal, icon: "🧮", tone: "from-emerald-500 to-teal-500" },
            { label: "Acerto (total)", value: `${acertoTotal}%`, icon: "✅", tone: "from-amber-500 to-orange-500" },
        ],
        [tempoTotalSeg, sessoes, questoesTotal, acertoTotal]
    );

    return (
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-6 space-y-6">
            {/* HEADER + RANGE */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-2xl font-semibold">Dashboard</h1>
                <div className="flex gap-2">
                    {[7, 30, 90].map((n) => (
                        <button
                            key={n}
                            onClick={() => setDays(n as 7 | 30 | 90)}
                            className={`px-3 py-1.5 rounded-lg border ${days === n ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}
                        >
                            {n} dias
                        </button>
                    ))}
                </div>
            </div>

            {/* CARDS GRADIENTES */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {cards.map((c) => (
                    <div
                        key={c.label}
                        className={`rounded-2xl p-4 text-white shadow-sm bg-gradient-to-r ${c.tone}`}
                    >
                        <div className="text-sm/5 opacity-90">{c.label}</div>
                        <div className="mt-1 flex items-end justify-between">
                            <div className="text-2xl font-extrabold tracking-tight">{c.value}</div>
                            <div className="text-xl/none opacity-90">{c.icon}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* LINHAS PADRÃO: Minutos x Questões (estilo “trafic sources”) */}
            <div className="rounded-2xl bg-card border border-border p-4">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="font-semibold">Estudo diário</h2>
                    <span className="text-xs text-muted-foreground">Min vs Questões</span>
                </div>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={serie} margin={{ left: 6, right: 6 }}>
                            <defs>
                                <linearGradient id="gMin" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.5} />
                                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="gQst" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.5} />
                                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis dataKey="dia" stroke="var(--muted-foreground)" />
                            <YAxis stroke="var(--muted-foreground)" allowDecimals={false} />
                            <Tooltip
                                contentStyle={{
                                    background: "var(--muted)",
                                    border: "1px solid var(--border)",
                                    color: "var(--foreground)",
                                    borderRadius: 12,
                                }}
                            />
                            <Area type="monotone" dataKey="minutos" name="Minutos" stroke="var(--primary)" fill="url(#gMin)" strokeWidth={2} />
                            <Area type="monotone" dataKey="questoes" name="Questões" stroke="#22c55e" fill="url(#gQst)" strokeWidth={2} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* BARRAS COMPACTAS (pequenas) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Panel title="Top 5 matérias por tempo (min)">
                    <TinyBarH data={topMateriasTempo} />
                </Panel>
                <Panel title="Top 5 assuntos por tempo (min)">
                    <TinyBarH data={topAssuntosTempo} />
                </Panel>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Panel title="Acerto por Matéria (total)">
                    <TinyBarH data={matAcc} percent />
                </Panel>
                <Panel title="Acerto por Assunto (total)">
                    <TinyBarH data={assAcc} percent />
                </Panel>
            </div>

            {erro && <p className="text-destructive">{erro}</p>}
            {loading && <p className="text-muted-foreground">Carregando…</p>}
        </div>
    );
}

/* ===================== SUBS ===================== */

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-2xl bg-card border border-border p-4">
            <h3 className="font-semibold mb-2">{title}</h3>
            {children}
        </div>
    );
}

/** Barras horizontais bem pequenas/organizadas */
function TinyBarH({ data, percent = false }: { data: TopItem[]; percent?: boolean }) {
    const height = Math.max(120, data.length * 26 + 30); // compacta
    return (
        <div style={{ width: "100%", height }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} layout="vertical" margin={{ top: 6, bottom: 6, left: 6, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                        type="number"
                        domain={percent ? [0, 100] : ["auto", "auto"]}
                        stroke="var(--muted-foreground)"
                        tick={{ fontSize: 11 }}
                    />
                    <YAxis
                        type="category"
                        dataKey="nome"
                        width={140}
                        stroke="var(--muted-foreground)"
                        tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                        formatter={(v: any) => (percent ? [`${v}%`, "Acerto"] : [v, "Minutos"])}
                        contentStyle={{
                            background: "var(--muted)",
                            border: "1px solid var(--border)",
                            color: "var(--foreground)",
                            borderRadius: 12,
                        }}
                    />
                    <Bar dataKey="valor" barSize={12} radius={[0, 8, 8, 0]} fill={percent ? "var(--primary)" : "#60a5fa"} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
