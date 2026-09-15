"use client";

/**
 * ARQUIVO: src/app/page.tsx
 *
 * O que muda:
 * - Header simples: "Olá, {nome}"
 * - Tag (pill) com data + hora (alinhada na mesma largura dos botões no mobile)
 * - Meta diária concreta: 50 questões, 10 flashcards e 10 resumos revisados
 * - Botões (cards) em 2 colunas no mobile, estilo “cartões coloridos”
 *   - Questões, Resumos, Revisão, Ciclo de Estudos, Cadernos e Tempo de estudo
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
  CheckCircle2,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { ResponsiveContainer, PieChart, Pie, Tooltip, Cell } from "recharts";

const ONE_DAY = 24 * 60 * 60 * 1000;

const DAILY_GOALS = {
  questoes: 50,
  flashcards: 10,
  resumos: 10,
} as const;

type ReviewMethod = "CADERNO" | "FLASHCARD" | "RESUMO";

type ReviewEventRow = {
  source_id: string | null;
  metadata: unknown;
  occurred_at: string;
};

type ReviewProgressRow = {
  item_id: string;
  method: ReviewMethod;
  last_reviewed_at: string | null;
  next_review: string;
};

function clampPct(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function reviewMethodFromMetadata(metadata: unknown): ReviewMethod | null {
  if (!isRecord(metadata)) return null;

  const raw = String(metadata.method ?? "").toUpperCase();

  if (raw === "CADERNO" || raw === "FLASHCARD" || raw === "RESUMO") {
    return raw;
  }

  return null;
}

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
  const [flashcardsHoje, setFlashcardsHoje] = useState(0);
  const [resumosRevisadosHoje, setResumosRevisadosHoje] = useState(0);

  const [totalResumos, setTotalResumos] = useState(0);
  const [revisoesConcluidasHoje, setRevisoesConcluidasHoje] = useState(0);
  const [revisoesPendentes, setRevisoesPendentes] = useState(0);
  const [totalCadernos, setTotalCadernos] = useState(0);
  const [tempoHojeSeg, setTempoHojeSeg] = useState(0);

  useEffect(() => {
    if (!userId) return;

    let active = true;

    (async () => {
      const inicioHoje = startOfLocalDay();
      const fimHoje = new Date(inicioHoje);
      fimHoje.setDate(fimHoje.getDate() + 1);

      const hojeYmd = ymdLocal(inicioHoje);

      const [
        questoes,
        resumos,
        reviewEvents,
        reviewProgress,
        sessoesHoje,
        cadernos,
      ] = await Promise.all([
        // Fonte atual das questões respondidas.
        supabase
          .from("question_attempts")
          .select("questao_id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("created_at", inicioHoje.toISOString())
          .lt("created_at", fimHoje.toISOString()),

        supabase
          .from("resumos")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),

        // Quando a gamificação está instalada, este é o histórico mais exato
        // das revisões concluídas no dia.
        supabase
          .from("gamification_events")
          .select("source_id,metadata,occurred_at")
          .eq("user_id", userId)
          .eq("event_type", "REVIEW_COMPLETED")
          .gte("occurred_at", inicioHoje.toISOString())
          .lt("occurred_at", fimHoje.toISOString())
          .order("occurred_at", { ascending: true }),

        // Também serve para calcular pendências e como fallback caso
        // gamification_events ainda não esteja disponível.
        supabase
          .from("review_progress")
          .select("item_id,method,last_reviewed_at,next_review")
          .eq("user_id", userId),

        supabase
          .from("study_sessions")
          .select("duration_seconds")
          .eq("user_id", userId)
          .gte("started_at", inicioHoje.toISOString())
          .lt("started_at", fimHoje.toISOString())
          .not("ended_at", "is", null),

        supabase
          .from("cadernos")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
      ]);

      if (!active) return;

      setQuestoesHoje(questoes.count ?? 0);
      setTotalResumos(resumos.count ?? 0);
      setTotalCadernos(cadernos.count ?? 0);

      const progressRows = (reviewProgress.data ?? []) as ReviewProgressRow[];

      setRevisoesPendentes(
        progressRows.filter((row) => String(row.next_review ?? "") <= hojeYmd).length
      );

      const methodByItem = new Map<string, ReviewMethod>();
      for (const row of progressRows) {
        methodByItem.set(String(row.item_id), row.method);
      }

      let flashcards = 0;
      let resumosFeitos = 0;
      let revisoesFeitas = 0;

      if (!reviewEvents.error) {
        for (const event of (reviewEvents.data ?? []) as ReviewEventRow[]) {
          const method =
            reviewMethodFromMetadata(event.metadata) ||
            (event.source_id
              ? methodByItem.get(String(event.source_id)) ?? null
              : null);

          if (!method) continue;

          revisoesFeitas += 1;

          if (method === "FLASHCARD") flashcards += 1;
          if (method === "RESUMO") resumosFeitos += 1;
        }
      } else {
        // Fallback sem alterar banco: review_progress guarda a última revisão
        // de cada item. Para a meta diária isso é suficiente para contar os
        // itens revisados hoje.
        for (const row of progressRows) {
          if (!row.last_reviewed_at) continue;

          const reviewedAt = new Date(row.last_reviewed_at);

          if (
            Number.isNaN(reviewedAt.getTime()) ||
            reviewedAt < inicioHoje ||
            reviewedAt >= fimHoje
          ) {
            continue;
          }

          revisoesFeitas += 1;

          if (row.method === "FLASHCARD") flashcards += 1;
          if (row.method === "RESUMO") resumosFeitos += 1;
        }
      }

      setFlashcardsHoje(flashcards);
      setResumosRevisadosHoje(resumosFeitos);
      setRevisoesConcluidasHoje(revisoesFeitas);

      const tempo = (sessoesHoje.data ?? []).reduce(
        (acc: number, s: any) => acc + Number(s.duration_seconds ?? 0),
        0
      );

      setTempoHojeSeg(Math.max(0, tempo));
    })();

    return () => {
      active = false;
    };
  }, [userId]);

  /* =========================
   * AÇÕES PRINCIPAIS
   * ========================= */

  const ACTIONS = useMemo(
    () => [
      {
        name: "Resolver Questões",
        subtitle: `${Math.min(questoesHoje, DAILY_GOALS.questoes)}/${DAILY_GOALS.questoes} hoje`,
        href: "/questoes",
        icon: Brain,
        bg: "from-indigo-500 to-violet-600",
      },
      {
        name: "Resumos",
        subtitle: `${Math.min(
          resumosRevisadosHoje,
          DAILY_GOALS.resumos
        )}/${DAILY_GOALS.resumos} hoje • ${totalResumos} salvos`,
        href: "/resumos",
        icon: FileText,
        bg: "from-sky-500 to-blue-600",
      },
      {
        name: "Revisão",
        subtitle: `${revisoesPendentes} para hoje • ${revisoesConcluidasHoje} feitas`,
        href: "/revisao",
        icon: History,
        bg: "from-orange-500 to-amber-500",
      },
      {
        name: "Ciclo de Estudos",
        subtitle: "Continue de onde parou",
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
      resumosRevisadosHoje,
      totalResumos,
      revisoesPendentes,
      revisoesConcluidasHoje,
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

  const questoesGoalPct = clampPct(
    (questoesHoje / DAILY_GOALS.questoes) * 100
  );

  const flashcardsGoalPct = clampPct(
    (flashcardsHoje / DAILY_GOALS.flashcards) * 100
  );

  const resumosGoalPct = clampPct(
    (resumosRevisadosHoje / DAILY_GOALS.resumos) * 100
  );

  const metasConcluidas =
    Number(questoesHoje >= DAILY_GOALS.questoes) +
    Number(flashcardsHoje >= DAILY_GOALS.flashcards) +
    Number(resumosRevisadosHoje >= DAILY_GOALS.resumos);

  const metaDiariaConcluida = metasConcluidas === 3;

  const metaDiariaPct = Math.round(
    (questoesGoalPct + flashcardsGoalPct + resumosGoalPct) / 3
  );

  const dailyGoalItems = [
    {
      label: "Questões",
      value: questoesHoje,
      target: DAILY_GOALS.questoes,
      progress: questoesGoalPct,
      href: "/questoes",
      icon: Brain,
    },
    {
      label: "Flashcards",
      value: flashcardsHoje,
      target: DAILY_GOALS.flashcards,
      progress: flashcardsGoalPct,
      href: "/revisao",
      icon: Target,
    },
    {
      label: "Resumos",
      value: resumosRevisadosHoje,
      target: DAILY_GOALS.resumos,
      progress: resumosGoalPct,
      href: "/revisao",
      icon: FileText,
    },
  ];

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

        {/* DATA / HORA */}
        <div className="w-full rounded-2xl border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground shadow-sm flex items-center justify-center sm:justify-start gap-2">
          <CalendarIcon className="h-4 w-4 text-primary" />
          <span className="capitalize">{dateTimePillText}</span>
        </div>

        {/* META DIÁRIA */}
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                <h2 className="text-base font-extrabold text-foreground">
                  Meta diária
                </h2>
              </div>

              <p className="mt-1 text-xs text-muted-foreground">
                50 questões • 10 flashcards • 10 resumos revisados
              </p>
            </div>

            <div className="flex items-center gap-2">
              {metaDiariaConcluida ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Dia concluído
                </span>
              ) : (
                <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                  {metasConcluidas}/3 metas concluídas
                </span>
              )}

              <span className="text-sm font-extrabold text-foreground">
                {metaDiariaPct}%
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            {dailyGoalItems.map((goal) => {
              const Icon = goal.icon;
              const completed = goal.value >= goal.target;

              return (
                <Link
                  key={goal.label}
                  href={goal.href}
                  className="rounded-2xl border border-border bg-background p-4 transition hover:bg-muted/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${completed
                            ? "bg-emerald-500/10 text-emerald-600"
                            : "bg-primary/10 text-primary"
                          }`}
                      >
                        {completed ? (
                          <CheckCircle2 className="h-5 w-5" />
                        ) : (
                          <Icon className="h-5 w-5" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="font-semibold text-foreground">
                          {goal.label}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {Math.min(goal.value, goal.target)} / {goal.target}
                          {goal.value > goal.target
                            ? ` • ${goal.value - goal.target} extras`
                            : ""}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`text-sm font-extrabold ${completed ? "text-emerald-600" : "text-foreground"
                        }`}
                    >
                      {Math.round(goal.progress)}%
                    </span>
                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${completed ? "bg-emerald-500" : "bg-primary"
                        }`}
                      style={{ width: `${goal.progress}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">
                Progresso geral do dia
              </span>
              <span className="text-muted-foreground">{metaDiariaPct}%</span>
            </div>

            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${metaDiariaConcluida ? "bg-emerald-500" : "bg-primary"
                  }`}
                style={{ width: `${metaDiariaPct}%` }}
              />
            </div>
          </div>
        </section>

        {/* AÇÕES PRINCIPAIS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
                  <div className="text-[15px] font-extrabold leading-tight">
                    {it.name}
                  </div>
                  <div className="mt-1 text-xs text-white/85">
                    {it.subtitle}
                  </div>
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