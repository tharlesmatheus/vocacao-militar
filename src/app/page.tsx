"use client";

/**
 * ARQUIVO: src/app/page.tsx
 *
 * O que muda:
 * - Header simples: "Olá, {nome}"
 * - Tag (pill) com data + hora (alinhada na mesma largura dos botões no mobile)
 * - 4 botões (cards) em 2 colunas no mobile, estilo “cartões coloridos”
 *   - Questões, Resumos, Revisão, Cronograma
 * - Abaixo: “Suas Estatísticas” no padrão da imagem (2 colunas), mais compacto/alinhado
 * - Abaixo: Tempo de estudo (gráfico redondo/pizza + lista) EMBUTIDO aqui (substitui o mini gráfico atual)
 *   - Fonte: study_sessions (com ended_at != null) + sessão aberta em tempo real (ended_at null)
 *   - Filtro: Dia / Semana / Mês / Ano / Tudo
 *   - Cores estáveis por matéria (hash do nome)
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen } from "lucide-react";
import {
  Brain,
  FileText,
  History,
  CalendarDays,
  Calendar as CalendarIcon,
  BarChart2,
  Target,
  Timer,
  Flame,
  ArrowUpRight,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { ResponsiveContainer, PieChart, Pie, Tooltip, Cell } from "recharts";

const ONE_DAY = 24 * 60 * 60 * 1000;

/* =========================
 * Helpers básicos
 * ========================= */
function sanitizeDisplayName(name: string): string {
  const cleaned = (name ?? "").replace(/\s+/g, " ").trim();
  return cleaned.length > 60 ? `${cleaned.slice(0, 60)}…` : cleaned;
}

function startOfLocalDay(t = Date.now()) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d;
}

function ymdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function hmLocal(d: Date) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function fmtDateLong(d: Date) {
  return d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

function fmtCompact(n: number) {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? v : 0;
}

/* =========================
 * Tempo de estudo (Pizza)
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

const COLOR_PALETTE = [
  "#6366F1", // indigo
  "#22C55E", // green
  "#F97316", // orange
  "#06B6D4", // cyan
  "#A855F7", // purple
  "#EF4444", // red
  "#F59E0B", // amber
  "#3B82F6", // blue
  "#10B981", // emerald
  "#EC4899", // pink
  "#14B8A6", // teal
  "#8B5CF6", // violet
  "#84CC16", // lime
  "#0EA5E9", // sky
  "#E11D48", // rose
] as const;

function hashStringToInt(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function colorForName(name: string): string {
  const idx = hashStringToInt(name || "SEM_NOME") % COLOR_PALETTE.length;
  return COLOR_PALETTE[idx];
}

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

function getRangeStart(range: RangeKey): Date | null {
  const now = new Date();
  const d = new Date(now);

  if (range === "tudo") return null;

  if (range === "dia") {
    d.setHours(0, 0, 0, 0);
    return d;
  }

  if (range === "semana") {
    const day = d.getDay();
    const diff = (day + 6) % 7; // semana começa na segunda
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

  if (openSession && typeof openElapsedSec === "number" && openElapsedSec > 0) {
    const matId = openSession.materia_id ?? "SEM_MATERIA";
    byMat[matId] = (byMat[matId] ?? 0) + Math.max(0, Math.floor(openElapsedSec));
  }

  return Object.entries(byMat)
    .map(([id, seconds]) => ({
      name: id === "SEM_MATERIA" ? "Sem matéria" : matName[id] || "Matéria",
      seconds,
    }))
    .filter((x) => x.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);
}

/* =========================
 * Page
 * ========================= */
export default function DashboardHome() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState<string>("");

  // stats (resumo)
  const [questoesTotal, setQuestoesTotal] = useState(0);
  const [taxaAcerto, setTaxaAcerto] = useState(0);

  // tempo médio (pomodoro) e streak (pomodoro)
  const [tempoTotalSeg30d, setTempoTotalSeg30d] = useState(0);
  const [streakDias, setStreakDias] = useState(0);

  // pill relógio
  const [now, setNow] = useState<Date>(() => new Date());
  const clockRef = useRef<number | null>(null);

  // ===== Tempo de estudo (pizza) =====
  const [tdeLoading, setTdeLoading] = useState(false);
  const [tdeErro, setTdeErro] = useState<string | null>(null);

  const [materias, setMaterias] = useState<Materia[]>([]);
  const [assuntos, setAssuntos] = useState<Assunto[]>([]);
  const [matName, setMatName] = useState<Record<string, string>>({});
  const [assName, setAssName] = useState<Record<string, string>>({});

  const [materiaId, setMateriaId] = useState<string>("");
  const [assuntoId, setAssuntoId] = useState<string>("");

  const [range, setRange] = useState<RangeKey>("tudo");

  const [openSession, setOpenSession] = useState<OpenSession | null>(null);
  const [openElapsedSec, setOpenElapsedSec] = useState<number>(0);
  const timerRef = useRef<number | null>(null);

  const [sessions, setSessions] = useState<
    Array<{ materia_id: string | null; duration_seconds: number | null }>
  >([]);

  /* =========================
 * CONTADORES DASHBOARD
 * ========================= */

  const [questoesHoje, setQuestoesHoje] = useState(0);
  const [totalResumos, setTotalResumos] = useState(0);
  const [revisoesHoje, setRevisoesHoje] = useState(0);
  const [totalCadernos, setTotalCadernos] = useState(0);
  const [tempoHojeSeg, setTempoHojeSeg] = useState(0);

  useEffect(() => {
    if (!userId) return;

    (async () => {
      const inicioHoje = startOfLocalDay();

      const [
        questoes,
        resumos,
        revisoes,
        sessoesHoje,
        cadernos,
      ] = await Promise.all([
        supabase
          .from("questoes_resolvidas")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("created_at", inicioHoje.toISOString()),

        supabase
          .from("resumos")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),

        supabase
          .from("revisoes")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .is("done_at", null)
          .lte("scheduled_for", new Date().toISOString()),

        supabase
          .from("study_sessions")
          .select("duration_seconds")
          .eq("user_id", userId)
          .gte("started_at", inicioHoje.toISOString())
          .not("ended_at", "is", null),

        supabase
          .from("cadernos")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
      ]);

      setQuestoesHoje(questoes.count ?? 0);
      setTotalResumos(resumos.count ?? 0);
      setRevisoesHoje(revisoes.count ?? 0);
      setTotalCadernos(cadernos.count ?? 0);

      const tempo = (sessoesHoje.data ?? []).reduce(
        (acc: number, s: any) => acc + (s.duration_seconds ?? 0),
        0
      );

      setTempoHojeSeg(tempo);
    })();
  }, [userId]);

  /* =========================
   * AÇÕES (6 BOTÕES)
   * ========================= */

  const ACTIONS = useMemo(
    () => [
      {
        name: "Resolver Questões",
        subtitle: `${questoesHoje} hoje`,
        href: "/questoes",
        icon: Brain,
        bg: "from-indigo-500 to-violet-600",
      },
      {
        name: "Resumos",
        subtitle: `${totalResumos} resumos`,
        href: "/resumos",
        icon: FileText,
        bg: "from-sky-500 to-blue-600",
      },
      {
        name: "Revisão",
        subtitle: `${revisoesHoje} pendentes`,
        href: "/revisao",
        icon: History,
        bg: "from-orange-500 to-amber-500",
      },
      {
        name: "Cronograma",
        subtitle: "Sua rotina",
        href: "/cronograma",
        icon: CalendarDays,
        bg: "from-emerald-500 to-teal-600",
      },
      {
        name: "Cadernos",
        subtitle: `${totalCadernos} cadernos`,
        href: "/cadernos",
        icon: BookOpen,
        bg: "from-rose-500 to-red-600",
      },
      {
        name: "Tempo de estudo",
        subtitle: fmtHMSFull(tempoHojeSeg),
        href: "/tempo-de-estudo",
        icon: Timer,
        bg: "from-purple-500 to-fuchsia-600",
      },
    ],
    [
      questoesHoje,
      totalResumos,
      revisoesHoje,
      totalCadernos,
      tempoHojeSeg,
    ]
  );

  // ====== LOAD AUTH + DADOS ======
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    (async () => {
      setLoading(true);
      setErro(null);

      try {
        const { data, error } = await supabase.auth.getUser();
        if (!mounted || controller.signal.aborted) return;

        if (error || !data?.user?.id) {
          router.replace("/auth");
          return;
        }

        const meta = data.user.user_metadata ?? {};
        const rawFullName =
          (meta.full_name as string | undefined) ||
          (meta.name as string | undefined) ||
          (data.user.email ? data.user.email.split("@")[0] : "") ||
          "";

        setUserName(sanitizeDisplayName(rawFullName));
        setUserId(data.user.id);

        const uid = data.user.id;

        // 1) estatisticas (resumo)
        const estReq = supabase
          .from("estatisticas")
          .select("questoes_respondidas,taxa_acerto")
          .eq("user_id", uid)
          .maybeSingle();

        // 2) tempo estudado 30 dias (pomodoro_sessions)
        const from30 = new Date(startOfLocalDay().getTime() - (30 - 1) * ONE_DAY);

        const pomodoro30Req = supabase
          .from("pomodoro_sessions")
          .select("duration_seconds,started_at,phase")
          .eq("user_id", uid)
          .eq("phase", "study")
          .not("duration_seconds", "is", null)
          .gte("started_at", from30.toISOString());

        // 3) streak: até 365 dias
        const from365 = new Date(startOfLocalDay().getTime() - 365 * ONE_DAY);

        const pomodoro365Req = supabase
          .from("pomodoro_sessions")
          .select("duration_seconds,started_at,phase")
          .eq("user_id", uid)
          .eq("phase", "study")
          .not("duration_seconds", "is", null)
          .gte("started_at", from365.toISOString());

        const [est, pom30, pom365] = await Promise.all([estReq, pomodoro30Req, pomodoro365Req]);

        if (!mounted || controller.signal.aborted) return;

        setQuestoesTotal(fmtCompact(est.data?.questoes_respondidas ?? 0));
        setTaxaAcerto(Math.round(fmtCompact(est.data?.taxa_acerto ?? 0)));

        const total30 = (pom30.data ?? []).reduce((acc: number, r: any) => {
          const dur = Number(r?.duration_seconds ?? 0);
          return acc + (Number.isFinite(dur) ? Math.max(0, dur) : 0);
        }, 0);
        setTempoTotalSeg30d(Math.round(total30));

        const byDay: Record<string, number> = {};
        for (const r of pom365.data ?? []) {
          const startedAt = new Date(r.started_at);
          if (Number.isNaN(startedAt.getTime())) continue;

          const key = ymdLocal(
            new Date(startedAt.getFullYear(), startedAt.getMonth(), startedAt.getDate())
          );

          const dur = Number(r?.duration_seconds ?? 0);
          if (!Number.isFinite(dur)) continue;
          byDay[key] = (byDay[key] ?? 0) + Math.max(0, dur);
        }

        let streak = 0;
        const base = startOfLocalDay().getTime();
        for (let i = 0; i < 366; i++) {
          const d = new Date(base - i * ONE_DAY);
          const key = ymdLocal(d);
          const studied = (byDay[key] ?? 0) > 0;
          if (!studied) break;
          streak += 1;
        }
        setStreakDias(streak);

        setLoading(false);
      } catch {
        if (!mounted || controller.signal.aborted) return;
        router.replace("/auth");
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [router]);

  // ====== relógio atualiza (hora no pill) ======
  useEffect(() => {
    if (clockRef.current) window.clearInterval(clockRef.current);
    clockRef.current = window.setInterval(() => setNow(new Date()), 30_000);
    return () => {
      if (clockRef.current) window.clearInterval(clockRef.current);
      clockRef.current = null;
    };
  }, []);

  const tempoMedioSeg = useMemo(() => {
    if (!questoesTotal) return 0;
    return Math.max(0, Math.round(tempoTotalSeg30d / questoesTotal));
  }, [tempoTotalSeg30d, questoesTotal]);

  const statsCards = useMemo(
    () => [
      {
        label: "Questões",
        value: questoesTotal,
        sub: "Respondidas",
        icon: BarChart2,
        iconBg: "bg-violet-600",
      },
      {
        label: "Acerto",
        value: `${taxaAcerto}%`,
        sub: "Média",
        icon: Target,
        iconBg: "bg-rose-500",
      },
      {
        label: "Tempo",
        value: `${tempoMedioSeg || 0}s`,
        sub: "/ questão",
        icon: Timer,
        iconBg: "bg-sky-600",
      },
      {
        label: "Sequência",
        value: String(streakDias),
        sub: "Dias",
        icon: Flame,
        iconBg: "bg-amber-500",
      },
    ],
    [questoesTotal, taxaAcerto, tempoMedioSeg, streakDias]
  );

  const dateTimePillText = useMemo(() => `${fmtDateLong(now)} • ${hmLocal(now)}`, [now]);

  /* =========================
   * Tempo de estudo: carregar listas + sessão aberta
   * ========================= */
  useEffect(() => {
    let mounted = true;
    if (!userId) return;

    (async () => {
      setTdeLoading(true);
      setTdeErro(null);

      try {
        const [mats, asss] = await Promise.all([
          supabase.from("materias").select("id,nome").eq("user_id", userId),
          supabase.from("assuntos").select("id,nome,materia_id").eq("user_id", userId),
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

        const { data: open } = await supabase
          .from("study_sessions")
          .select("id, started_at, materia_id, assunto_id, mode")
          .eq("user_id", userId)
          .is("ended_at", null)
          .order("started_at", { ascending: false })
          .limit(1);

        if (!mounted) return;

        if (open && open.length) setOpenSession(open[0] as OpenSession);
        else setOpenSession(null);
      } catch (e: any) {
        if (!mounted) return;
        setTdeErro(e?.message || "Falha ao carregar tempo de estudo.");
      } finally {
        if (!mounted) return;
        setTdeLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [userId]);

  /* =========================
   * Tempo de estudo: carregar sessões finalizadas (respeita filtro + range)
   * ========================= */
  useEffect(() => {
    let mounted = true;
    if (!userId) return;

    (async () => {
      try {
        setTdeErro(null);

        let q = supabase
          .from("study_sessions")
          .select("materia_id,assunto_id,duration_seconds,started_at,ended_at")
          .eq("user_id", userId)
          .not("duration_seconds", "is", null)
          .not("ended_at", "is", null)
          .order("started_at", { ascending: false });

        const from = getRangeStart(range);
        if (from) q = q.gte("started_at", from.toISOString());

        if (materiaId) q = q.eq("materia_id", materiaId);
        if (assuntoId) q = q.eq("assunto_id", assuntoId);

        const { data, error } = await q;
        if (error) throw error;
        if (!mounted) return;

        setSessions((data ?? []) as any);
      } catch (e: any) {
        if (!mounted) return;
        setTdeErro(e?.message || "Falha ao carregar sessões.");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [userId, range, materiaId, assuntoId]);

  /* =========================
   * Cronômetro em tempo real (sessão aberta)
   * ========================= */
  useEffect(() => {
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

    const tick = () => {
      const nowTs = Date.now();
      setOpenElapsedSec(Math.max(0, Math.floor((nowTs - started) / 1000)));
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

  const assuntosFiltrados = useMemo(
    () => (materiaId ? assuntos.filter((a) => a.materia_id === materiaId) : assuntos),
    [assuntos, materiaId]
  );

  const slices = useMemo(
    () => buildSlices(sessions, matName, openSession, openElapsedSec),
    [sessions, matName, openSession, openElapsedSec]
  );

  const totalSeconds = useMemo(() => slices.reduce((acc, s) => acc + s.seconds, 0), [slices]);

  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of slices) map[s.name] = colorForName(s.name);
    return map;
  }, [slices]);

  async function getAccessToken(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error("Sessão inválida (sem access_token).");
    return token;
  }

  async function handleStart() {
    setTdeErro(null);

    try {
      if (!materiaId) {
        setTdeErro("Selecione uma Matéria para iniciar.");
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

      setOpenSession(out.session as OpenSession);
    } catch (e: any) {
      setTdeErro(e?.message || "Falha ao iniciar.");
    }
  }

  async function handleStop() {
    setTdeErro(null);

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

      setOpenSession(null);
      setOpenElapsedSec(0);
      // o effect de sessions já recarrega quando range/materiaId/assuntoId mudam,
      // mas aqui forçamos refletir rápido:
      setSessions((prev) => [...prev]);
    } catch (e: any) {
      setTdeErro(e?.message || "Falha ao parar.");
    }
  }

  if (loading) {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center px-4">
        <span className="text-lg text-foreground">Carregando...</span>
      </main>
    );
  }

  return (
    <main className="w-full px-4 sm:px-6 lg:px-8 py-6">
      <div className="mx-auto w-full max-w-6xl space-y-5">
        {/* HEADER */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Olá{userName ? `, ${userName}` : ""}.
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Continue sua jornada de estudos</p>
        </div>

        {/* PILL (mesma largura dos botões no mobile) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="col-span-2 lg:col-span-4">
            <div className="w-full rounded-2xl border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground shadow-sm flex items-center justify-center sm:justify-start gap-2">
              <CalendarIcon className="h-4 w-4 text-primary" />
              <span className="capitalize">{dateTimePillText}</span>
            </div>
          </div>

          {/* AÇÕES (4 botões) */}
          {ACTIONS.map((it) => {
            const Icon = it.icon;
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`relative overflow-hidden rounded-2xl p-4 text-white shadow-sm bg-gradient-to-r ${it.bg}
                  hover:opacity-[0.96] active:scale-[0.99] transition`}
              >
                <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-white/20" />
                <div className="absolute right-3 top-3 h-10 w-10 rounded-2xl bg-white/15 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-white" />
                </div>

                <div className="mt-10">
                  <div className="text-[15px] font-extrabold leading-tight">{it.name}</div>
                  <div className="mt-1 text-xs text-white/85">{it.subtitle}</div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* ESTATÍSTICAS (compacto/alinhado) */}
        <section className="rounded-2xl bg-card border border-border p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-base font-extrabold text-foreground">Suas Estatísticas</div>
              <div className="text-xs text-muted-foreground">Resumo rápido</div>
            </div>

            <Link
              href="/estatisticas"
              className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/70 transition"
            >
              Detalhes
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          {erro ? <p className="mt-3 text-sm text-destructive">{erro}</p> : null}

          <div className="mt-4 grid grid-cols-2 gap-3">
            {statsCards.map((c) => {
              const Icon = c.icon;
              return (
                <div
                  key={c.label}
                  className="rounded-2xl border border-border bg-background px-3.5 py-3 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-11 w-11 rounded-2xl ${c.iconBg} flex items-center justify-center shrink-0`}
                    >
                      <Icon className="h-5 w-5 text-white" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase leading-none">
                        {c.label}
                      </div>
                      <div className="mt-1 text-[22px] font-extrabold text-foreground leading-none">
                        {c.value}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground leading-none">{c.sub}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 text-[11px] text-muted-foreground">
            * Tempo médio usa os últimos 30 dias (pomodoro).
          </div>
        </section>

        {/* TEMPO DE ESTUDO (pizza + lista) */}
        <section className="rounded-2xl bg-card border border-border p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-base font-extrabold text-foreground">Tempo de estudo</div>
              <div className="text-xs text-muted-foreground">Por matéria</div>
            </div>

            <div className="flex gap-2 flex-wrap">
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
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${range === k ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"
                    }`}
                  disabled={tdeLoading}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* BLOCO: iniciar/controle (compacto) */}
          <div className="mt-4 rounded-2xl border border-border bg-background p-4 space-y-3">
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
                  disabled={tdeLoading || !!openSession}
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
                  disabled={tdeLoading || !assuntosFiltrados.length || !!openSession}
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

            {openSession ? (
              <div className="rounded-xl border border-border bg-muted p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-[220px]">
                  <div className="text-sm font-semibold">Sessão em andamento</div>
                  <div className="text-xs text-muted-foreground">
                    {openSession.materia_id ? matName[openSession.materia_id] : "Sem matéria"}
                    {openSession.assunto_id ? ` • ${assName[openSession.assunto_id] ?? "Assunto"}` : ""}
                  </div>
                </div>

                <div className="text-lg font-extrabold tracking-tight">{fmtHMSFull(openElapsedSec)}</div>

                <button
                  className="px-5 py-2 rounded-xl bg-destructive text-destructive-foreground font-semibold"
                  onClick={handleStop}
                  disabled={tdeLoading}
                >
                  Parar e salvar
                </button>
              </div>
            ) : (
              <button
                className="px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-60"
                onClick={handleStart}
                disabled={tdeLoading || !materiaId}
              >
                Iniciar atividade
              </button>
            )}

            {tdeErro && <div className="text-destructive text-sm">{tdeErro}</div>}
            {tdeLoading && <div className="text-muted-foreground text-sm">Carregando…</div>}
          </div>

          {/* Pizza + lista */}
          <div className="mt-4">
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
                        stroke="var(--card)"
                        strokeWidth={2}
                      >
                        {slices.map((s) => (
                          <Cell key={s.name} fill={colorMap[s.name] ?? "#94A3B8"} />
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
                      const color = colorMap[s.name] ?? "#94A3B8";

                      return (
                        <div
                          key={s.name}
                          className="flex items-center justify-between rounded-xl border border-border bg-muted px-3 py-2"
                        >
                          <div className="min-w-0 flex items-center gap-2">
                            <span
                              className="inline-block h-3 w-3 rounded-full shrink-0"
                              style={{ backgroundColor: color }}
                              aria-hidden="true"
                            />
                            <div className="min-w-0">
                              <div className="font-medium truncate">{s.name}</div>
                              <div className="text-xs text-muted-foreground">{pct}%</div>
                            </div>
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
        </section>
      </div>
    </main>
  );
}