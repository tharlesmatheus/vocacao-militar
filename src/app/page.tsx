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
 * - Abaixo: Mini gráfico “Estudo” com filtro DIA/SEMANA/MÊS (botões em 1 linha)
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

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

type MiniRange = "dia" | "semana" | "mes";
type StudyPoint = { label: string; minutos: number };

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

  // pill relógio
  const [now, setNow] = useState<Date>(() => new Date());
  const clockRef = useRef<number | null>(null);

  // mini chart
  const [miniRange, setMiniRange] = useState<MiniRange>("semana");
  const [miniLoading, setMiniLoading] = useState(false);
  const [miniSeries, setMiniSeries] = useState<StudyPoint[]>([]);

  const ACTIONS = useMemo(
    () => [
      {
        name: "Resolver Questões",
        subtitle: "Continue",
        href: "/questoes",
        icon: Brain,
        bg: "from-indigo-500 to-violet-600",
      },
      {
        name: "Resumos",
        subtitle: "Por tópicos",
        href: "/resumos",
        icon: FileText,
        bg: "from-sky-500 to-blue-600",
      },
      {
        name: "Revisão",
        subtitle: "Programada",
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
    ],
    []
  );

  // ====== auth + dados (cards) ======
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
        const from30 = new Date(startOfLocalDay().getTime() - (30 - 1) * ONE_DAY);

        const pomodoro30Req = supabase
          .from("pomodoro_sessions")
          .select("duration_seconds,started_at,phase")
          .eq("user_id", userId)
          .eq("phase", "study")
          .not("duration_seconds", "is", null)
          .gte("started_at", from30.toISOString());

        // 3) streak: até 365 dias
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
    clockRef.current = window.setInterval(() => setNow(new Date()), 30_000); // 30s
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

  const dateTimePillText = useMemo(() => {
    // "Quarta-feira, 25 de fevereiro • 19:42"
    return `${fmtDateLong(now)} • ${hmLocal(now)}`;
  }, [now]);

  // ====== mini chart loader ======
  useEffect(() => {
    let mounted = true;

    (async () => {
      setMiniLoading(true);

      try {
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;
        if (!user?.id) return;

        if (miniRange === "dia") {
          // últimas 24h por hora
          const end = new Date();
          const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

          const { data, error } = await supabase
            .from("pomodoro_sessions")
            .select("started_at,duration_seconds,phase")
            .eq("user_id", user.id)
            .eq("phase", "study")
            .not("duration_seconds", "is", null)
            .gte("started_at", start.toISOString())
            .lte("started_at", end.toISOString())
            .order("started_at", { ascending: true });

          if (error) throw error;
          if (!mounted) return;

          const byHour: Record<string, number> = {};
          for (let i = 0; i < 24; i++) {
            const d = new Date(end.getTime() - (23 - i) * 60 * 60 * 1000);
            const key = `${String(d.getHours()).padStart(2, "0")}:00`;
            byHour[key] = 0;
          }

          for (const r of data ?? []) {
            const dt = new Date(r.started_at);
            if (Number.isNaN(dt.getTime())) continue;
            const key = `${String(dt.getHours()).padStart(2, "0")}:00`;
            const dur = Number(r.duration_seconds ?? 0);
            if (!Number.isFinite(dur)) continue;
            byHour[key] = (byHour[key] ?? 0) + Math.round(Math.max(0, dur) / 60);
          }

          const series: StudyPoint[] = Object.entries(byHour).map(([label, minutos]) => ({
            label,
            minutos,
          }));

          setMiniSeries(series);
          return;
        }

        if (miniRange === "semana") {
          // últimos 7 dias
          const today0 = startOfLocalDay();
          const from = new Date(today0.getTime() - (7 - 1) * ONE_DAY);

          const { data, error } = await supabase
            .from("pomodoro_sessions")
            .select("started_at,duration_seconds,phase")
            .eq("user_id", user.id)
            .eq("phase", "study")
            .not("duration_seconds", "is", null)
            .gte("started_at", from.toISOString())
            .order("started_at", { ascending: true });

          if (error) throw error;
          if (!mounted) return;

          const byDay: Record<string, number> = {};
          for (let i = 0; i < 7; i++) {
            const d = new Date(from.getTime() + i * ONE_DAY);
            const key = ymdLocal(d);
            byDay[key] = 0;
          }

          for (const r of data ?? []) {
            const dt = new Date(r.started_at);
            if (Number.isNaN(dt.getTime())) continue;
            const key = ymdLocal(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()));
            const dur = Number(r.duration_seconds ?? 0);
            if (!Number.isFinite(dur)) continue;
            byDay[key] = (byDay[key] ?? 0) + Math.round(Math.max(0, dur) / 60);
          }

          const series: StudyPoint[] = Object.entries(byDay).map(([key, minutos]) => {
            const [yyyy, mm, dd] = key.split("-");
            return { label: `${dd}/${mm}`, minutos };
          });

          setMiniSeries(series);
          return;
        }

        // mês: últimos 30 dias
        const today0 = startOfLocalDay();
        const from = new Date(today0.getTime() - (30 - 1) * ONE_DAY);

        const { data, error } = await supabase
          .from("pomodoro_sessions")
          .select("started_at,duration_seconds,phase")
          .eq("user_id", user.id)
          .eq("phase", "study")
          .not("duration_seconds", "is", null)
          .gte("started_at", from.toISOString())
          .order("started_at", { ascending: true });

        if (error) throw error;
        if (!mounted) return;

        const byDay: Record<string, number> = {};
        for (let i = 0; i < 30; i++) {
          const d = new Date(from.getTime() + i * ONE_DAY);
          const key = ymdLocal(d);
          byDay[key] = 0;
        }

        for (const r of data ?? []) {
          const dt = new Date(r.started_at);
          if (Number.isNaN(dt.getTime())) continue;
          const key = ymdLocal(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()));
          const dur = Number(r.duration_seconds ?? 0);
          if (!Number.isFinite(dur)) continue;
          byDay[key] = (byDay[key] ?? 0) + Math.round(Math.max(0, dur) / 60);
        }

        const series: StudyPoint[] = Object.entries(byDay).map(([key, minutos]) => {
          const [yyyy, mm, dd] = key.split("-");
          return { label: `${dd}/${mm}`, minutos };
        });

        setMiniSeries(series);
      } catch (e: any) {
        // não travar o dashboard por erro de gráfico
        if (!mounted) return;
        setMiniSeries([]);
        setErro((prev) => prev ?? e?.message ?? "Falha ao carregar gráfico.");
      } finally {
        if (!mounted) return;
        setMiniLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [miniRange]);

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

        {/* ESTATÍSTICAS (mais alinhado/compacto) */}
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
                    <div className={`h-11 w-11 rounded-2xl ${c.iconBg} flex items-center justify-center shrink-0`}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase leading-none">
                        {c.label}
                      </div>
                      <div className="mt-1 text-[22px] font-extrabold text-foreground leading-none">
                        {c.value}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground leading-none">
                        {c.sub}
                      </div>
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

        {/* MINI GRÁFICO DE ESTUDO (compacto) */}
        <section className="rounded-2xl bg-card border border-border p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="min-w-0">
              <div className="text-base font-extrabold text-foreground">Estudo</div>
              <div className="text-xs text-muted-foreground">
                {miniRange === "dia" ? "Últimas 24h" : miniRange === "semana" ? "Últimos 7 dias" : "Últimos 30 dias"}
              </div>
            </div>

            {/* botões em 1 linha */}
            <div className="inline-flex rounded-xl border border-border bg-muted p-1 shrink-0">
              {[
                ["dia", "Dia"],
                ["semana", "Semana"],
                ["mes", "Mês"],
              ].map(([k, label]) => {
                const active = miniRange === (k as MiniRange);
                return (
                  <button
                    key={k}
                    onClick={() => setMiniRange(k as MiniRange)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                      }`}
                    disabled={miniLoading}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-44">
            {!miniSeries.length && !miniLoading ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Sem dados no período.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={miniSeries} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="miniFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="label"
                    stroke="var(--muted-foreground)"
                    tick={{ fontSize: 11 }}
                    interval={miniRange === "mes" ? 5 : 0}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    tick={{ fontSize: 11 }}
                    allowDecimals={false}
                    width={30}
                  />
                  <Tooltip
                    formatter={(v: any) => [`${Number(v ?? 0)} min`, "Estudo"]}
                    contentStyle={{
                      background: "var(--muted)",
                      border: "1px solid var(--border)",
                      color: "var(--foreground)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="minutos"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    fill="url(#miniFill)"
                    name="Minutos"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {miniLoading ? (
            <div className="mt-2 text-xs text-muted-foreground">Carregando gráfico…</div>
          ) : null}
        </section>
      </div>
    </main>
  );
}