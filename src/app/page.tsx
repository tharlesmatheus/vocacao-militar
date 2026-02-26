"use client";

/**
 * ARQUIVO: src/app/page.tsx
 *
 * O que muda:
 * - Header simples: "Olá, {nome}"
 * - Tag (pill) com data (igual sua imagem)
 * - 4 botões (cards) em 2 colunas no mobile, estilo “cartões coloridos”
 *   - Questões, Resumos, Revisão, Cronograma
 *   - Remove Edital
 * - Abaixo: “Suas Estatísticas” no padrão da imagem (2 colunas)
 *   - Questões, Taxa de acerto, Tempo médio (s/questão), Sequência (dias seguidos)
 *
 * Observações:
 * - Usa sua tabela "estatisticas" (questoes_respondidas, taxa_acerto)
 * - Calcula:
 *   - Tempo médio: total de tempo estudado (pomodoro_sessions study) / questões respondidas
 *   - Sequência: dias consecutivos com estudo (>0s) usando pomodoro_sessions
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

const ONE_DAY = 24 * 60 * 60 * 1000;

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
  // YYYY-MM-DD no fuso local (evita “pular dia” por timezone)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function fmtDatePill(d: Date) {
  // "Quarta-feira, 25 de fevereiro"
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

export default function DashboardHome() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [userName, setUserName] = useState("");

  // stats
  const [questoesTotal, setQuestoesTotal] = useState(0);
  const [taxaAcerto, setTaxaAcerto] = useState(0);

  // tempo e streak
  const [tempoTotalSeg30d, setTempoTotalSeg30d] = useState(0);
  const [streakDias, setStreakDias] = useState(0);

  const today = useMemo(() => new Date(), []);
  const todayPill = useMemo(() => fmtDatePill(new Date()), []);

  // ====== CARDS DO TOPO (4 BOTÕES) ======
  const ACTIONS = useMemo(
    () => [
      {
        name: "Resolver Questões",
        subtitle: "Continue seus estudos",
        href: "/questoes",
        icon: Brain,
        // roxo
        bg: "from-indigo-500 to-violet-600",
      },
      {
        name: "Resumos",
        subtitle: "Revise por tópicos",
        href: "/resumos",
        icon: FileText,
        // azul
        bg: "from-sky-500 to-blue-600",
      },
      {
        name: "Revisão",
        subtitle: "Revisões programadas",
        href: "/revisao",
        icon: History,
        // laranja
        bg: "from-orange-500 to-amber-500",
      },
      {
        name: "Cronograma",
        subtitle: "Planeje sua rotina",
        href: "/cronograma",
        icon: CalendarDays,
        // teal
        bg: "from-emerald-500 to-teal-600",
      },
    ],
    []
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

        const userId = data.user.id;

        // 1) estatisticas (resumo)
        const estReq = supabase
          .from("estatisticas")
          .select("questoes_respondidas,taxa_acerto")
          .eq("user_id", userId)
          .maybeSingle();

        // 2) tempo estudado 30 dias (pomodoro_sessions)
        const daysWindow = 30;
        const from30 = new Date(startOfLocalDay().getTime() - (daysWindow - 1) * ONE_DAY);

        const pomodoro30Req = supabase
          .from("pomodoro_sessions")
          .select("duration_seconds,started_at,phase")
          .eq("user_id", userId)
          .eq("phase", "study")
          .not("duration_seconds", "is", null)
          .gte("started_at", from30.toISOString());

        // 3) streak: buscamos até 365 dias pra contar sequência (leve e suficiente)
        const from365 = new Date(startOfLocalDay().getTime() - 365 * ONE_DAY);

        const pomodoro365Req = supabase
          .from("pomodoro_sessions")
          .select("duration_seconds,started_at,phase")
          .eq("user_id", userId)
          .eq("phase", "study")
          .not("duration_seconds", "is", null)
          .gte("started_at", from365.toISOString());

        const [est, pom30, pom365] = await Promise.all([estReq, pomodoro30Req, pomodoro365Req]);

        if (!mounted || controller.signal.aborted) return;

        // estatisticas
        setQuestoesTotal(fmtCompact(est.data?.questoes_respondidas ?? 0));
        setTaxaAcerto(Math.round(fmtCompact(est.data?.taxa_acerto ?? 0)));

        // tempo 30d
        const total30 = (pom30.data ?? []).reduce((acc: number, r: any) => {
          const dur = Number(r?.duration_seconds ?? 0);
          return acc + (Number.isFinite(dur) ? Math.max(0, dur) : 0);
        }, 0);
        setTempoTotalSeg30d(Math.round(total30));

        // streak
        const byDay: Record<string, number> = {};
        for (const r of pom365.data ?? []) {
          const startedAt = new Date(r.started_at);
          if (Number.isNaN(startedAt.getTime())) continue;
          const key = ymdLocal(new Date(startedAt.getFullYear(), startedAt.getMonth(), startedAt.getDate()));
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

  const tempoMedioSeg = useMemo(() => {
    if (!questoesTotal) return 0;
    return Math.max(0, Math.round(tempoTotalSeg30d / questoesTotal));
  }, [tempoTotalSeg30d, questoesTotal]);

  const statsCards = useMemo(
    () => [
      {
        label: "QUESTÕES",
        value: questoesTotal,
        sub: questoesTotal ? `${Math.min(questoesTotal, questoesTotal)} feitas` : "Sem dados",
        icon: BarChart2,
        iconBg: "bg-violet-600",
      },
      {
        label: "TAXA DE ACERTO",
        value: `${taxaAcerto}%`,
        sub: "Média geral",
        icon: Target,
        iconBg: "bg-rose-500",
      },
      {
        label: "TEMPO MÉDIO",
        value: `${tempoMedioSeg || 0}s`,
        sub: "Por questão (30 dias)",
        icon: Timer,
        iconBg: "bg-sky-600",
      },
      {
        label: "SEQUÊNCIA",
        value: String(streakDias),
        sub: "Dias seguidos",
        icon: Flame,
        iconBg: "bg-amber-500",
      },
    ],
    [questoesTotal, taxaAcerto, tempoMedioSeg, streakDias]
  );

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
        {/* HEADER (simples) */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Olá{userName ? `, ${userName}` : ""}.
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Continue sua jornada de estudos</p>
          </div>
        </div>

        {/* PILL de DATA (igual imagem) */}
        <div className="flex justify-center sm:justify-start">
          <div className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2 text-sm text-muted-foreground shadow-sm">
            <CalendarIcon className="h-4 w-4 text-primary" />
            <span className="capitalize">{todayPill}</span>
          </div>
        </div>

        {/* AÇÕES (4 botões) — 2 colunas no mobile */}
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
                {/* detalhe decorativo */}
                <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-white/20" />
                <div className="absolute right-4 top-4 h-10 w-10 rounded-2xl bg-white/15 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-white" />
                </div>

                <div className="mt-10">
                  <div className="text-base font-extrabold leading-tight">{it.name}</div>
                  <div className="mt-1 text-xs text-white/80">{it.subtitle}</div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* ESTATÍSTICAS (padrão da imagem) */}
        <section className="rounded-2xl bg-card border border-border p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-extrabold text-foreground">Suas Estatísticas</div>
              <div className="text-sm text-muted-foreground">Acompanhe seu progresso</div>
            </div>

            <Link
              href="/estatisticas"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground hover:bg-muted/70 transition"
            >
              Ver detalhes
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          {erro ? <p className="mt-3 text-sm text-destructive">{erro}</p> : null}

          <div className="mt-4 grid grid-cols-2 gap-3">
            {statsCards.map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.label} className="rounded-2xl border border-border bg-background p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className={`h-12 w-12 rounded-2xl ${c.iconBg} flex items-center justify-center`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>

                    <div className="min-w-0">
                      <div className="text-[11px] font-bold tracking-widest text-muted-foreground">
                        {c.label}
                      </div>
                      <div className="mt-1 text-2xl font-extrabold text-foreground leading-none">
                        {c.value}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">{c.sub}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 text-[11px] text-muted-foreground">
            * Tempo médio e sequência usam suas sessões de estudo (pomodoro_sessions). Tempo médio considera janela de 30 dias.
          </div>
        </section>
      </div>
    </main>
  );
}