"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock, Flag, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { rotuloBanca } from "@/lib/rotulos";

type QuestaoSim = {
    id: string;
    disciplina: string | null;
    assunto: string | null;
    banca: string | null;
    modalidade: string | null;
    enunciado: string;
    alternativas: Record<string, string> | null;
    correta: string | null; // só vem depois de finalizado
};

type DadosSimulado = {
    simulado: {
        id: string;
        titulo: string;
        total: number;
        duracao_seg: number;
        iniciado_em: string;
        expira_em: string;
        finalizado_em: string | null;
        respostas: Record<string, string>;
        agora: string;
    };
    questoes: QuestaoSim[];
};

type Resultado = {
    titulo: string;
    total: number;
    acertos: number;
    erros: number;
    brancos: number;
    nota: number;
    nota_liquida: number | null;
    tempo_seg: number;
    participantes: number;
    percentil: number | null;
    disciplinas: { disciplina: string; total: number; acertos: number }[];
};

function relogio(seg: number) {
    const s = Math.max(0, Math.floor(seg));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return (h ? `${h}:${String(m).padStart(2, "0")}` : String(m)) + `:${String(ss).padStart(2, "0")}`;
}

function alternativasDe(q: QuestaoSim): [string, string][] {
    const ce = /certo/i.test(q.modalidade ?? "");
    if (ce) return [["C", "Certo"], ["E", "Errado"]];
    return Object.entries(q.alternativas ?? {}).sort(([a], [b]) => a.localeCompare(b));
}

