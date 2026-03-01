"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { QuestionCard } from "@/components/QuestionCard"; // ajuste path
import { Pagination } from "@/components/Pagination";     // ajuste path

/* ===================== Icons ===================== */
function BookIcon({ className = "" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
            <path
                d="M6 4h10a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2V6a2 2 0 0 1 2-2Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
            />
            <path d="M8 7h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}
function XIcon({ className = "" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
            <path d="M15 9 9 15M9 9l6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
    );
}
function CheckIcon({ className = "" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
            <path
                d="M20 7 10 17l-4-4"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
function ArrowRightIcon({ className = "" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
            <path d="M5 12h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <path d="m13 6 6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
    );
}
function ArrowLeftIcon({ className = "" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
            <path d="M19 12H7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <path
                d="m11 6-6 6 6 6"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
function GridIcon({ active }: { active: boolean }) {
    return (
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${active ? "bg-white border-border" : "bg-muted border-border"}`}>
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" stroke="currentColor" strokeWidth="2" />
            </svg>
        </div>
    );
}
function ListIcon({ active }: { active: boolean }) {
    return (
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${active ? "bg-white border-border" : "bg-muted border-border"}`}>
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
        </div>
    );
}

/* ===================== Types ===================== */
type CadernoTipo = "ERROS" | "ACERTOS";
type ViewMode = "grid" | "list";

type ResumoTipo = { tipo: CadernoTipo; disciplinas: number; questoes: number; anotadas: number; };

type DisciplinaResumo = { tipo: CadernoTipo; disciplina: string; questoes: number; anotadas: number; };
type AssuntoResumo = { tipo: CadernoTipo; disciplina: string; assunto: string; questoes: number; anotadas: number; };

type Questao = {
    id: string;
    instituicao: string;
    cargo: string;
    disciplina: string;
    assunto: string;
    modalidade: string;
    banca: string;
    enunciado: string;
    alternativas: { [key: string]: string };
    correta: string;
    explicacao: string;
    comentarios?: any[];
    erros?: any[];
    created_at?: string;
};

type ItemLeve = {
    tipo: CadernoTipo;
    anotacao: string | null;
    questao: { disciplina: string | null; assunto: string | null }[]; // join vem como array
};

type ItemQuestao = {
    questao: Questao[]; // join vem como array
};

/* ===================== Helpers ===================== */
function pct(anotadas: number, questoes: number) {
    if (!questoes) return 0;
    return Math.round((anotadas / questoes) * 100);
}

/* ===================== Page ===================== */
export default function CadernosPageGeral() {
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string>("");
    const [userId, setUserId] = useState<string | null>(null);

    // Navegação dentro da única página (passos)
    const [step, setStep] = useState<"home" | "disciplinas" | "assuntos" | "questoes">("home");
    const [tipoSelecionado, setTipoSelecionado] = useState<CadernoTipo | null>(null);
    const [disciplinaSelecionada, setDisciplinaSelecionada] = useState<string | null>(null);
    const [assuntoSelecionado, setAssuntoSelecionado] = useState<string | null>(null);

    // toggle grid/list
    const [mode, setMode] = useState<ViewMode>("grid");

    // resumo topo
    const [resumos, setResumos] = useState<Record<CadernoTipo, ResumoTipo>>({
        ERROS: { tipo: "ERROS", disciplinas: 0, questoes: 0, anotadas: 0 },
        ACERTOS: { tipo: "ACERTOS", disciplinas: 0, questoes: 0, anotadas: 0 },
    });
    const [topErros, setTopErros] = useState<DisciplinaResumo[]>([]);
    const [topAcertos, setTopAcertos] = useState<DisciplinaResumo[]>([]);

    // lista disciplinas/assuntos (calculadas do “item leve”)
    const [disciplinas, setDisciplinas] = useState<DisciplinaResumo[]>([]);
    const [assuntos, setAssuntos] = useState<AssuntoResumo[]>([]);

    // questões (buscadas só no final)
    const [questoes, setQuestoes] = useState<Questao[]>([]);
    const [qLoading, setQLoading] = useState(false);

    // paginação das questões
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(3);

    // ===================== 1) Auth + Load leve (1 consulta) =====================
    useEffect(() => {
        let mounted = true;

        (async () => {
            setLoading(true);
            setErro("");

            const { data: auth, error: authErr } = await supabase.auth.getUser();
            const uid = auth?.user?.id ?? null;

            if (!mounted) return;

            if (authErr || !uid) {
                setUserId(null);
                setLoading(false);
                return;
            }

            setUserId(uid);

            try {
                // ✅ LEVE: só tipo + anotacao + disciplina/assunto
                const { data, error } = await supabase
                    .from("caderno_itens")
                    .select("tipo, anotacao, questao:questoes(disciplina, assunto)")
                    .eq("user_id", uid);

                if (error) throw error;

                const rows = (data ?? []) as unknown as ItemLeve[];

                // agrega tudo em memória (rápido)
                const byTipo: Record<CadernoTipo, { questoes: number; anotadas: number; disciplinasSet: Set<string> }> = {
                    ERROS: { questoes: 0, anotadas: 0, disciplinasSet: new Set() },
                    ACERTOS: { questoes: 0, anotadas: 0, disciplinasSet: new Set() },
                };

                const byTipoDisciplina: Record<CadernoTipo, Record<string, { questoes: number; anotadas: number }>> = {
                    ERROS: {},
                    ACERTOS: {},
                };

                // também guardamos assunto por disciplina por tipo
                const byTipoDisciplinaAssunto: Record<CadernoTipo, Record<string, Record<string, { questoes: number; anotadas: number }>>> = {
                    ERROS: {},
                    ACERTOS: {},
                };

                for (const r of rows) {
                    const tipo = (r.tipo as CadernoTipo) || "ERROS";
                    const q = r.questao?.[0];
                    const disciplina = (q?.disciplina as string) || "Sem disciplina";
                    const assunto = (q?.assunto as string) || "Sem assunto";
                    const anotada = !!(r.anotacao && String(r.anotacao).trim().length > 0);

                    byTipo[tipo].questoes += 1;
                    if (anotada) byTipo[tipo].anotadas += 1;
                    byTipo[tipo].disciplinasSet.add(disciplina);

                    if (!byTipoDisciplina[tipo][disciplina]) byTipoDisciplina[tipo][disciplina] = { questoes: 0, anotadas: 0 };
                    byTipoDisciplina[tipo][disciplina].questoes += 1;
                    if (anotada) byTipoDisciplina[tipo][disciplina].anotadas += 1;

                    if (!byTipoDisciplinaAssunto[tipo][disciplina]) byTipoDisciplinaAssunto[tipo][disciplina] = {};
                    if (!byTipoDisciplinaAssunto[tipo][disciplina][assunto]) byTipoDisciplinaAssunto[tipo][disciplina][assunto] = { questoes: 0, anotadas: 0 };
                    byTipoDisciplinaAssunto[tipo][disciplina][assunto].questoes += 1;
                    if (anotada) byTipoDisciplinaAssunto[tipo][disciplina][assunto].anotadas += 1;
                }

                const nextResumos: Record<CadernoTipo, ResumoTipo> = {
                    ERROS: { tipo: "ERROS", questoes: byTipo.ERROS.questoes, anotadas: byTipo.ERROS.anotadas, disciplinas: byTipo.ERROS.disciplinasSet.size },
                    ACERTOS: { tipo: "ACERTOS", questoes: byTipo.ACERTOS.questoes, anotadas: byTipo.ACERTOS.anotadas, disciplinas: byTipo.ACERTOS.disciplinasSet.size },
                };

                const buildTop = (tipo: CadernoTipo) =>
                    Object.entries(byTipoDisciplina[tipo])
                        .map(([disciplina, v]) => ({ tipo, disciplina, questoes: v.questoes, anotadas: v.anotadas }))
                        .sort((a, b) => b.questoes - a.questoes)
                        .slice(0, 4);

                setResumos(nextResumos);
                setTopErros(buildTop("ERROS"));
                setTopAcertos(buildTop("ACERTOS"));

                // guardamos disciplinas/assuntos no estado (para navegar sem refetch pesado)
                // disciplinas por tipo são calculadas ao selecionar tipo
                // assuntos por disciplina/tipo serão calculados ao selecionar disciplina
                // vamos salvar a estrutura bruta num state oculto:
                setCacheAssuntos(byTipoDisciplinaAssunto);
                setCacheDisciplinas(byTipoDisciplina);
            } catch (e: any) {
                setErro(e?.message || "Erro ao carregar cadernos.");
            } finally {
                setLoading(false);
            }
        })();

        return () => { mounted = false; };
    }, []);

    // caches agregados
    const [cacheDisciplinas, setCacheDisciplinas] = useState<Record<CadernoTipo, Record<string, { questoes: number; anotadas: number }>>>({
        ERROS: {},
        ACERTOS: {},
    });
    const [cacheAssuntos, setCacheAssuntos] = useState<Record<CadernoTipo, Record<string, Record<string, { questoes: number; anotadas: number }>>>>({
        ERROS: {},
        ACERTOS: {},
    });

    const errosPct = useMemo(() => pct(resumos.ERROS.anotadas, resumos.ERROS.questoes), [resumos.ERROS]);
    const acertosPct = useMemo(() => pct(resumos.ACERTOS.anotadas, resumos.ACERTOS.questoes), [resumos.ACERTOS]);

    // ===================== 2) Seleciona tipo -> monta disciplinas (sem query pesada) =====================
    function entrarDisciplinas(tipo: CadernoTipo) {
        setTipoSelecionado(tipo);
        setDisciplinaSelecionada(null);
        setAssuntoSelecionado(null);
        setStep("disciplinas");
        setMode("grid");

        const list: DisciplinaResumo[] = Object.entries(cacheDisciplinas[tipo])
            .map(([disciplina, v]) => ({ tipo, disciplina, questoes: v.questoes, anotadas: v.anotadas }))
            .sort((a, b) => b.questoes - a.questoes);

        setDisciplinas(list);
    }

    // ===================== 3) Seleciona disciplina -> monta assuntos (sem query pesada) =====================
    function entrarAssuntos(disciplina: string) {
        if (!tipoSelecionado) return;
        setDisciplinaSelecionada(disciplina);
        setAssuntoSelecionado(null);
        setStep("assuntos");
        setMode("grid");

        const byAssunto = cacheAssuntos[tipoSelecionado]?.[disciplina] ?? {};
        const list: AssuntoResumo[] = Object.entries(byAssunto)
            .map(([assunto, v]) => ({ tipo: tipoSelecionado, disciplina, assunto, questoes: v.questoes, anotadas: v.anotadas }))
            .sort((a, b) => b.questoes - a.questoes);

        setAssuntos(list);
    }

    // ===================== 4) Seleciona assunto -> busca questões completas PAGINADAS (rápido) =====================
    async function entrarQuestoes(assunto: string) {
        if (!tipoSelecionado || !disciplinaSelecionada || !userId) return;

        setAssuntoSelecionado(assunto);
        setStep("questoes");
        setPage(1);
        setQLoading(true);
        setErro("");

        try {
            // ✅ Query ainda “pesada”, porém só no final e paginada depois com range
            // Para pegar as IDs primeiro (leve)
            const { data: idsData, error: idsErr } = await supabase
                .from("caderno_itens")
                .select("questao_id, questao:questoes(disciplina, assunto)")
                .eq("user_id", userId)
                .eq("tipo", tipoSelecionado);

            if (idsErr) throw idsErr;

            const idsRows = (idsData ?? []) as any[];

            const ids = idsRows
                .filter((r) => {
                    const q = r.questao?.[0];
                    return q?.disciplina === disciplinaSelecionada && q?.assunto === assunto;
                })
                .map((r) => r.questao_id as string);

            if (!ids.length) {
                setQuestoes([]);
                return;
            }

            // Agora busca as questões completas dessas IDs (pode ser bastante; ainda assim bem melhor que puxar tudo sempre)
            // Melhor: buscar só as do range da página — vamos fazer isso:
            await carregarPaginaQuestoes(ids, 1, perPage);
            setIdsCache(ids);
        } catch (e: any) {
            setErro(e?.message || "Erro ao carregar questões.");
            setQuestoes([]);
        } finally {
            setQLoading(false);
        }
    }

    // cache das ids do assunto selecionado
    const [idsCache, setIdsCache] = useState<string[]>([]);

    async function carregarPaginaQuestoes(ids: string[], pageNum: number, per: number) {
        const start = (pageNum - 1) * per;
        const end = start + per - 1;
        const slice = ids.slice(start, start + per);

        if (!slice.length) {
            setQuestoes([]);
            return;
        }

        const { data, error } = await supabase
            .from("questoes")
            .select("*")
            .in("id", slice);

        if (error) throw error;

        // mantém a ordem do slice
        const map = new Map((data ?? []).map((q: any) => [q.id, q]));
        const ordered = slice.map((id) => map.get(id)).filter(Boolean) as Questao[];
        setQuestoes(ordered);
    }

    // quando muda pagina/perPage no step questoes
    useEffect(() => {
        if (step !== "questoes") return;
        if (!idsCache.length) return;

        let cancelled = false;
        (async () => {
            try {
                setQLoading(true);
                await carregarPaginaQuestoes(idsCache, page, perPage);
            } catch (e: any) {
                if (!cancelled) setErro(e?.message || "Erro ao paginar questões.");
            } finally {
                if (!cancelled) setQLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [page, perPage]); // eslint-disable-line react-hooks/exhaustive-deps

    // ===================== UI =====================
    const tituloTipo = tipoSelecionado === "ERROS" ? "Erros" : "Acertos";

    return (
        <div className="max-w-6xl mx-auto px-4 py-10">
            {/* Header */}
            <div className="flex items-start gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <BookIcon className="w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-extrabold text-foreground">Meus Cadernos</h1>
                    <p className="text-sm text-muted-foreground">
                        Organize e revise suas questões de forma eficiente
                    </p>
                </div>
            </div>

            {!userId && !loading && (
                <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                    <p className="text-sm text-muted-foreground">Você precisa estar logado para acessar seus cadernos.</p>
                </div>
            )}

            {erro && <div className="mb-6 text-sm text-red-600">{erro}</div>}

            {/* HOME: cards Erros/Acertos */}
            {userId && step === "home" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* ERROS */}
                    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-red-500 flex items-center justify-center text-white">
                                <XIcon className="w-7 h-7" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-foreground">Erros</h2>
                                <p className="text-sm text-muted-foreground">Questões que você errou para revisar</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mt-5">
                            <div className="bg-muted rounded-xl p-4 text-center">
                                <div className="text-xl font-extrabold text-primary">{loading ? "—" : resumos.ERROS.disciplinas}</div>
                                <div className="text-xs text-muted-foreground mt-1">Disciplinas</div>
                            </div>
                            <div className="bg-muted rounded-xl p-4 text-center">
                                <div className="text-xl font-extrabold text-red-500">{loading ? "—" : resumos.ERROS.questoes}</div>
                                <div className="text-xs text-muted-foreground mt-1">Questões</div>
                            </div>
                            <div className="bg-muted rounded-xl p-4 text-center">
                                <div className="text-xl font-extrabold text-emerald-600">{loading ? "—" : resumos.ERROS.anotadas}</div>
                                <div className="text-xs text-muted-foreground mt-1">Anotadas</div>
                            </div>
                        </div>

                        <div className="mt-5">
                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                                <span>Progresso de anotações</span>
                                <span className="text-primary font-semibold">{loading ? "—" : `${errosPct}%`}</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${loading ? 0 : errosPct}%` }} />
                            </div>
                        </div>

                        <div className="mt-6">
                            <button
                                onClick={() => entrarDisciplinas("ERROS")}
                                className="w-full inline-flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 rounded-xl transition"
                            >
                                Ver Disciplinas <ArrowRightIcon className="w-5 h-5" />
                            </button>
                        </div>

                        {topErros.length > 0 && (
                            <div className="mt-6 pt-5 border-t border-border">
                                <div className="text-xs font-semibold text-muted-foreground mb-3">Principais disciplinas</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {topErros.map((d) => (
                                        <div key={d.disciplina} className="bg-muted rounded-xl p-3">
                                            <div className="text-sm font-semibold text-foreground">{d.disciplina}</div>
                                            <div className="text-xs text-muted-foreground mt-1">
                                                {d.questoes} questões • {d.anotadas} anotadas
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ACERTOS */}
                    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center text-white">
                                <CheckIcon className="w-7 h-7" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-foreground">Acertos</h2>
                                <p className="text-sm text-muted-foreground">Questões que você acertou para revisar</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mt-5">
                            <div className="bg-muted rounded-xl p-4 text-center">
                                <div className="text-xl font-extrabold text-primary">{loading ? "—" : resumos.ACERTOS.disciplinas}</div>
                                <div className="text-xs text-muted-foreground mt-1">Disciplinas</div>
                            </div>
                            <div className="bg-muted rounded-xl p-4 text-center">
                                <div className="text-xl font-extrabold text-emerald-600">{loading ? "—" : resumos.ACERTOS.questoes}</div>
                                <div className="text-xs text-muted-foreground mt-1">Questões</div>
                            </div>
                            <div className="bg-muted rounded-xl p-4 text-center">
                                <div className="text-xl font-extrabold text-emerald-600">{loading ? "—" : resumos.ACERTOS.anotadas}</div>
                                <div className="text-xs text-muted-foreground mt-1">Anotadas</div>
                            </div>
                        </div>

                        <div className="mt-5">
                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                                <span>Progresso de anotações</span>
                                <span className="text-primary font-semibold">{loading ? "—" : `${acertosPct}%`}</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${loading ? 0 : acertosPct}%` }} />
                            </div>
                        </div>

                        <div className="mt-6">
                            <button
                                onClick={() => entrarDisciplinas("ACERTOS")}
                                className="w-full inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 rounded-xl transition"
                            >
                                Ver Disciplinas <ArrowRightIcon className="w-5 h-5" />
                            </button>
                        </div>

                        {topAcertos.length > 0 && (
                            <div className="mt-6 pt-5 border-t border-border">
                                <div className="text-xs font-semibold text-muted-foreground mb-3">Principais disciplinas</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {topAcertos.map((d) => (
                                        <div key={d.disciplina} className="bg-muted rounded-xl p-3">
                                            <div className="text-sm font-semibold text-foreground">{d.disciplina}</div>
                                            <div className="text-xs text-muted-foreground mt-1">
                                                {d.questoes} questões • {d.anotadas} anotadas
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Header de navegação nos passos */}
            {userId && step !== "home" && (
                <div className="flex items-start justify-between gap-4 mb-6">
                    <div className="flex items-start gap-3">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white ${tipoSelecionado === "ERROS" ? "bg-red-500" : "bg-emerald-500"}`}>
                            <span className="text-xl font-extrabold">{tipoSelecionado === "ERROS" ? "×" : "✓"}</span>
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <div className="text-xl font-extrabold text-foreground">{tituloTipo}</div>
                                {disciplinaSelecionada && (
                                    <span className="text-xs font-semibold text-muted-foreground bg-muted px-3 py-1 rounded-full border border-border">
                                        {disciplinaSelecionada}
                                    </span>
                                )}
                                {assuntoSelecionado && (
                                    <span className="text-xs font-semibold text-muted-foreground bg-muted px-3 py-1 rounded-full border border-border">
                                        {assuntoSelecionado}
                                    </span>
                                )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                                {step === "disciplinas" && `${disciplinas.length} disciplinas`}
                                {step === "assuntos" && `${assuntos.length} assuntos`}
                                {step === "questoes" && `${idsCache.length} questões`}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {step === "disciplinas" && (
                            <button
                                onClick={() => { setStep("home"); setTipoSelecionado(null); }}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-card hover:bg-muted transition text-sm font-semibold"
                            >
                                <ArrowLeftIcon className="w-5 h-5" /> Voltar
                            </button>
                        )}

                        {step === "assuntos" && (
                            <button
                                onClick={() => { setStep("disciplinas"); setDisciplinaSelecionada(null); setAssuntos([]); }}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-card hover:bg-muted transition text-sm font-semibold"
                            >
                                <ArrowLeftIcon className="w-5 h-5" /> Disciplinas
                            </button>
                        )}

                        {step === "questoes" && (
                            <button
                                onClick={() => { setStep("assuntos"); setAssuntoSelecionado(null); setQuestoes([]); setIdsCache([]); }}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-card hover:bg-muted transition text-sm font-semibold"
                            >
                                <ArrowLeftIcon className="w-5 h-5" /> Assuntos
                            </button>
                        )}

                        {(step === "disciplinas" || step === "assuntos") && (
                            <div className="flex items-center gap-2 bg-muted rounded-2xl p-2 border border-border">
                                <button onClick={() => setMode("grid")} className="outline-none">
                                    <GridIcon active={mode === "grid"} />
                                </button>
                                <button onClick={() => setMode("list")} className="outline-none">
                                    <ListIcon active={mode === "list"} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Disciplinas */}
            {userId && step === "disciplinas" && (
                <>
                    {mode === "grid" ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            {disciplinas.map((d) => {
                                const progress = pct(d.anotadas, d.questoes);
                                return (
                                    <button
                                        key={d.disciplina}
                                        onClick={() => entrarAssuntos(d.disciplina)}
                                        className="text-left bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition block"
                                    >
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-6 ${tipoSelecionado === "ERROS" ? "bg-red-500/10 text-red-600" : "bg-emerald-500/10 text-emerald-600"}`}>
                                            <BookIcon className="w-6 h-6" />
                                        </div>
                                        <div className="text-base font-bold text-foreground">{d.disciplina}</div>
                                        <div className="grid grid-cols-2 gap-3 mt-5">
                                            <div>
                                                <div className="text-lg font-extrabold text-primary">{d.questoes}</div>
                                                <div className="text-xs text-muted-foreground">Questões</div>
                                            </div>
                                            <div>
                                                <div className="text-lg font-extrabold text-emerald-600">{d.anotadas}</div>
                                                <div className="text-xs text-muted-foreground">Anotadas</div>
                                            </div>
                                        </div>
                                        <div className="mt-5">
                                            <div className="flex justify-between text-xs text-muted-foreground mb-2">
                                                <span>Progresso</span>
                                                <span className="text-primary font-semibold">{progress}%</span>
                                            </div>
                                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                <div className={`h-full rounded-full ${tipoSelecionado === "ERROS" ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${progress}%` }} />
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {disciplinas.map((d) => (
                                <button
                                    key={d.disciplina}
                                    onClick={() => entrarAssuntos(d.disciplina)}
                                    className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition flex items-center justify-between text-left"
                                >
                                    <div>
                                        <div className="text-base font-bold text-foreground">{d.disciplina}</div>
                                        <div className="text-xs text-muted-foreground">{pct(d.anotadas, d.questoes)}% anotadas</div>
                                    </div>
                                    <div className="flex items-center gap-8">
                                        <div className="text-right">
                                            <div className="text-lg font-extrabold text-primary">{d.questoes}</div>
                                            <div className="text-xs text-muted-foreground">Questões</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-lg font-extrabold text-emerald-600">{d.anotadas}</div>
                                            <div className="text-xs text-muted-foreground">Anotadas</div>
                                        </div>
                                        <div className="text-muted-foreground">›</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Assuntos */}
            {userId && step === "assuntos" && (
                <>
                    {mode === "grid" ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            {assuntos.map((a) => {
                                const progress = pct(a.anotadas, a.questoes);
                                return (
                                    <button
                                        key={a.assunto}
                                        onClick={() => entrarQuestoes(a.assunto)}
                                        className="text-left bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition block"
                                    >
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-6 ${tipoSelecionado === "ERROS" ? "bg-red-500/10 text-red-600" : "bg-emerald-500/10 text-emerald-600"}`}>
                                            <BookIcon className="w-6 h-6" />
                                        </div>
                                        <div className="text-base font-bold text-foreground">{a.assunto}</div>
                                        <div className="grid grid-cols-2 gap-3 mt-5">
                                            <div>
                                                <div className="text-lg font-extrabold text-primary">{a.questoes}</div>
                                                <div className="text-xs text-muted-foreground">Questões</div>
                                            </div>
                                            <div>
                                                <div className="text-lg font-extrabold text-emerald-600">{a.anotadas}</div>
                                                <div className="text-xs text-muted-foreground">Anotadas</div>
                                            </div>
                                        </div>
                                        <div className="mt-5">
                                            <div className="flex justify-between text-xs text-muted-foreground mb-2">
                                                <span>Progresso</span>
                                                <span className="text-primary font-semibold">{progress}%</span>
                                            </div>
                                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                <div className={`h-full rounded-full ${tipoSelecionado === "ERROS" ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${progress}%` }} />
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {assuntos.map((a) => (
                                <button
                                    key={a.assunto}
                                    onClick={() => entrarQuestoes(a.assunto)}
                                    className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition flex items-center justify-between text-left"
                                >
                                    <div>
                                        <div className="text-base font-bold text-foreground">{a.assunto}</div>
                                        <div className="text-xs text-muted-foreground">{pct(a.anotadas, a.questoes)}% anotadas</div>
                                    </div>
                                    <div className="flex items-center gap-8">
                                        <div className="text-right">
                                            <div className="text-lg font-extrabold text-primary">{a.questoes}</div>
                                            <div className="text-xs text-muted-foreground">Questões</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-lg font-extrabold text-emerald-600">{a.anotadas}</div>
                                            <div className="text-xs text-muted-foreground">Anotadas</div>
                                        </div>
                                        <div className="text-muted-foreground">›</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Questões */}
            {userId && step === "questoes" && (
                <div className="bg-card rounded-2xl p-6 sm:p-8 shadow-sm border border-border">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border pb-3 mb-6">
                        <span className="text-sm font-medium text-muted-foreground tracking-tight">Questões do caderno</span>

                        <div className="flex items-center gap-4">
                            <span className="text-muted-foreground text-xs">
                                Mostrando {questoes.length} de {idsCache.length} questões
                            </span>

                            <select
                                className="bg-muted border border-border rounded px-3 py-1 text-xs text-foreground"
                                value={perPage}
                                onChange={(e) => {
                                    setPerPage(Number(e.target.value));
                                    setPage(1);
                                }}
                            >
                                <option value={3}>3 por página</option>
                                <option value={5}>5 por página</option>
                                <option value={10}>10 por página</option>
                            </select>
                        </div>
                    </div>

                    {qLoading ? (
                        <div className="text-muted-foreground py-10 text-center">Carregando questões...</div>
                    ) : questoes.length === 0 ? (
                        <div className="min-h-[120px] flex items-center justify-center text-[#a8b1c6]">
                            Nenhuma questão encontrada neste assunto.
                        </div>
                    ) : (
                        <div className="flex flex-col gap-7">
                            {questoes.map((q) => (
                                <QuestionCard
                                    key={q.id}
                                    id={q.id}
                                    materiaNome={q.disciplina}
                                    assuntoNome={q.assunto}
                                    tags={[q.instituicao, q.cargo, q.disciplina, q.assunto, q.modalidade, q.banca]}
                                    statement={q.enunciado}
                                    options={Object.entries(q.alternativas).map(([letter, text]) => ({ letter, text }))}
                                    correct={q.correta}
                                    explanation={q.explicacao}
                                    comentarios={q.comentarios}
                                    erros={q.erros}
                                />
                            ))}
                        </div>
                    )}

                    <Pagination total={idsCache.length} perPage={perPage} page={page} setPage={setPage} />
                </div>
            )}
        </div>
    );
}