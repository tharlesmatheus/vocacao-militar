"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronLeft, LayoutGrid, List, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { CabecalhoPagina, Numero, Pagina, SeletorSegmentado, Vazio } from "@/components/app/Pagina";
import { ListaCategorias } from "@/components/app/ListaCategorias";
import { QuestionCard } from "@/components/QuestionCard";
import { Pagination } from "@/components/Pagination";
import { rotuloBanca, rotuloModalidade } from "@/lib/rotulos";
import { usePendentesRevisao } from "@/lib/revisoesPendentes";
import {
    NOME_CADERNO,
    carregarItensCaderno,
    carregarResumoCadernos,
    itensAtivos,
    plural,
    type CadernoTipo,
    type ItemCaderno,
    type ResumoCadernos,
} from "@/lib/cadernos";

/*
 * Cadernos: o lugar de TREINAR o que o aluno errou (ou acertou no chute).
 * - Erros saem do caderno ativo depois de 2 acertos seguidos ("recuperadas").
 * - O Centro de Revisões continua sendo a agenda do dia.
 */

type Questao = {
    id: string;
    instituicao: string | null;
    cargo: string | null;
    disciplina: string | null;
    assunto: string | null;
    modalidade: string | null;
    banca: string | null;
    ano?: number | null;
    enunciado: string;
    alternativas: Record<string, string>;
    correta: string;
    explicacao: string | null;
};

const POR_PAGINA = 5;

