"use client";

// =====================================================================================
// ARQUIVO: src/app/tempo-de-estudo/page.tsx
// OBJETIVO (UI):
// - Mostrar “Tempo de estudo” (pizza + lista) ao abrir, por disciplina
// - Permitir iniciar contagem (cronômetro) escolhendo Matéria + Assunto
// - Permitir parar contagem e salvar no banco (via route.ts)
// - Cada usuário vê apenas seus dados (RLS na tabela study_sessions)
//
// MELHORIA (PEDIDA):
// - Cores do gráfico e identificação por disciplina:
//   - Paleta bonita e consistente (tons modernos e contrastantes)
//   - Cor estável por nome de matéria (mesma disciplina = mesma cor sempre)
//   - Legenda com “bolinha” colorida igual ao gráfico
// =====================================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ResponsiveContainer, PieChart, Pie, Tooltip, Cell } from "recharts";
import { Play, Square } from "lucide-react";
import { CabecalhoPagina, Pagina, Painel, SeletorSegmentado, Vazio } from "@/components/app/Pagina";
import { corGrafico } from "@/lib/coresGrafico";

/* =========================
 * Tipos
 * ========================= */
type Materia = { id: string; nome: string };
type Assunto = { id: string; nome: string; disciplina_id: string };

type Slice = { name: string; seconds: number };

type OpenSession = {
    id: string;
    started_at: string;
    disciplina_catalogo_id: string | null;
    assunto_catalogo_id: string | null;
    mode: "cronometro" | "manual";
};

type RangeKey = "dia" | "semana" | "mes" | "ano" | "tudo";

/* =========================
 * Cores: paleta do tema (lib/coresGrafico), atribuída pela posição no ranking.
 * Antes a cor saía de um hash do nome e duas disciplinas podiam ficar iguais.
 * ========================= */
/* =========================
 * Helpers gerais
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
    const mm = h || m ? `${m}m ` : "";
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
 * Soma sessões por disciplina (segundos) para montar o gráfico.
 * - Inclui sessões finalizadas + (opcional) sessão aberta em tempo real.
 */
