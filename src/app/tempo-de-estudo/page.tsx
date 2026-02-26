"use client";

// =====================================================================================
// ARQUIVO: src/app/tempo-de-estudo/page.tsx
// ONDE COLOCAR:
//   - Crie a pasta: src/app/tempo-de-estudo/
//   - Dentro dela, crie este arquivo: page.tsx
//
// OBJETIVO (UI):
// - Mostrar “Tempo de estudo” (pizza + lista) ao abrir, por matéria
// - Permitir iniciar contagem (cronômetro) escolhendo Matéria + Assunto
// - Permitir parar contagem e salvar no banco (via route.ts)
// - Cada usuário vê apenas seus dados (RLS na tabela study_sessions)
//
// DEPENDÊNCIAS:
// - Recharts já aparece no seu projeto (você usa em /estatisticas).
// - Usa supabase client do seu padrão.
// =====================================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
    ResponsiveContainer,
    PieChart,
    Pie,
    Tooltip,
    Cell,
} from "recharts";

/* =========================
 * Tipos
 * ========================= */
type Materia = { id: string; nome: string };
type Assunto = { id: string; nome: string; materia_id?: string | null };

type Slice = { name: string; seconds: number };

type OpenSession = {
    id: string;
    started_at: string;
    materia_id: string | null;
    assunto_id: string | null;
    mode: "cronometro" | "manual";
};

type RangeKey = "dia" | "semana" | "mes" | "ano" | "tudo";

/* =========================
 * Helpers
 * ========================= */

/**
 * Formata segundos em "17h 22m 50s" (estilo da sua imagem).
 */
function fmtHMSFull(totalSeconds: number): string {
    const s = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;

    const hh = h ? `${h}h ` : "";
    const mm = (h || m) ? `${m}m ` : "";
    const ss = `${r}s`;

    return `${hh}${mm}${ss}`.trim();
}

/**
 * Retorna o início do período no fuso local do usuário.
 */