export default function CadernosPage() {
    const [itens, setItens] = useState<ItemCaderno[] | null>(null);
    const [resumo, setResumo] = useState<ResumoCadernos | null>(null);
    const [erro, setErro] = useState("");
    const [tipo, setTipo] = useState<CadernoTipo>("ERROS");
    const [modo, setModo] = useState<"grid" | "list">("grid");
    const [disciplina, setDisciplina] = useState<string | null>(null);
    const [assunto, setAssunto] = useState<string | null>(null);
    const [pagina, setPagina] = useState(1);
    const [questoes, setQuestoes] = useState<Questao[]>([]);
    const [carregandoQ, setCarregandoQ] = useState(false);
    const pendentes = usePendentesRevisao("CADERNO");

    const carregar = useCallback(async () => {
        try {
            const lista = await carregarItensCaderno();
            setItens(lista);
            setResumo(await carregarResumoCadernos(lista));
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar seus cadernos.");
            setItens([]);
        }
    }, []);

    useEffect(() => {
        carregar();
    }, [carregar]);

    const ativos = useMemo(() => (itens ? itensAtivos(itens, tipo) : []), [itens, tipo]);

    const disciplinas = useMemo(() => {
        const mapa = new Map<string, { id: string; nome: string; total: number; pendentes: number }>();
        for (const i of ativos) {
            const d = mapa.get(i.disciplina) ?? { id: i.disciplina, nome: i.disciplina, total: 0, pendentes: 0 };
            d.total += 1;
            if (tipo === "ERROS" && pendentes.has(i.questao_id)) d.pendentes += 1;
            mapa.set(i.disciplina, d);
        }
        return [...mapa.values()];
    }, [ativos, pendentes, tipo]);

    const daDisciplina = useMemo(() => ativos.filter((i) => i.disciplina === disciplina), [ativos, disciplina]);
    const assuntos = useMemo(() => {
        const mapa = new Map<string, number>();
        for (const i of daDisciplina) mapa.set(i.assunto, (mapa.get(i.assunto) ?? 0) + 1);
        return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
    }, [daDisciplina]);
    const filtrados = useMemo(
        () => daDisciplina.filter((i) => !assunto || i.assunto === assunto),
        [daDisciplina, assunto]
    );

    // Página atual de questões da disciplina/assunto escolhidos.
    useEffect(() => {
        if (!disciplina) return;
        const ids = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA).map((i) => i.questao_id);
        if (!ids.length) {
            setQuestoes([]);
            return;
        }
        let ativo = true;
        setCarregandoQ(true);
        supabase
            .rpc("questoes_por_ids", { p_ids: ids })
            .select("id,instituicao,cargo,disciplina,assunto,modalidade,banca,ano,enunciado,alternativas,correta,explicacao")
            .then(({ data, error }) => {
                if (!ativo) return;
                if (error) setErro(error.message);
                const mapa = new Map(((data ?? []) as Questao[]).map((q) => [q.id, q]));
                setQuestoes(ids.map((id) => mapa.get(id)).filter(Boolean) as Questao[]);
                setCarregandoQ(false);
            });
        return () => {
            ativo = false;
        };
    }, [disciplina, filtrados, pagina]);

    function trocarTipo(t: CadernoTipo) {
        setTipo(t);
        setDisciplina(null);
        setAssunto(null);
        setPagina(1);
    }

    function abrirDisciplina(d: string) {
        setDisciplina(d);
        setAssunto(null);
        setPagina(1);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    const linkTreino = (extra: Record<string, string | null> = {}) => {
        const qs = new URLSearchParams({ tipo });
        for (const [k, v] of Object.entries(extra)) if (v) qs.set(k, v);
        return `/cadernos/treino?${qs}`;
    };

    const taxa = resumo && resumo.erros_total ? Math.round((100 * resumo.recuperadas) / resumo.erros_total) : 0;

    return (
        <Pagina>
            <CabecalhoPagina
                titulo="Cadernos"
                descricao="Refaça o que você errou até acertar. Questão errada sai do caderno depois de 2 acertos seguidos."
                acoes={
                    <Link href="/revisao" className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted">
                        Centro de revisões
                    </Link>
                }
            />

            {erro && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">{erro}</div>}

            {/* Números */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Numero rotulo="No caderno de erros" valor={resumo ? resumo.erros_ativos.toLocaleString("pt-BR") : "—"} detalhe="questões para refazer" />
                <Numero rotulo="Para revisar hoje" valor={resumo ? resumo.para_revisar.toLocaleString("pt-BR") : "—"} detalhe="pela sua agenda de revisão" />
                <Numero rotulo="Recuperadas" valor={resumo ? resumo.recuperadas.toLocaleString("pt-BR") : "—"} detalhe="errou antes, agora acerta" />
                <Numero rotulo="Taxa de recuperação" valor={resumo ? `${taxa}%` : "—"} detalhe="dos erros já recuperados" />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <SeletorSegmentado
                    rotulo="Caderno"
                    opcoes={[
                        { id: "ERROS", nome: `Erros${itens ? ` (${itensAtivos(itens, "ERROS").length})` : ""}` },
                        { id: "ACERTOS", nome: `Acertei no chute${itens ? ` (${itensAtivos(itens, "ACERTOS").length})` : ""}` },
                    ]}
                    valor={tipo}
                    aoMudar={trocarTipo}
                />
                {!disciplina && ativos.length > 0 && (
                    <div className="inline-flex rounded-lg border border-border bg-muted p-1">
                        <button type="button" aria-label="Grade" onClick={() => setModo("grid")} className={`rounded-md p-1.5 ${modo === "grid" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
                            <LayoutGrid className="h-4 w-4" />
                        </button>
                        <button type="button" aria-label="Lista" onClick={() => setModo("list")} className={`rounded-md p-1.5 ${modo === "list" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
                            <List className="h-4 w-4" />
                        </button>
                    </div>
                )}
            </div>

            {itens === null ? (
                <div className="h-40 animate-pulse rounded-xl bg-muted" />
            ) : !disciplina ? (
                ativos.length === 0 ? (
                    tipo === "ERROS" ? (
                        <Vazio
                            titulo={resumo?.recuperadas ? "Nenhum erro pendente. Mandou bem!" : "Seu caderno de erros está vazio"}
                            texto={
                                resumo?.recuperadas
                                    ? `Você já recuperou ${plural(resumo.recuperadas, "questão", "questões")}. Continue resolvendo: o que errar volta para cá sozinho.`
                                    : "Quando você errar uma questão, ela entra aqui automaticamente para você refazer até acertar."
                            }
                            acao={<Link href="/questoes" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Resolver questões</Link>}
                        />
                    ) : (
                        <Vazio
                            titulo="Nada em Acertei no chute"
                            texto={'Acertou uma questão mas ficou em dúvida? Depois de conferir, toque em "Salvar para revisar" (ou em Caderno › Acertei no chute).'}
                            acao={<Link href="/questoes" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Resolver questões</Link>}
                        />
                    )
                ) : (
                    <>
                        {/* Ação principal */}
                        <section className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <div className="text-lg font-bold text-foreground">
                                    {tipo === "ERROS" ? "Refazer meus erros" : "Revisar meus chutes"}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    {plural(ativos.length, "questão", "questões")} em {plural(disciplinas.length, "disciplina", "disciplinas")}. Sessões de até 20, das mais antigas para as mais novas.
                                </div>
                            </div>
                            <Link href={linkTreino()} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                                <RotateCcw className="h-4 w-4" aria-hidden /> Começar agora
                            </Link>
                        </section>

                        <ListaCategorias
                            itens={disciplinas}
                            modo={modo}
                            icone={<BookOpen className="h-5 w-5" />}
                            unidade={["questão", "questões"]}
                            rotuloBusca="Buscar disciplina"
                            aoAbrir={abrirDisciplina}
                        />
                    </>
                )
            ) : (
                <>
                    {/* Dentro de uma disciplina: filtro de assunto + questões */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                            <button type="button" onClick={() => setDisciplina(null)} className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted">
                                <ChevronLeft className="h-4 w-4" aria-hidden /> Disciplinas
                            </button>
                            <h2 className="truncate text-lg font-bold text-foreground">{disciplina}</h2>
                        </div>
                        <Link href={linkTreino({ disciplina, assunto })} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                            <RotateCcw className="h-4 w-4" aria-hidden /> Refazer {assunto ? "este assunto" : "esta disciplina"} ({filtrados.length})
                        </Link>
                    </div>

                    {assuntos.length > 1 && (
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por assunto">
                            <button type="button" onClick={() => { setAssunto(null); setPagina(1); }} className={chip(!assunto)}>
                                Todos ({daDisciplina.length})
                            </button>
                            {assuntos.map(([nome, n]) => (
                                <button key={nome} type="button" onClick={() => { setAssunto(nome); setPagina(1); }} className={chip(assunto === nome)}>
                                    {nome} ({n})
                                </button>
                            ))}
                        </div>
                    )}

                    {carregandoQ && !questoes.length ? (
                        <div className="h-60 animate-pulse rounded-xl bg-muted" />
                    ) : questoes.length === 0 ? (
                        <Vazio titulo="Nenhuma questão aqui" texto="Escolha outra disciplina ou assunto." />
                    ) : (
                        <div className="flex flex-col">
                            {questoes.map((q, i) => (
                                <QuestionCard
                                    key={q.id}
                                    id={q.id}
                                    numero={(pagina - 1) * POR_PAGINA + i + 1}
                                    total={filtrados.length}
                                    materiaNome={q.disciplina}
                                    assuntoNome={q.assunto}
                                    tags={[
                                        q.disciplina ?? "",
                                        q.assunto ?? "",
                                        q.instituicao ?? "",
                                        q.cargo ?? "",
                                        rotuloBanca(q.banca),
                                        q.ano ? String(q.ano) : "",
                                        rotuloModalidade(q.modalidade),
                                    ]}
                                    statement={q.enunciado}
                                    options={Object.entries(q.alternativas ?? {}).map(([letter, text]) => ({ letter, text }))}
                                    correct={q.correta}
                                    explanation={q.explicacao ?? ""}
                                />
                            ))}
                            <Pagination total={filtrados.length} perPage={POR_PAGINA} page={pagina} setPage={setPagina} />
                        </div>
                    )}
                </>
            )}
        </Pagina>
    );
}

function chip(ativo: boolean) {
    return `rounded-full border px-3 py-1.5 text-sm transition ${
        ativo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted"
    }`;
}
