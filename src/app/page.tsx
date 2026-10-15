"use client";

/**
 * Painel do aluno.
 *
 * Ordem: saudação → Missão do dia → atalhos → Sua meta → números → Primeiros passos.
 * O cronômetro fica só na página Tempo de estudo. O tempo do dia já inclui o
 * tempo contado sozinho em questões, simulados, revisão e caderno de erros.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowUpRight,
    BarChart2,
    Brain,
    CheckCircle2,
    Clock,
    FileText,
    Flame,
    History,
    Layers3,
    NotebookText,
    Target,
    Timer,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { usePerfilAluno } from "@/lib/perfilAluno";
import { todasAsLinhas } from "@/lib/todasAsLinhas";
import { Carregando } from "@/components/app/Carregando";
import { CartaoMeta } from "@/components/painel/CartaoMeta";
import { BoasVindas } from "@/components/painel/BoasVindas";

const DIA_MS = 24 * 60 * 60 * 1000;

/** Metas do dia: alcançáveis por qualquer aluno, inclusive quem acabou de entrar. */
const META = { questoes: 20, estudoMin: 30 } as const;

type Sessao = { started_at: string; duration_seconds: number | null };
type Progresso = { item_id: string; method: string; last_reviewed_at: string | null; next_review: string | null };

function inicioDoDia(t = Date.now()) {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d;
}

function ymd(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function duracao(seg: number) {
    const s = Math.max(0, Math.round(seg));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h) return `${h}h ${m}min`;
    if (m) return `${m}min`;
    return s ? `${s}s` : "0min";
}

const pct = (v: number, alvo: number) => (alvo <= 0 ? 100 : Math.max(0, Math.min(100, (v / alvo) * 100)));

