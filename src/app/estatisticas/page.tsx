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

/* ===================== CONFIG ===================== */
const GOOD_THRESHOLD = 80;
const BAD_THRESHOLD = 50;
const MIN_QUESTOES = 10;

type Daily = { dia: string; tempo_min: number };
type TopItem = { nome: string; minutos: number };
type Phase = "study" | "break";

const ONE_DAY = 24 * 60 * 60 * 1000;

function startOfLocalDay(ts = Date.now()) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d;
}
function iso(dt: Date) {
    return dt.toISOString();
}
function toLocalDateLabel(dt: string | Date) {
    const d = typeof dt === "string" ? new Date(dt) : dt;
    return d.toLocaleDateString("pt-BR", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
    });
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
/** formata Date -> "dd/MM/yyyy" (como salvo em progresso_semanal) */
function ptBR(d: Date) {
    return d.toLocaleDateString("pt-BR");
}

export default function EstatisticasPage() {
    const [days, setDays] = useState<7 | 30 | 90>(7);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    // mapas de nomes
    const [materiaMap, setMateriaMap] = useState<Record<string, string>>({});
    const [assuntoMap, setAssuntoMap] = useState<Record<string, string>>({});

    // — Pomodoro métricas
    const [tempoTotalSeg, setTempoTotalSeg] = useState(0);
    const [sessoesCount, setSessoesCount] = useState(0);
    const [mediaSessaoMin, setMediaSessaoMin] = useState(0);
    const [streakDias, setStreakDias] = useState(0);
    const [diario, setDiario] = useState<Daily[]>([]);
    const [topMaterias, setTopMaterias] = useState<TopItem[]>([]);
    const [topAssuntos, setTopAssuntos] = useState<TopItem[]>([]);

    // — Resumos/Revisões (se existirem)
    const [resumosPeriodo, setResumosPeriodo] = useState(0);
    const [resumosTotal, setResumosTotal] = useState(0);
    const [revisoesPeriodo, setRevisoesPeriodo] = useState(0);
    const [revisoesTotal, setRevisoesTotal] = useState(0);
    const [revisoesPendentes, setRevisoesPendentes] = useState(0);

    // — Questões (PERÍODO via progresso_semanal) e TOTAL (estatisticas)
    const [questoesPeriodo, setQuestoesPeriodo] = useState(0);
    const [acertoPeriodo, setAcertoPeriodo] = useState(0);
    const [questoesTotal, setQuestoesTotal] = useState(0);
    const [acertoTotal, setAcertoTotal] = useState(0);

    // TOTAL (histórico) – vindo de acc_por_materia/assunto
    const [byMateriaAccTotal, setByMateriaAccTotal] = useState<
        Array<{ nome: string; acerto: number; total: number }>
    >([]);
    const [byAssuntoAccTotal, setByAssuntoAccTotal] = useState<
        Array<{ nome: string; acerto: number; total: number }>
    >([]);

    // Indicadores (usam TOTAL por falta de série no período)
    const [fortesMaterias, setFortesMaterias] = useState<
        Array<{ nome: string; acerto: number; total: number }>
    >([]);
    const [fracasMaterias, setFracasMaterias] = useState<
        Array<{ nome: string; acerto: number; total: number }>
    >([]);
    const [fortesAssuntos, setFortesAssuntos] = useState<
        Array<{ nome: string; acerto: number; total: number }>
    >([]);
    const [fracosAssuntos, setFracosAssuntos] = useState<
        Array<{ nome: string; acerto: number; total: number }>
    >([]);

    useEffect(() => {
        (async () => {
            setLoading(true);
            setErro(null);
            try {
                const {
                    data: { user },
                } = await supabase.auth.getUser();
                if (!user) throw new Error("Não foi possível obter usuário logado.");
                const uid = user.id;

                // período
                const today0 = startOfLocalDay();
                const from = new Date(today0.getTime() - (days - 1) * ONE_DAY);
                const fromISO = iso(from);

                // nomes
                const [mats, asss] = await Promise.all([
                    supabase.from("materias").select("id,nome").eq("user_id", uid),
                    supabase.from("assuntos").select("id,nome").eq("user_id", uid),
                ]);
                const mMap: Record<string, string> = {};
                (mats.data ?? []).forEach((m: any) => (mMap[m.id] = m.nome));
                setMateriaMap(mMap);
                const aMap: Record<string, string> = {};
                (asss.data ?? []).forEach((a: any) => (aMap[a.id] = a.nome));
                setAssuntoMap(aMap);

                /* ================= Pomodoro ================= */
                const { data: sess } = await supabase
                    .from("pomodoro_sessions")
                    .select("phase, duration_seconds, started_at, materia_id, assunto_id")
                    .eq("user_id", uid)
                    .eq("phase", "study" as Phase)
                    .not("duration_seconds", "is", null)
                    .gte("started_at", fromISO)
                    .order("started_at", { ascending: true });

                const sessions =
                    (sess ?? []) as Array<{
                        duration_seconds: number | null;
                        started_at: string;
                        materia_id: string | null;
                        assunto_id: string | null;
                    }>;

                // base diária (minutos/dia)
                const baseDays: Daily[] = Array.from({ length: days }, (_, i) => {
                    const d = new Date(from.getTime() + i * ONE_DAY);
                    return { dia: toLocalDateLabel(d), tempo_min: 0 };
                });

                let totalSeconds = 0;
                let count = 0;
                const byDay: Record<string, number> = {};
                const byMateriaTime: Record<string, number> = {};
                const byAssuntoTime: Record<string, number> = {};

                for (const s of sessions) {
                    const dur = s.duration_seconds ?? 0;
                    totalSeconds += dur;
                    count += 1;

                    const d = new Date(s.started_at);
                    const key = new Date(d.getFullYear(), d.getMonth(), d.getDate())
                        .toISOString()
                        .slice(0, 10);
                    byDay[key] = (byDay[key] ?? 0) + dur;

                    if (s.materia_id)
                        byMateriaTime[s.materia_id] =
                            (byMateriaTime[s.materia_id] ?? 0) + dur;
                    if (s.assunto_id)
                        byAssuntoTime[s.assunto_id] =
                            (byAssuntoTime[s.assunto_id] ?? 0) + dur;
                }

                for (let i = 0; i < days; i++) {
                    const d = new Date(from.getTime() + i * ONE_DAY)
                        .toISOString()
                        .slice(0, 10);
                    baseDays[i].tempo_min = Math.round((byDay[d] ?? 0) / 60);
                }
                setDiario(baseDays);

                setTempoTotalSeg(totalSeconds);
                setSessoesCount(count);
                setMediaSessaoMin(count ? Math.round(totalSeconds / 60 / count) : 0);

                // streak (dias seguidos com >0 min)
                let streak = 0;
                for (let i = baseDays.length - 1; i >= 0; i--) {
                    if (baseDays[i].tempo_min > 0) streak++;
                    else break;
                }
                setStreakDias(streak);

                // top 5 tempo (matérias/assuntos)
                const tM: TopItem[] = Object.entries(byMateriaTime)
                    .map(([id, sec]) => ({
                        nome: mMap[id] || id.slice(0, 8) + "…",
                        minutos: Math.round(sec / 60),
                    }))
                    .sort((a, b) => b.minutos - a.minutos)
                    .slice(0, 5);
                const tA: TopItem[] = Object.entries(byAssuntoTime)
                    .map(([id, sec]) => ({
                        nome: aMap[id] || id.slice(0, 8) + "…",
                        minutos: Math.round(sec / 60),
                    }))
                    .sort((a, b) => b.minutos - a.minutos)
                    .slice(0, 5);
                setTopMaterias(tM);
                setTopAssuntos(tA);

                /* ================= ESTATISTICAS (única tabela) ================= */
                const { data: est } = await supabase
                    .from("estatisticas")
                    .select(
                        "questoes_respondidas,taxa_acerto,progresso_semanal,acc_por_materia,acc_por_assunto"
                    )
                    .eq("user_id", uid)
                    .maybeSingle();

                // Totais básicos
                const totalQuestoes = est?.questoes_respondidas ?? 0;
                const taxa = est?.taxa_acerto ?? 0;
                setQuestoesTotal(totalQuestoes);
                setAcertoTotal(typeof taxa === "number" ? Math.round(taxa) : Number(taxa));

                // Questões no PERÍODO = soma de progresso_semanal nos últimos N dias
                const diasAlvo = new Set(
                    Array.from({ length: days }, (_, i) =>
                        ptBR(new Date(startOfLocalDay().getTime() - i * ONE_DAY))
                    )
                );
                let somaPeriodo = 0;
                const prog = Array.isArray(est?.progresso_semanal)
                    ? (est!.progresso_semanal as Array<{ dia: string; questoes: number }>)
                    : [];
                for (const row of prog) {
                    if (row?.dia && diasAlvo.has(row.dia)) {
                        somaPeriodo += Number(row.questoes ?? 0);
                    }
                }
                setQuestoesPeriodo(somaPeriodo);

                // Sem série por acerto diário: usamos taxa_acerto como “acerto no período”
                setAcertoPeriodo(
                    typeof taxa === "number" ? Math.round(taxa) : Number(taxa ?? 0)
                );

                // Listas TOTAL/histórico por matéria/assunto
                const matObj = (est?.acc_por_materia ?? {}) as Record<
                    string,
                    { total: number; corretas: number }
                >;
                const assObj = (est?.acc_por_assunto ?? {}) as Record<
                    string,
                    { total: number; corretas: number }
                >;

                const matList = Object.entries(matObj).map(([id, v]) => ({
                    nome: mMap[id] || id.slice(0, 8) + "…",
                    acerto: v.total ? Math.round((v.corretas / v.total) * 100) : 0,
                    total: v.total,
                }));
                const assList = Object.entries(assObj).map(([id, v]) => ({
                    nome: aMap[id] || id.slice(0, 8) + "…",
                    acerto: v.total ? Math.round((v.corretas / v.total) * 100) : 0,
                    total: v.total,
                }));

                setByMateriaAccTotal(matList.sort((a, b) => b.total - a.total).slice(0, 10));
                setByAssuntoAccTotal(assList.sort((a, b) => b.total - a.total).slice(0, 10));

                // Indicadores (com TOTAL)
                setFortesMaterias(
                    matList
                        .filter((x) => x.total >= MIN_QUESTOES && x.acerto >= GOOD_THRESHOLD)
                        .sort((a, b) => b.acerto - a.acerto)
                        .slice(0, 5)
                );
                setFracasMaterias(
                    matList
                        .filter((x) => x.total >= MIN_QUESTOES && x.acerto < BAD_THRESHOLD)
                        .sort((a, b) => a.acerto - b.acerto)
                        .slice(0, 5)
                );
                setFortesAssuntos(
                    assList
                        .filter((x) => x.total >= MIN_QUESTOES && x.acerto >= GOOD_THRESHOLD)
                        .sort((a, b) => b.acerto - a.acerto)
                        .slice(0, 5)
                );
                setFracosAssuntos(
                    assList
                        .filter((x) => x.total >= MIN_QUESTOES && x.acerto < BAD_THRESHOLD)
                        .sort((a, b) => a.acerto - b.acerto)
                        .slice(0, 5)
                );

                /* ================= Resumos / Revisões (se você usa essas tabelas) ================= */
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
            } catch (e: any) {
                setErro(e?.message || "Falha ao carregar estatísticas.");
            } finally {
                setLoading(false);
            }
        })();
    }, [days]); // <— só depende do range de dias (evita loop)

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
            {/* cabeçalho */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-2xl font-semibold">Estatísticas</h1>
                <div className="flex gap-2">
                    {[7, 30, 90].map((n) => (
                        <button
                            key={n}
                            onClick={() => setDays(n as 7 | 30 | 90)}
                            className={`rounded-xl px-3 py-1.5 border ${days === n
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-card text-foreground border-border"
                                }`}
                        >
                            {n} dias
                        </button>
                    ))}
                </div>
            </div>

            {/* feedback */}
            {loading && (
                <div className="text-center text-muted-foreground font-semibold">
                    Carregando estatísticas…
                </div>
            )}
            {erro && <div className="text-center text-destructive font-semibold">{erro}</div>}

            {!loading && !erro && (
                <>
                    {/* Cards principais */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                        {cards.map((c, i) => (
                            <div
                                key={i}
                                className="rounded-2xl bg-card border border-border py-6 px-2 flex flex-col items-center shadow-sm"
                            >
                                <span className="text-xs sm:text-sm text-muted-foreground mb-1 font-medium">
                                    {c.label}
                                </span>
                                <span className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
                                    {c.valor}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Cards de Questões */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                        <StatMini title="Questões (período)" value={questoesPeriodo} />
                        <StatMini title="Acerto (período)" value={`${acertoPeriodo}%`} />
                        <StatMini title="Questões (total)" value={questoesTotal} />
                        <StatMini title="Acerto (total)" value={`${acertoTotal}%`} />
                    </div>

                    {/* Série diária: tempo estudado */}
                    <Section title="Tempo estudado por dia (min)">
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
                    </Section>

                    {/* Rankings de tempo (HORIZONTAL, compacto) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <Section title="Top 5 matérias por tempo (min)">
                            <BarSimpleH data={topMaterias} dataKey="minutos" nameKey="nome" />
                        </Section>
                        <Section title="Top 5 assuntos por tempo (min)">
                            <BarSimpleH data={topAssuntos} dataKey="minutos" nameKey="nome" />
                        </Section>
                    </div>

                    {/* TOTAL / HISTÓRICO — a partir da TABELA ESTATISTICAS */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <Section title="Acerto por Matéria (TOTAL)">
                            <BarPercentH data={byMateriaAccTotal} />
                            {!byMateriaAccTotal.length && (
                                <p className="text-sm text-muted-foreground mt-2">
                                    Ainda não há histórico agregado por matéria.
                                </p>
                            )}
                        </Section>
                        <Section title="Acerto por Assunto (TOTAL)">
                            <BarPercentH data={byAssuntoAccTotal} />
                            {!byAssuntoAccTotal.length && (
                                <p className="text-sm text-muted-foreground mt-2">
                                    Ainda não há histórico agregado por assunto.
                                </p>
                            )}
                        </Section>
                    </div>

                    {/* Indicadores: Fortes x Prioridades (TOTAL) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <Section title="Fortes (≥ 80% de acerto, min. 10 questões)">
                            <ListBadges items={fortesMaterias} empty="Ainda sem dados suficientes." />
                            <div className="mt-3 border-t border-border pt-3">
                                <ListBadges items={fortesAssuntos} empty="" />
                            </div>
                        </Section>

                        <Section title="Prioridades (< 50% de acerto, min. 10 questões)">
                            <ListBadges items={fracasMaterias} variant="danger" empty="Tudo ok por enquanto 👌" />
                            <div className="mt-3 border-t border-border pt-3">
                                <ListBadges items={fracosAssuntos} variant="danger" empty="" />
                            </div>
                        </Section>
                    </div>

                    {/* Rodapé com totais */}
                    <div className="rounded-2xl bg-card border border-border px-4 sm:px-8 py-5">
                        <div className="text-sm text-muted-foreground">
                            <div className="flex flex-wrap gap-x-6 gap-y-2">
                                <span>
                                    <strong>Resumos (total):</strong> {resumosTotal}
                                </span>
                                <span>
                                    <strong>Revisões concluídas (total):</strong> {revisoesTotal}
                                </span>
                                <span>
                                    <strong>Revisões pendentes:</strong> {revisoesPendentes}
                                </span>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

/* ===================== SUBCOMPONENTES ===================== */

function StatMini({ title, value }: { title: string; value: string | number }) {
    return (
        <div className="rounded-2xl bg-card border border-border py-5 px-3 flex flex-col items-center shadow-sm">
            <span className="text-xs sm:text-sm text-muted-foreground mb-1 font-medium">{title}</span>
            <span className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">{value}</span>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="bg-card rounded-2xl shadow-lg border border-border px-4 sm:px-8 py-6">
            <h2 className="text-base sm:text-lg font-bold mb-4 text-foreground">{title}</h2>
            {children}
        </div>
    );
}

/** Barras horizontais simples (tempo) — compactas */
function BarSimpleH({
    data,
    dataKey,
    nameKey,
}: {
    data: any[];
    dataKey: string;
    nameKey: string;
}) {
    return (
        <div className="w-full h-56 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" stroke="var(--muted-foreground)" />
                    <YAxis
                        type="category"
                        dataKey={nameKey}
                        stroke="var(--muted-foreground)"
                        width={140}
                        tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                        contentStyle={{
                            background: "var(--muted)",
                            border: "1px solid var(--border)",
                            color: "var(--foreground)",
                            fontFamily: "inherit",
                            borderRadius: 12,
                        }}
                        cursor={{ fill: "var(--primary)", opacity: 0.08 }}
                    />
                    <Bar dataKey={dataKey} fill="var(--primary)" radius={[0, 8, 8, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

/** Barras horizontais de % acerto (0–100) — compactas */
function BarPercentH({
    data,
}: {
    data: Array<{ nome: string; acerto: number; total: number }>;
}) {
    return (
        <div className="w-full h-56 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" domain={[0, 100]} stroke="var(--muted-foreground)" />
                    <YAxis
                        type="category"
                        dataKey="nome"
                        stroke="var(--muted-foreground)"
                        width={160}
                        tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                        formatter={(v: any, _n, p: any) => [`${v}%`, `Acerto (${p?.payload?.total ?? 0} q.)`]}
                        contentStyle={{
                            background: "var(--muted)",
                            border: "1px solid var(--border)",
                            color: "var(--foreground)",
                            fontFamily: "inherit",
                            borderRadius: 12,
                        }}
                        cursor={{ fill: "var(--primary)", opacity: 0.08 }}
                    />
                    <Bar dataKey="acerto" fill="var(--primary)" radius={[0, 8, 8, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

function ListBadges({
    items,
    variant = "ok",
    empty,
}: {
    items: Array<{ nome: string; acerto: number; total: number }>;
    variant?: "ok" | "danger";
    empty?: string;
}) {
    if (!items.length) {
        return <div className="text-sm text-muted-foreground">{empty || "Sem itens."}</div>;
    }
    const bg = variant === "danger" ? "bg-red-600 text-white" : "bg-emerald-600 text-white";
    return (
        <ul className="flex flex-wrap gap-2">
            {items.map((it, i) => (
                <li key={i} className={`text-xs rounded-full px-3 py-1 ${bg}`}>
                    {it.nome} • {it.acerto}% <span className="opacity-80">({it.total} q.)</span>
                </li>
            ))}
        </ul>
    );
}