function getRangeStart(range: RangeKey): Date | null {
    const now = new Date();
    const d = new Date(now);

    if (range === "tudo") return null;

    if (range === "dia") {
        d.setHours(0, 0, 0, 0);
        return d;
    }

    if (range === "semana") {
        // Semana começando na segunda (pt-BR): ajusta 0(dom) -> 6, 1(seg) -> 0, ...
        const day = d.getDay();
        const diff = (day + 6) % 7;
        d.setDate(d.getDate() - diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    if (range === "mes") {
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    // ano
    d.setMonth(0, 1);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Soma sessões por matéria (segundos) para montar o gráfico.
 * - Inclui sessões finalizadas + (opcional) sessão aberta em tempo real.
 */
function buildSlices(
    sessions: Array<{ materia_id: string | null; duration_seconds: number | null }>,
    matName: Record<string, string>,
    openSession?: OpenSession | null,
    openElapsedSec?: number
): Slice[] {
    const byMat: Record<string, number> = {};

    for (const s of sessions) {
        const matId = s.materia_id ?? "SEM_MATERIA";
        const dur = Number(s.duration_seconds ?? 0);
        byMat[matId] = (byMat[matId] ?? 0) + Math.max(0, dur);
    }

    // Inclui sessão aberta (se existir)
    if (openSession && typeof openElapsedSec === "number" && openElapsedSec > 0) {
        const matId = openSession.materia_id ?? "SEM_MATERIA";
        byMat[matId] = (byMat[matId] ?? 0) + Math.max(0, Math.floor(openElapsedSec));
    }

    const slices: Slice[] = Object.entries(byMat)
        .map(([id, seconds]) => ({
            name: id === "SEM_MATERIA" ? "Sem matéria" : matName[id] || "Matéria",
            seconds,
        }))
        .filter((x) => x.seconds > 0)
        .sort((a, b) => b.seconds - a.seconds);

    return slices;
}

/* =========================
 * Page
 * ========================= */
export default function TempoDeEstudoPage() {
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    // listas do usuário
    const [materias, setMaterias] = useState<Materia[]>([]);
    const [assuntos, setAssuntos] = useState<Assunto[]>([]);
    const [matName, setMatName] = useState<Record<string, string>>({});
    const [assName, setAssName] = useState<Record<string, string>>({});

    // seleção para iniciar sessão
    const [materiaId, setMateriaId] = useState<string>("");
    const [assuntoId, setAssuntoId] = useState<string>("");

    // filtro de período do gráfico
    const [range, setRange] = useState<RangeKey>("tudo");

    // sessão aberta (cronômetro)
    const [openSession, setOpenSession] = useState<OpenSession | null>(null);
    const [openElapsedSec, setOpenElapsedSec] = useState<number>(0);

    // dados agregados (sessões finalizadas)
    const [sessions, setSessions] = useState<
        Array<{ materia_id: string | null; duration_seconds: number | null }>
    >([]);

    // controle de intervalo do cronômetro
    const timerRef = useRef<number | null>(null);

    /**
     * Carrega listas do usuário (materias/assuntos) e tenta descobrir sessão aberta.
     */
    useEffect(() => {
        let mounted = true;

        (async () => {
            setLoading(true);
            setErro(null);

            try {
                const { data: auth } = await supabase.auth.getUser();
                const user = auth?.user;
                if (!user?.id) throw new Error("Sem usuário autenticado.");

                // Carrega matérias/assuntos em paralelo (padrão parecido com sua página de estatísticas)
                const [mats, asss] = await Promise.all([
                    supabase.from("materias").select("id,nome").eq("user_id", user.id),
                    supabase.from("assuntos").select("id,nome,materia_id").eq("user_id", user.id),
                ]);

                if (!mounted) return;

                const mList = (mats.data ?? []) as Materia[];
                const aList = (asss.data ?? []) as Assunto[];
                setMaterias(mList);
                setAssuntos(aList);

                const mMap: Record<string, string> = {};
                mList.forEach((m) => (mMap[m.id] = m.nome));
                setMatName(mMap);

                const aMap: Record<string, string> = {};
                aList.forEach((a) => (aMap[a.id] = a.nome));
                setAssName(aMap);

                // Busca sessão aberta (se existir)
                const { data: open } = await supabase
                    .from("study_sessions")
                    .select("id, started_at, materia_id, assunto_id, mode")
                    .eq("user_id", user.id)
                    .is("ended_at", null)
                    .order("started_at", { ascending: false })
                    .limit(1);

                if (!mounted) return;

                if (open && open.length) {
                    setOpenSession(open[0] as OpenSession);
                } else {
                    setOpenSession(null);
                }
            } catch (e: any) {
                if (!mounted) return;
                setErro(e?.message || "Falha ao carregar.");
            } finally {
                if (!mounted) return;
                setLoading(false);
            }
        })();

        return () => {
            mounted = false;
        };
    }, []);

    /**
     * Carrega sessões finalizadas do período selecionado.
     * - Mantém a sessão aberta separada (ela é exibida com contador em tempo real).
     */
    useEffect(() => {
        let mounted = true;

        (async () => {
            try {
                setErro(null);

                const { data: auth } = await supabase.auth.getUser();
                const user = auth?.user;
                if (!user?.id) return;

                let q = supabase
                    .from("study_sessions")
                    .select("materia_id,duration_seconds,started_at,ended_at")
                    .eq("user_id", user.id)
                    .not("duration_seconds", "is", null)
                    .not("ended_at", "is", null)
                    .order("started_at", { ascending: false });

                const from = getRangeStart(range);
                if (from) {
                    q = q.gte("started_at", from.toISOString());
                }

                const { data, error } = await q;
                if (error) throw error;
                if (!mounted) return;

                setSessions((data ?? []) as any);
            } catch (e: any) {
                if (!mounted) return;
                setErro(e?.message || "Falha ao carregar sessões.");
            }
        })();

        return () => {
            mounted = false;
        };
    }, [range]);

    /**
     * Controla o cronômetro em tempo real quando há sessão aberta.
     */
    useEffect(() => {
        // limpa intervalo anterior
        if (timerRef.current) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
        }

        if (!openSession?.started_at) {
            setOpenElapsedSec(0);
            return;
        }

        const started = new Date(openSession.started_at).getTime();
        if (Number.isNaN(started)) {
            setOpenElapsedSec(0);
            return;
        }

        // Atualiza imediatamente e depois a cada 1s
        const tick = () => {
            const now = Date.now();
            setOpenElapsedSec(Math.max(0, Math.floor((now - started) / 1000)));
        };

        tick();
        timerRef.current = window.setInterval(tick, 1000);

        return () => {
            if (timerRef.current) {
                window.clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [openSession?.started_at]);

    /**
     * Filtra assuntos conforme matéria selecionada.
     */
    const assuntosFiltrados = useMemo(
        () => (materiaId ? assuntos.filter((a) => a.materia_id === materiaId) : assuntos),
        [assuntos, materiaId]
    );

    /**
     * Dados do gráfico (pizza) + total.
     */
    const slices = useMemo(
        () => buildSlices(sessions, matName, openSession, openElapsedSec),
        [sessions, matName, openSession, openElapsedSec]
    );

    const totalSeconds = useMemo(
        () => slices.reduce((acc, s) => acc + s.seconds, 0),
        [slices]
    );

    /**
     * Obtém access_token para chamar a API server-side.
     */
    async function getAccessToken(): Promise<string> {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) throw new Error("Sessão inválida (sem access_token).");
        return token;
    }

    /**
     * Inicia uma sessão (cronômetro).
     */
    async function handleStart() {
        setErro(null);

        try {
            if (!materiaId) {
                setErro("Selecione uma Matéria para iniciar.");
                return;
            }

            const access_token = await getAccessToken();

            const res = await fetch("/api/study-sessions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "start",
                    access_token,
                    materia_id: materiaId,
                    assunto_id: assuntoId || null,
                }),
            });

            const out = await res.json();
            if (!res.ok) throw new Error(out?.error || "Falha ao iniciar.");

            // A API pode reutilizar sessão aberta (se já existia)
            setOpenSession(out.session as OpenSession);
        } catch (e: any) {
            setErro(e?.message || "Falha ao iniciar.");
        }
    }

    /**
     * Para a sessão atual (cronômetro) e recarrega agregados.
     */
    async function handleStop() {
        setErro(null);

        try {
            if (!openSession?.id) return;

            const access_token = await getAccessToken();

            const res = await fetch("/api/study-sessions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "stop",
                    access_token,
                    session_id: openSession.id,
                }),
            });

            const out = await res.json();
            if (!res.ok) throw new Error(out?.error || "Falha ao parar.");

            // Fecha cronômetro na UI
            setOpenSession(null);
            setOpenElapsedSec(0);

            // Recarrega agregados do período (para refletir a sessão recém-finalizada)
            const from = getRangeStart(range);
            let q = supabase
                .from("study_sessions")
                .select("materia_id,duration_seconds,started_at,ended_at")
                .not("duration_seconds", "is", null)
                .not("ended_at", "is", null)
                .order("started_at", { ascending: false });

            const { data: auth } = await supabase.auth.getUser();
            const user = auth?.user;
            if (user?.id) q = q.eq("user_id", user.id);

            if (from) q = q.gte("started_at", from.toISOString());

            const { data, error } = await q;
            if (error) throw error;
            setSessions((data ?? []) as any);
        } catch (e: any) {
            setErro(e?.message || "Falha ao parar.");
        }
    }

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <h1 className="text-2xl font-semibold">Tempo de estudo</h1>

                <div className="flex gap-2">
                    {(
                        [
                            ["dia", "Dia"],
                            ["semana", "Semana"],
                            ["mes", "Mês"],
                            ["ano", "Ano"],
                            ["tudo", "Tudo"],
                        ] as const
                    ).map(([k, label]) => (
                        <button
                            key={k}
                            onClick={() => setRange(k)}
                            className={`px-3 py-1.5 rounded-lg border ${range === k
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-card border-border"
                                }`}
                            disabled={loading}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* BLOCO: iniciar/controle */}
            <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
                <div className="text-sm font-semibold">Registro</div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">Matéria</span>
                        <select
                            className="bg-muted border border-border rounded-lg px-3 py-2 text-sm"
                            value={materiaId}
                            onChange={(e) => {
                                setMateriaId(e.target.value);
                                setAssuntoId("");
                            }}
                            disabled={loading || !!openSession}
                        >
                            <option value="">Selecione</option>
                            {materias.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.nome}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">Conteúdo / Assunto</span>
                        <select
                            className="bg-muted border border-border rounded-lg px-3 py-2 text-sm"
                            value={assuntoId}
                            onChange={(e) => setAssuntoId(e.target.value)}
                            disabled={loading || !assuntosFiltrados.length || !!openSession}
                        >
                            <option value="">Selecione</option>
                            {assuntosFiltrados.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {a.nome}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Status sessão aberta */}
                {openSession ? (
                    <div className="rounded-xl border border-border bg-muted p-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-[240px]">
                            <div className="text-sm font-semibold">Sessão em andamento</div>
                            <div className="text-xs text-muted-foreground">
                                {openSession.materia_id ? matName[openSession.materia_id] : "Sem matéria"}
                                {openSession.assunto_id
                                    ? ` • ${assName[openSession.assunto_id] ?? "Assunto"}`
                                    : ""}
                            </div>
                        </div>

                        <div className="text-lg font-extrabold tracking-tight">
                            {fmtHMSFull(openElapsedSec)}
                        </div>

                        <button
                            className="px-5 py-2 rounded-xl bg-destructive text-destructive-foreground font-semibold"
                            onClick={handleStop}
                            disabled={loading}
                        >
                            Parar e salvar
                        </button>
                    </div>
                ) : (
                    <button
                        className="px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-60"
                        onClick={handleStart}
                        disabled={loading || !materiaId}
                        title="Inicia o cronômetro na matéria/assunto selecionados"
                    >
                        Iniciar atividade
                    </button>
                )}

                {erro && <div className="text-destructive text-sm">{erro}</div>}
                {loading && <div className="text-muted-foreground text-sm">Carregando…</div>}
            </div>

            {/* BLOCO: gráfico pizza */}
            <div className="rounded-2xl bg-card border border-border p-4">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="font-semibold">Todas as matérias</h2>
                    <span className="text-xs text-muted-foreground">{range.toUpperCase()}</span>
                </div>

                {!slices.length ? (
                    <div className="text-sm text-muted-foreground">Sem dados para o período selecionado.</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={slices}
                                        dataKey="seconds"
                                        nameKey="name"
                                        outerRadius={90}
                                        innerRadius={45}
                                        paddingAngle={2}
                                    >
                                        {slices.map((_, i) => (
                                            // Não fixamos cores (segue a regra de não impor paleta);
                                            // Recharts usa cores default, e o Cell sem fill deixa o tema decidir.
                                            <Cell key={i} />
                                        ))}
                                    </Pie>

                                    <Tooltip
                                        formatter={(v: any, _n: any, p: any) => {
                                            const sec = Number(v ?? 0);
                                            const pct = totalSeconds ? Math.round((sec / totalSeconds) * 100) : 0;
                                            return [`${fmtHMSFull(sec)} (${pct}%)`, p?.payload?.name ?? "Item"];
                                        }}
                                        contentStyle={{
                                            background: "var(--muted)",
                                            border: "1px solid var(--border)",
                                            color: "var(--foreground)",
                                            borderRadius: 12,
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="space-y-3">
                            <div className="text-center text-3xl font-extrabold tracking-tight">
                                {fmtHMSFull(totalSeconds)}
                            </div>

                            <div className="space-y-2">
                                {slices.map((s) => {
                                    const pct = totalSeconds ? Math.round((s.seconds / totalSeconds) * 100) : 0;
                                    return (
                                        <div
                                            key={s.name}
                                            className="flex items-center justify-between rounded-xl border border-border bg-muted px-3 py-2"
                                        >
                                            <div className="min-w-0">
                                                <div className="font-medium truncate">{s.name}</div>
                                                <div className="text-xs text-muted-foreground">{pct}%</div>
                                            </div>
                                            <div className="font-semibold">{fmtHMSFull(s.seconds)}</div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="text-xs text-muted-foreground">
                                * Inclui a sessão em andamento (se houver), somando em tempo real.
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}