export default function Painel() {
    const router = useRouter();
    const { perfil, carregando: carregandoPerfil, erro: erroPerfil, recarregar: recarregarPerfil } = usePerfilAluno();

    const [carregando, setCarregando] = useState(true);
    const [nome, setNome] = useState("");
    const [userId, setUserId] = useState("");

    const [questoesTotal, setQuestoesTotal] = useState(0);
    const [taxaAcerto, setTaxaAcerto] = useState(0);
    const [questoesHoje, setQuestoesHoje] = useState(0);
    const [estudoHojeSeg, setEstudoHojeSeg] = useState(0);
    const [estudo7dSeg, setEstudo7dSeg] = useState(0);
    const [sequencia, setSequencia] = useState(0);
    const [revisoesPendentes, setRevisoesPendentes] = useState(0);
    const [revisoesFeitasHoje, setRevisoesFeitasHoje] = useState(0);
    const [errosParaRefazer, setErrosParaRefazer] = useState(0);
    const [totalFlashcards, setTotalFlashcards] = useState(0);
    const [totalResumos, setTotalResumos] = useState(0);

    useEffect(() => {
        let ativo = true;
        (async () => {
            const { data, error } = await supabase.auth.getUser();
            if (!ativo) return;
            if (error || !data?.user?.id) {
                router.replace("/auth");
                return;
            }
            const meta = data.user.user_metadata ?? {};
            const bruto = String(meta.nome || meta.full_name || meta.name || (data.user.email ?? "").split("@")[0] || "");
            setNome(bruto.replace(/\s+/g, " ").trim().slice(0, 60));
            setUserId(data.user.id);

            const uid = data.user.id;
            const hoje = inicioDoDia();
            const amanha = new Date(hoje.getTime() + DIA_MS);
            const desde120 = new Date(hoje.getTime() - 120 * DIA_MS);
            const desde7 = new Date(hoje.getTime() - 6 * DIA_MS);

            try {
                const [est, tentHoje, sessoes, tentativas, progresso, eventos, cadernos, flash, res] = await Promise.all([
                    supabase.from("estatisticas").select("questoes_respondidas,taxa_acerto").eq("user_id", uid).maybeSingle(),
                    supabase
                        .from("question_attempts")
                        .select("questao_id", { count: "exact", head: true })
                        .eq("user_id", uid)
                        .gte("created_at", hoje.toISOString())
                        .lt("created_at", amanha.toISOString()),
                    todasAsLinhas<Sessao>(
                        supabase
                            .from("study_sessions")
                            .select("started_at,duration_seconds")
                            .eq("user_id", uid)
                            .not("duration_seconds", "is", null)
                            .not("ended_at", "is", null)
                            .gte("started_at", desde120.toISOString())
                            .order("started_at", { ascending: false })
                    ),
                    supabase
                        .from("question_attempts")
                        .select("created_at")
                        .eq("user_id", uid)
                        .gte("created_at", desde120.toISOString())
                        .order("created_at", { ascending: false })
                        .limit(1000),
                    supabase.from("review_progress").select("item_id,method,last_reviewed_at,next_review").eq("user_id", uid),
                    supabase
                        .from("gamification_events")
                        .select("source_id")
                        .eq("user_id", uid)
                        .eq("event_type", "REVIEW_COMPLETED")
                        .gte("occurred_at", hoje.toISOString())
                        .lt("occurred_at", amanha.toISOString()),
                    supabase.rpc("resumo_cadernos"),
                    supabase.from("flashcards").select("id", { count: "exact", head: true }).eq("user_id", uid),
                    supabase.from("resumos").select("id", { count: "exact", head: true }).eq("user_id", uid),
                ]);
                if (!ativo) return;

                setQuestoesTotal(Number(est.data?.questoes_respondidas ?? 0) || 0);
                setTaxaAcerto(Math.round(Number(est.data?.taxa_acerto ?? 0) || 0));
                setQuestoesHoje(tentHoje.count ?? 0);
                setTotalFlashcards(flash.count ?? 0);
                setTotalResumos(res.count ?? 0);
                setErrosParaRefazer(Number((cadernos.data as any)?.erros_ativos ?? 0) || 0);

                // Tempo de estudo (cronômetro + contagem automática) e sequência de dias.
                const porDia = new Map<string, number>();
                let hojeSeg = 0;
                let seteDiasSeg = 0;
                for (const s of sessoes.data ?? []) {
                    const ini = new Date(s.started_at);
                    const seg = Math.max(0, Number(s.duration_seconds ?? 0));
                    if (Number.isNaN(ini.getTime())) continue;
                    const chave = ymd(ini);
                    porDia.set(chave, (porDia.get(chave) ?? 0) + seg);
                    if (ini >= hoje) hojeSeg += seg;
                    if (ini >= desde7) seteDiasSeg += seg;
                }
                for (const t of (tentativas.data ?? []) as { created_at: string }[]) {
                    const d = new Date(t.created_at);
                    if (!Number.isNaN(d.getTime())) porDia.set(ymd(d), (porDia.get(ymd(d)) ?? 0) + 1);
                }
                setEstudoHojeSeg(hojeSeg);
                setEstudo7dSeg(seteDiasSeg);

                // Dia sem estudo ainda não zera a sequência: conta a partir de ontem.
                let seq = 0;
                const base = hoje.getTime();
                const comecaHoje = (porDia.get(ymd(hoje)) ?? 0) > 0;
                for (let i = comecaHoje ? 0 : 1; i < 121; i++) {
                    if ((porDia.get(ymd(new Date(base - i * DIA_MS))) ?? 0) > 0) seq += 1;
                    else break;
                }
                setSequencia(seq);

                // Revisões: pendentes até hoje e feitas hoje.
                const linhas = (progresso.data ?? []) as Progresso[];
                const hojeYmd = ymd(hoje);
                setRevisoesPendentes(linhas.filter((r) => r.next_review && String(r.next_review).slice(0, 10) <= hojeYmd).length);
                const feitas = !eventos.error
                    ? (eventos.data ?? []).length
                    : linhas.filter((r) => r.last_reviewed_at && new Date(r.last_reviewed_at) >= hoje).length;
                setRevisoesFeitasHoje(feitas);
            } catch {
                // Falha de rede: mostra o painel com o que houver.
            } finally {
                if (ativo) setCarregando(false);
            }
        })();
        return () => {
            ativo = false;
        };
    }, [router]);

    // Primeiro acesso (nunca escolheu meta nem pulou): leva para a escolha do concurso.
    const precisaEscolherMeta = !!userId && !carregandoPerfil && !perfil && !erroPerfil;
    useEffect(() => {
        if (precisaEscolherMeta) router.replace("/meta?primeiro=1");
    }, [precisaEscolherMeta, router]);

    const missao = useMemo(() => {
        const alvoRevisoes = revisoesPendentes + revisoesFeitasHoje;
        const itens = [
            {
                label: "Questões",
                detalhe: `${Math.min(questoesHoje, META.questoes)} / ${META.questoes}`,
                progresso: pct(questoesHoje, META.questoes),
                href: "/questoes",
                icon: Brain,
            },
            {
                label: "Revisões do dia",
                detalhe: alvoRevisoes ? `${revisoesFeitasHoje} / ${alvoRevisoes}` : "Nada pendente hoje",
                progresso: pct(revisoesFeitasHoje, alvoRevisoes),
                href: "/revisao",
                icon: History,
            },
            {
                label: "Tempo de estudo",
                detalhe: `${duracao(Math.min(estudoHojeSeg, META.estudoMin * 60))} / ${META.estudoMin}min`,
                progresso: pct(estudoHojeSeg, META.estudoMin * 60),
                href: "/tempo-de-estudo",
                icon: Clock,
            },
        ];
        const total = Math.round(itens.reduce((a, i) => a + i.progresso, 0) / itens.length);
        const concluidas = itens.filter((i) => i.progresso >= 100).length;
        return { itens, total, concluidas };
    }, [questoesHoje, revisoesPendentes, revisoesFeitasHoje, estudoHojeSeg]);

    const atalhos = [
        { nome: "Resolver questões", sub: `${questoesHoje} hoje`, href: "/questoes", icon: Brain },
        { nome: "Revisão", sub: `${revisoesPendentes} para hoje • ${revisoesFeitasHoje} feitas`, href: "/revisao", icon: History },
        { nome: "Cadernos", sub: errosParaRefazer ? `${errosParaRefazer} ${errosParaRefazer === 1 ? "erro" : "erros"} para refazer` : "Nenhum erro pendente", href: "/cadernos", icon: NotebookText },
        { nome: "Simulados", sub: "Prova cronometrada", href: "/simulados", icon: Timer },
        { nome: "Flashcards", sub: `${totalFlashcards} salvos`, href: "/flashcards", icon: Layers3 },
        { nome: "Resumos", sub: `${totalResumos} salvos`, href: "/resumos", icon: FileText },
    ];

    const numeros = [
        { label: "Questões", valor: questoesTotal.toLocaleString("pt-BR"), sub: "Respondidas", icon: BarChart2 },
        { label: "Acerto", valor: `${taxaAcerto}%`, sub: "Média geral", icon: Target },
        { label: "Estudo", valor: duracao(estudo7dSeg), sub: "Últimos 7 dias", icon: Clock },
        { label: "Sequência", valor: String(sequencia), sub: sequencia === 1 ? "Dia" : "Dias", icon: Flame },
    ];

    if (carregando) return <Carregando />;

    const diaConcluido = missao.concluidas === missao.itens.length;

    return (
        <div className="w-full">
            <div className="flex w-full flex-col gap-6">
                <div className="border-b border-border pb-5">
                    <h1 className="text-3xl font-extrabold text-foreground">Olá{nome ? `, ${nome}` : ""}.</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Cada questão resolvida te deixa mais perto da farda.</p>
                </div>

                {/* MISSÃO DO DIA */}
                <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="flex items-center gap-2">
                                <Target className="h-5 w-5 text-primary" aria-hidden />
                                <h2 className="font-titulo text-lg font-bold uppercase tracking-wide text-foreground">Missão do dia</h2>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {META.questoes} questões • suas revisões do dia • {META.estudoMin} minutos de estudo
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {diaConcluido ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                    <CheckCircle2 className="h-4 w-4" aria-hidden /> Dia concluído
                                </span>
                            ) : (
                                <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                                    {missao.concluidas}/{missao.itens.length} metas concluídas
                                </span>
                            )}
                            <span className="text-sm font-extrabold text-foreground">{missao.total}%</span>
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                        {missao.itens.map((m) => {
                            const Icon = m.icon;
                            const feito = m.progresso >= 100;
                            return (
                                <Link key={m.label} href={m.href} className="rounded-xl border border-border bg-background p-4 transition hover:bg-muted/40">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${feito ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-primary/10 text-primary"}`}>
                                                {feito ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <Icon className="h-5 w-5" aria-hidden />}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-semibold text-foreground">{m.label}</div>
                                                <div className="mt-0.5 text-xs text-muted-foreground">{m.detalhe}</div>
                                            </div>
                                        </div>
                                        <span className={`text-sm font-extrabold ${feito ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>
                                            {Math.round(m.progresso)}%
                                        </span>
                                    </div>
                                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                                        <div className={`h-full rounded-full transition-all ${feito ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${m.progresso}%` }} />
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </section>

                {/* ATALHOS */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                    {atalhos.map((a) => {
                        const Icon = a.icon;
                        return (
                            <Link
                                key={a.href}
                                href={a.href}
                                className="group relative overflow-hidden rounded-lg border border-border bg-card p-4 shadow-sm transition hover:border-primary/70 active:scale-[0.99]"
                            >
                                <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-primary/40 transition group-hover:bg-primary" />
                                <div className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                                    <Icon className="h-5 w-5 text-primary" aria-hidden />
                                </div>
                                <div className="mt-10">
                                    <div className="font-titulo text-lg font-bold uppercase leading-tight tracking-wide text-foreground">{a.nome}</div>
                                    <div className="mt-1 text-xs text-muted-foreground">{a.sub}</div>
                                </div>
                            </Link>
                        );
                    })}
                </div>

                {!carregandoPerfil && !erroPerfil && <CartaoMeta temMeta={!!perfil?.meta_instituicao} />}

                {/* NÚMEROS */}
                <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-base font-extrabold text-foreground">Seus números</div>
                            <div className="text-xs text-muted-foreground">Resumo rápido</div>
                        </div>
                        <Link
                            href="/estatisticas"
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-muted/70"
                        >
                            Detalhes <ArrowUpRight className="h-4 w-4" aria-hidden />
                        </Link>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {numeros.map((n) => {
                            const Icon = n.icon;
                            return (
                                <div key={n.label} className="rounded-xl border border-border bg-background px-3.5 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary/10">
                                            <Icon className="h-5 w-5 text-primary" aria-hidden />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-[11px] font-bold uppercase leading-none tracking-wide text-muted-foreground">{n.label}</div>
                                            <div className="mt-1 text-[22px] font-extrabold leading-none text-foreground">{n.valor}</div>
                                            <div className="mt-1 text-[11px] leading-none text-muted-foreground">{n.sub}</div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <p className="mt-3 text-[11px] text-muted-foreground">
                        Estudo inclui o tempo contado sozinho em questões, simulados, revisões e caderno de erros, mais o cronômetro.
                        Sequência: dias seguidos com estudo ou questões resolvidas.
                    </p>
                </section>

                {!carregandoPerfil && !erroPerfil && <BoasVindas perfil={perfil} aoOcultar={recarregarPerfil} />}
            </div>
        </div>
    );
}