export default function SimuladoPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [dados, setDados] = useState<DadosSimulado | null>(null);
    const [resultado, setResultado] = useState<Resultado | null>(null);
    const [erro, setErro] = useState("");
    const [erroEntrega, setErroEntrega] = useState("");
    const [respostas, setRespostas] = useState<Record<string, string>>({});
    const [atual, setAtual] = useState(0);
    const [restante, setRestante] = useState<number | null>(null);
    const [entregando, setEntregando] = useState(false);
    const offset = useRef(0); // relógio do servidor − relógio do aparelho
    const sujo = useRef(false);
    const respostasRef = useRef(respostas);
    respostasRef.current = respostas;

    const carregar = useCallback(async () => {
        const { data, error } = await supabase.rpc("questoes_do_simulado", { p_id: id });
        if (error || !data) {
            setErro(error?.message || "Simulado não encontrado.");
            return;
        }
        const d = data as DadosSimulado;
        offset.current = new Date(d.simulado.agora).getTime() - Date.now();
        setDados(d);
        setRespostas(d.simulado.respostas ?? {});
        if (d.simulado.finalizado_em) {
            const r = await supabase.rpc("resultado_simulado", { p_id: id });
            if (r.error || !r.data) {
                setErro("Não foi possível carregar o resultado agora. Atualize a página em instantes.");
                return;
            }
            setResultado(r.data as Resultado);
        }
    }, [id]);

    useEffect(() => {
        carregar();
    }, [carregar]);

    const finalizar = useCallback(async () => {
        setEntregando(true);
        setErroEntrega("");
        const { data, error } = await supabase.rpc("finalizar_simulado", { p_id: id, p_respostas: respostasRef.current });
        if (error) {
            // Não troca a prova por uma tela de erro: as respostas continuam aqui para tentar de novo.
            setErroEntrega("Não foi possível entregar agora. Verifique sua internet e toque em \"Tentar de novo\".");
            setEntregando(false);
            return;
        }
        setResultado(data as Resultado);
        await carregar(); // traz o gabarito para a revisão
        setEntregando(false);
        window.scrollTo({ top: 0 });
    }, [id, carregar]);

    // Cronômetro pelo relógio do servidor. Acabou o tempo: entrega sozinho.
    useEffect(() => {
        if (!dados || dados.simulado.finalizado_em) return;
        const fim = new Date(dados.simulado.expira_em).getTime();
        const tick = () => {
            const r = (fim - (Date.now() + offset.current)) / 1000;
            setRestante(r);
            if (r <= 0) {
                clearInterval(t);
                finalizar();
            }
        };
        const t = setInterval(tick, 1000);
        tick();
        return () => clearInterval(t);
    }, [dados, finalizar]);

    // Salva as respostas no banco a cada 5 s (se mudaram), para não perder se a aba fechar.
    useEffect(() => {
        if (!dados || dados.simulado.finalizado_em) return;
        const t = setInterval(() => {
            if (!sujo.current) return;
            sujo.current = false;
            supabase.rpc("salvar_respostas_simulado", { p_id: id, p_respostas: respostasRef.current }).then(({ error }) => {
                if (error) sujo.current = true;
            });
        }, 5000);
        return () => clearInterval(t);
    }, [dados, id]);

    // Avisa antes de sair no meio da prova.
    useEffect(() => {
        if (!dados || dados.simulado.finalizado_em) return;
        const h = (e: BeforeUnloadEvent) => {
            e.preventDefault();
        };
        window.addEventListener("beforeunload", h);
        return () => window.removeEventListener("beforeunload", h);
    }, [dados]);

    const respondidas = useMemo(() => Object.keys(respostas).length, [respostas]);

    function responder(qid: string, letra: string) {
        sujo.current = true;
        setRespostas((r) => {
            const novo = { ...r };
            if (novo[qid] === letra) delete novo[qid]; // clicar de novo desmarca
            else novo[qid] = letra;
            return novo;
        });
    }

    async function entregar() {
        const brancos = (dados?.simulado.total ?? 0) - respondidas;
        if (brancos > 0 && !confirm(`Você deixou ${brancos} em branco. Entregar mesmo assim?`)) return;
        await finalizar();
    }

    if (erro) {
        return (
            <div className="w-full py-10">
                <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">{erro}</p>
                <Link href="/simulados" className="mt-4 inline-block text-sm text-primary underline">Voltar aos simulados</Link>
            </div>
        );
    }
    if (!dados) return <div className="px-4 py-10 text-center text-muted-foreground">Carregando simulado…</div>;

    // ======================== RESULTADO ========================
    if (dados.simulado.finalizado_em) {
        return <ResultadoView dados={dados} resultado={resultado} />;
    }

    // ======================== PROVA ========================
    const q = dados.questoes[atual];
    const pouco = restante !== null && restante < 300;

    return (
        <div className="w-full pb-24">
            <div className="flex w-full flex-col gap-4">
                {erroEntrega && (
                    <div role="alert" className="flex flex-col gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300 sm:flex-row sm:items-center sm:justify-between">
                        <span>{erroEntrega}</span>
                        <button type="button" onClick={finalizar} disabled={entregando} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">
                            {entregando ? "Enviando…" : "Tentar de novo"}
                        </button>
                    </div>
                )}
                <div className="sticky top-0 z-20 flex items-center justify-between gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-sm backdrop-blur">
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">{dados.simulado.titulo}</div>
                        <div className="text-xs text-muted-foreground">{respondidas}/{dados.simulado.total} respondidas</div>
                    </div>
                    <div className={`flex items-center gap-2 rounded-md px-3 py-1.5 font-mono text-lg font-bold ${pouco ? "bg-red-500/15 text-red-600 dark:text-red-400" : "bg-muted text-foreground"}`} aria-live="polite">
                        <Clock className="h-4 w-4" aria-hidden /> {restante === null ? "--:--" : relogio(restante)}
                    </div>
                    <button
                        type="button"
                        onClick={entregar}
                        disabled={entregando}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
                    >
                        <Flag className="h-4 w-4" aria-hidden /> {entregando ? "Corrigindo…" : "Entregar"}
                    </button>
                </div>

                {/* Mapa da prova */}
                <nav aria-label="Questões do simulado" className="flex flex-wrap gap-1.5">
                    {dados.questoes.map((qq, i) => (
                        <button
                            key={qq.id}
                            type="button"
                            onClick={() => setAtual(i)}
                            aria-current={i === atual}
                            className={`h-8 w-8 rounded-md text-xs font-semibold transition ${
                                i === atual
                                    ? "bg-primary text-primary-foreground"
                                    : respostas[qq.id]
                                        ? "border border-primary/50 bg-primary/15 text-foreground"
                                        : "border border-border bg-card text-muted-foreground hover:bg-muted"
                            }`}
                        >
                            {i + 1}
                        </button>
                    ))}
                </nav>

                <article className="rounded-lg border border-border border-l-4 border-l-primary bg-card p-5 shadow-sm sm:p-7">
                    <div className="mb-3 flex flex-wrap gap-2 text-xs">
                        <span className="rounded bg-accent px-2 py-1 font-semibold text-accent-foreground">Questão {atual + 1}</span>
                        {q.disciplina && <span className="rounded bg-accent px-2 py-1 text-accent-foreground">{q.disciplina}</span>}
                        {q.banca && <span className="rounded bg-accent px-2 py-1 text-accent-foreground">{rotuloBanca(q.banca)}</span>}
                    </div>
                    <p className="mb-5 whitespace-pre-line text-base font-medium leading-relaxed text-foreground sm:text-[17px]">{q.enunciado}</p>
                    <div className="flex flex-col gap-2">
                        {alternativasDe(q).map(([letra, texto]) => {
                            const marcada = respostas[q.id] === letra;
                            return (
                                <button
                                    key={letra}
                                    type="button"
                                    onClick={() => responder(q.id, letra)}
                                    className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-left text-[15px] transition ${marcada ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted"}`}
                                >
                                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${marcada ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                                        {letra}
                                    </span>
                                    <span className="pt-0.5 text-foreground">{texto}</span>
                                </button>
                            );
                        })}
                    </div>
                </article>

                <div className="flex justify-between">
                    <button type="button" onClick={() => setAtual((a) => Math.max(0, a - 1))} disabled={atual === 0} className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold disabled:opacity-40">
                        <ChevronLeft className="h-4 w-4" /> Anterior
                    </button>
                    {atual < dados.questoes.length - 1 ? (
                        <button type="button" onClick={() => setAtual((a) => a + 1)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                            Próxima <ChevronRight className="h-4 w-4" />
                        </button>
                    ) : (
                        <button type="button" onClick={entregar} disabled={entregando} className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                            <Flag className="h-4 w-4" /> Entregar prova
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

function ResultadoView({ dados, resultado }: { dados: DadosSimulado; resultado: Resultado | null }) {
    const [soErros, setSoErros] = useState(false);
    if (!resultado) return <div className="px-4 py-10 text-center text-muted-foreground">Calculando resultado…</div>;

    const respostas = dados.simulado.respostas ?? {};
    const nota = Number(resultado.nota);
    const corNota = nota >= 70 ? "text-emerald-600 dark:text-emerald-400" : nota >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
    const questoes = dados.questoes.filter((q) => !soErros || respostas[q.id] !== q.correta);

    return (
        <div className="w-full">
            <div className="flex w-full flex-col gap-6">
                <Link href="/simulados" className="text-sm text-muted-foreground underline">← Simulados</Link>

                <section className="relative overflow-hidden rounded-lg border border-border bg-card p-6 shadow-sm">
                    <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-primary" />
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{resultado.titulo}</div>
                    <div className="mt-2 flex flex-wrap items-end gap-x-8 gap-y-3">
                        <div>
                            <div className={`font-titulo text-6xl font-extrabold ${corNota}`}>{nota.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</div>
                            <div className="text-sm text-muted-foreground">de acerto</div>
                        </div>
                        <dl className="grid grid-cols-3 gap-6 text-center">
                            <div><dt className="text-xs uppercase text-muted-foreground">Acertos</dt><dd className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{resultado.acertos}</dd></div>
                            <div><dt className="text-xs uppercase text-muted-foreground">Erros</dt><dd className="text-2xl font-bold text-red-600 dark:text-red-400">{resultado.erros}</dd></div>
                            <div><dt className="text-xs uppercase text-muted-foreground">Em branco</dt><dd className="text-2xl font-bold text-foreground">{resultado.brancos}</dd></div>
                        </dl>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                        <span>Tempo: <strong className="text-foreground">{relogio(resultado.tempo_seg)}</strong> de {relogio(dados.simulado.duracao_seg)}</span>
                        {resultado.nota_liquida !== null && (
                            <span title="No estilo Cebraspe, cada erro anula um acerto.">
                                Nota líquida (Cebraspe): <strong className="text-foreground">{resultado.nota_liquida}</strong>
                            </span>
                        )}
                    </div>
                    <div className="mt-4 flex items-center gap-3 rounded-md bg-primary/10 px-4 py-3 text-sm text-foreground">
                        <Trophy className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                        {resultado.percentil !== null && resultado.participantes >= 5 ? (
                            <span>
                                Você foi melhor que <strong>{resultado.percentil}%</strong> dos {resultado.participantes} simulados desse tipo feitos na plataforma.
                            </span>
                        ) : (
                            <span>Comparação com outros alunos aparece quando houver pelo menos 5 simulados desse tipo ({resultado.participantes} até agora).</span>
                        )}
                    </div>
                </section>

                <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
                    <h2 className="mb-3 font-titulo text-lg font-bold uppercase tracking-wide text-foreground">Por disciplina</h2>
                    <div className="flex flex-col gap-3">
                        {resultado.disciplinas.map((d) => {
                            const pct = d.total ? Math.round((100 * d.acertos) / d.total) : 0;
                            return (
                                <div key={d.disciplina}>
                                    <div className="mb-1 flex justify-between text-sm">
                                        <span className="text-foreground">{d.disciplina}</span>
                                        <span className="text-muted-foreground">{d.acertos}/{d.total} • {pct}%</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-muted">
                                        <div className={`h-2 rounded-full ${pct >= 70 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>

                <section className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <h2 className="font-titulo text-lg font-bold uppercase tracking-wide text-foreground">Correção</h2>
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input type="checkbox" checked={soErros} onChange={(e) => setSoErros(e.target.checked)} /> Só erros e brancos
                        </label>
                    </div>
                    {questoes.map((q) => {
                        const idx = dados.questoes.indexOf(q);
                        const marcada = respostas[q.id];
                        const acertou = marcada === q.correta;
                        return (
                            <article key={q.id} className={`rounded-lg border bg-card p-4 ${acertou ? "border-emerald-500/40" : "border-red-500/40"}`}>
                                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                                    <span className={`rounded px-2 py-0.5 font-semibold ${acertou ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-red-500/15 text-red-700 dark:text-red-300"}`}>
                                        {idx + 1}. {acertou ? "Acertou" : marcada ? "Errou" : "Em branco"}
                                    </span>
                                    <span className="text-muted-foreground">{q.disciplina}</span>
                                </div>
                                <p className="mb-3 whitespace-pre-line text-sm leading-relaxed text-foreground">{q.enunciado}</p>
                                <ul className="flex flex-col gap-1 text-sm">
                                    {alternativasDe(q).map(([letra, texto]) => (
                                        <li
                                            key={letra}
                                            className={`rounded-md px-3 py-1.5 ${
                                                letra === q.correta
                                                    ? "bg-emerald-500/15 font-semibold text-emerald-700 dark:text-emerald-300"
                                                    : letra === marcada
                                                        ? "bg-red-500/15 text-red-700 line-through dark:text-red-300"
                                                        : "text-muted-foreground"
                                            }`}
                                        >
                                            {letra}) {texto}
                                        </li>
                                    ))}
                                </ul>
                            </article>
                        );
                    })}
                </section>
            </div>
        </div>
    );
}