function buildSlices(
    sessions: Array<{ disciplina_catalogo_id: string | null; duration_seconds: number | null }>,
    matName: Record<string, string>,
    openSession?: OpenSession | null,
    openElapsedSec?: number
): Slice[] {
    const byMat: Record<string, number> = {};

    for (const s of sessions) {
        const matId = s.disciplina_catalogo_id ?? "SEM_MATERIA";
        const dur = Number(s.duration_seconds ?? 0);
        byMat[matId] = (byMat[matId] ?? 0) + Math.max(0, dur);
    }

    // Inclui sessão aberta (se existir)
    if (openSession && typeof openElapsedSec === "number" && openElapsedSec > 0) {
        const matId = openSession.disciplina_catalogo_id ?? "SEM_MATERIA";
        byMat[matId] = (byMat[matId] ?? 0) + Math.max(0, Math.floor(openElapsedSec));
    }

    const slices: Slice[] = Object.entries(byMat)
        .map(([id, seconds]) => ({
            name: id === "SEM_MATERIA" ? "Sem disciplina" : matName[id] || "Disciplina",
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
        Array<{ disciplina_catalogo_id: string | null; duration_seconds: number | null }>
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

                // Carrega disciplinas/assuntos em paralelo (padrão parecido com sua página de estatísticas)
                const [mats, asss] = await Promise.all([
                    supabase.from("questao_disciplinas").select("id,nome").eq("user_id", user.id).eq("ativo", true).order("nome"),
                    supabase.from("questao_assuntos").select("id,nome,disciplina_id").eq("user_id", user.id).eq("ativo", true).order("nome"),
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
                    .select("id, started_at, disciplina_catalogo_id, assunto_catalogo_id, mode")
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
                    .select("disciplina_catalogo_id,duration_seconds,started_at,ended_at")
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
     * Filtra assuntos conforme disciplina selecionada.
     */
    const assuntosFiltrados = useMemo(
        () => (materiaId ? assuntos.filter((a) => a.disciplina_id === materiaId) : assuntos),
        [assuntos, materiaId]
    );

    /**
     * Dados do gráfico (pizza) + total.
     */
    const slices = useMemo(
        () => buildSlices(sessions, matName, openSession, openElapsedSec),
        [sessions, matName, openSession, openElapsedSec]
    );

    const totalSeconds = useMemo(() => slices.reduce((acc, s) => acc + s.seconds, 0), [slices]);

    /**
     * Mapa de cores por disciplina (baseado no nome).
     * - Garante que cada item tenha cor consistente.
     */
    const colorMap = useMemo(() => {
        const map: Record<string, string> = {};
        slices.forEach((s, i) => {
            map[s.name] = corGrafico(i);
        });
        return map;
    }, [slices]);

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
                setErro("Selecione uma Disciplina para iniciar.");
                return;
            }

            const access_token = await getAccessToken();

            const res = await fetch("/api/study-sessions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "start",
                    access_token,
                    disciplina_catalogo_id: materiaId,
                    assunto_catalogo_id: assuntoId || null,
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
                .select("disciplina_catalogo_id,duration_seconds,started_at,ended_at")
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

    const PERIODOS: { id: RangeKey; nome: string }[] = [
        { id: "dia", nome: "Dia" },
        { id: "semana", nome: "Semana" },
        { id: "mes", nome: "Mês" },
        { id: "ano", nome: "Ano" },
        { id: "tudo", nome: "Tudo" },
    ];
    const nomePeriodo: Record<RangeKey, string> = { dia: "Hoje", semana: "Esta semana", mes: "Este mês", ano: "Este ano", tudo: "Todo o período" };
    const campoClass =
        "w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary disabled:opacity-60";

    return (
        <Pagina>
            <CabecalhoPagina
                titulo="Tempo de estudo"
                descricao="Cronometre suas sessões por disciplina e veja onde o seu tempo está indo."
                acoes={<SeletorSegmentado rotulo="Período" opcoes={PERIODOS} valor={range} aoMudar={setRange} />}
            />

            {/* Registro da sessão */}
            <Painel titulo="Registrar sessão" descricao="Escolha a disciplina (e o assunto, se quiser) e inicie o cronômetro.">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">Disciplina</span>
                        <select
                            className={campoClass}
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
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">Assunto (opcional)</span>
                        <select
                            className={campoClass}
                            value={assuntoId}
                            onChange={(e) => setAssuntoId(e.target.value)}
                            disabled={loading || !assuntosFiltrados.length || !!openSession}
                        >
                            <option value="">{materiaId && !assuntosFiltrados.length ? "Sem assuntos cadastrados" : "Selecione"}</option>
                            {assuntosFiltrados.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {a.nome}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                {openSession ? (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-primary/40 bg-primary/10 p-4">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                                <span className="h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden /> Em andamento
                            </div>
                            <div className="mt-1 truncate text-sm text-foreground">
                                {openSession.disciplina_catalogo_id ? matName[openSession.disciplina_catalogo_id] : "Sem disciplina"}
                                {openSession.assunto_catalogo_id ? ` • ${assName[openSession.assunto_catalogo_id] ?? "Assunto"}` : ""}
                            </div>
                        </div>
                        <div className="font-mono text-3xl font-extrabold tabular-nums tracking-tight text-foreground">{fmtHMSFull(openElapsedSec)}</div>
                        <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-lg bg-destructive px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                            onClick={handleStop}
                            disabled={loading}
                        >
                            <Square className="h-4 w-4" aria-hidden /> Parar e salvar
                        </button>
                    </div>
                ) : (
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                            onClick={handleStart}
                            disabled={loading || !materiaId}
                        >
                            <Play className="h-4 w-4" aria-hidden /> Iniciar cronômetro
                        </button>
                        {!materiaId && !loading && <span className="text-xs text-muted-foreground">Escolha a disciplina para começar.</span>}
                    </div>
                )}

                {erro && <div className="mt-3 text-sm text-red-600 dark:text-red-400">{erro}</div>}
            </Painel>

            {/* Distribuição do tempo */}
            <Painel
                titulo="Tempo por disciplina"
                descricao={nomePeriodo[range]}
                acoes={
                    <div className="text-right">
                        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</div>
                        <div className="text-2xl font-extrabold tabular-nums tracking-tight text-foreground">{fmtHMSFull(totalSeconds)}</div>
                    </div>
                }
            >
                {loading && !slices.length ? (
                    <div className="h-48 animate-pulse rounded-lg bg-muted" />
                ) : !slices.length ? (
                    <Vazio titulo="Nenhuma sessão neste período" texto="Inicie o cronômetro acima ou escolha outro período." />
                ) : (
                    <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[240px_1fr]">
                        <div className="mx-auto h-56 w-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={slices}
                                        dataKey="seconds"
                                        nameKey="name"
                                        outerRadius={100}
                                        innerRadius={68}
                                        paddingAngle={slices.length > 1 ? 2 : 0}
                                        stroke="var(--card)"
                                        strokeWidth={2}
                                    >
                                        {slices.map((s) => (
                                            <Cell key={s.name} fill={colorMap[s.name]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(v: any, _n: any, p: any) => {
                                            const sec = Number(v ?? 0);
                                            const pct = totalSeconds ? Math.round((sec / totalSeconds) * 100) : 0;
                                            return [`${fmtHMSFull(sec)} (${pct}%)`, p?.payload?.name ?? "Item"];
                                        }}
                                        contentStyle={{
                                            background: "var(--popover)",
                                            border: "1px solid var(--border)",
                                            color: "var(--foreground)",
                                            borderRadius: 8,
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Barras: mais fáceis de comparar que as fatias */}
                        <ul className="flex flex-col gap-3">
                            {slices.map((s) => {
                                const pct = totalSeconds ? (s.seconds / totalSeconds) * 100 : 0;
                                return (
                                    <li key={s.name}>
                                        <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                                            <span className="flex min-w-0 items-center gap-2">
                                                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: colorMap[s.name] }} aria-hidden />
                                                <span className="truncate font-medium text-foreground">{s.name}</span>
                                            </span>
                                            <span className="shrink-0 tabular-nums text-muted-foreground">
                                                <strong className="font-semibold text-foreground">{fmtHMSFull(s.seconds)}</strong> • {Math.round(pct)}%
                                            </span>
                                        </div>
                                        <div className="h-2 w-full rounded-full bg-muted">
                                            <div className="h-2 rounded-full" style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: colorMap[s.name] }} />
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
                {openSession && slices.length > 0 && (
                    <p className="mt-4 text-xs text-muted-foreground">Inclui a sessão em andamento, somando em tempo real.</p>
                )}
            </Painel>
        </Pagina>
    );
}