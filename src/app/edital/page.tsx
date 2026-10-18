"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronDown, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAssinatura } from "@/lib/useAssinatura";
import { ChamadaAssinatura } from "@/components/app/ChamadaAssinatura";
import { CabecalhoPagina, Numero, Pagina, Painel, SeletorSegmentado, Vazio } from "@/components/app/Pagina";
import SearchSelect from "@/components/SearchSelect";
import {
    ACERTO_DOMINIO,
    META_QUESTOES,
    NOME_SITUACAO,
    SITUACOES,
    formatarTempo,
    linkQuestoes,
    metaDoAssunto,
    porDisciplina,
    resumir,
    situacaoDoAssunto,
    taxaAcerto,
    type AssuntoEdital,
    type DadosEdital,
    type Situacao,
} from "@/lib/editalProgresso";

/*
 * Edital automático. O aluno escolhe instituição + cargo; o edital é a lista de
 * disciplinas e assuntos das questões do acervo desse cargo (RPC edital_progresso),
 * e o progresso de cada assunto vem do que ele fez: questões, flashcards, resumos,
 * revisões e tempo de estudo. Nada é marcado à mão. Pode ter vários editais.
 */

type Edital = { id: string; instituicao: string; cargo: string; created_at: string };
type Filtro = "todos" | Situacao;

const CHAVE_SELECIONADO = "edital:selecionado";

const COR_SITUACAO: Record<Situacao, string> = {
    nao_iniciado: "border-border bg-muted text-muted-foreground",
    em_estudo: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    revisar: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
    dominado: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

function lerSelecionado(): string {
    try {
        return localStorage.getItem(CHAVE_SELECIONADO) ?? "";
    } catch {
        return "";
    }
}
function gravarSelecionado(id: string) {
    try {
        localStorage.setItem(CHAVE_SELECIONADO, id);
    } catch {
        /* navegação privada: só não lembra */
    }
}

function Barra({ valor }: { valor: number }) {
    const cor = valor >= 70 ? "bg-emerald-500" : valor >= 35 ? "bg-amber-500" : "bg-red-500";
    return (
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={valor} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full rounded-full ${valor > 0 ? cor : ""}`} style={{ width: `${Math.max(0, Math.min(100, valor))}%` }} />
        </div>
    );
}

function Chip({ situacao }: { situacao: Situacao }) {
    return (
        <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${COR_SITUACAO[situacao]}`}>
            {NOME_SITUACAO[situacao]}
        </span>
    );
}

export default function EditalPage() {
    const assinaturaAtiva = useAssinatura();
    const [editais, setEditais] = useState<Edital[] | null>(null);
    const [selecionado, setSelecionado] = useState("");
    const [dados, setDados] = useState<Record<string, DadosEdital | null>>({});
    const [carregandoDados, setCarregandoDados] = useState(false);
    const [erro, setErro] = useState("");
    const [adicionando, setAdicionando] = useState(false);
    const [filtro, setFiltro] = useState<Filtro>("todos");
    const [busca, setBusca] = useState("");
    const [abertas, setAbertas] = useState<Set<string>>(new Set());

    const carregarEditais = useCallback(async () => {
        const { data, error } = await supabase
            .from("editais_alvo")
            .select("id,instituicao,cargo,created_at")
            .order("created_at", { ascending: true });
        if (error) {
            setErro(
                error.code === "42P01" || error.code === "PGRST205"
                    ? "O edital automático ainda não foi ativado no banco (falta rodar a atualização 20261026)."
                    : "Não foi possível carregar seus editais."
            );
            setEditais([]);
            return [];
        }
        const lista = (data ?? []) as Edital[];
        setEditais(lista);
        return lista;
    }, []);

    const carregarDados = useCallback(async (ids: string[]) => {
        if (!ids.length) return;
        setCarregandoDados(true);
        setErro("");
        const resultados = await Promise.all(
            ids.map(async (id) => {
                const { data, error } = await supabase.rpc("edital_progresso", { p_edital: id });
                return [id, error ? null : ((data ?? null) as DadosEdital | null), error] as const;
            })
        );
        setDados((atual) => {
            const novo = { ...atual };
            for (const [id, d] of resultados) novo[id] = d;
            return novo;
        });
        if (resultados.some(([, , e]) => e)) setErro("Não foi possível calcular o progresso de algum edital. Tente atualizar.");
        setCarregandoDados(false);
    }, []);

    // Carga inicial (só para assinante: sem assinatura o acervo não aparece).
    useEffect(() => {
        if (!assinaturaAtiva) return;
        (async () => {
            const lista = await carregarEditais();
            const lembrado = lerSelecionado();
            const inicial = lista.find((e) => e.id === lembrado)?.id ?? lista[0]?.id ?? "";
            setSelecionado(inicial);
            if (!lista.length) setAdicionando(true);
            await carregarDados(lista.map((e) => e.id));
        })();
    }, [assinaturaAtiva, carregarEditais, carregarDados]);

    // Voltou para a aba (fez questões/revisões em outra): recalcula o edital aberto.
    useEffect(() => {
        if (!selecionado) return;
        const aoVoltar = () => void carregarDados([selecionado]);
        window.addEventListener("focus", aoVoltar);
        return () => window.removeEventListener("focus", aoVoltar);
    }, [selecionado, carregarDados]);

    function escolher(id: string) {
        setSelecionado(id);
        gravarSelecionado(id);
        setFiltro("todos");
        setBusca("");
        setAbertas(new Set());
    }

    async function remover(ed: Edital) {
        if (!confirm(`Remover o edital ${ed.instituicao} · ${ed.cargo}? Seu histórico de questões e revisões continua.`)) return;
        const { error } = await supabase.from("editais_alvo").delete().eq("id", ed.id);
        if (error) {
            setErro("Não foi possível remover o edital.");
            return;
        }
        const lista = (editais ?? []).filter((e) => e.id !== ed.id);
        setEditais(lista);
        if (selecionado === ed.id) escolher(lista[0]?.id ?? "");
    }

    async function aoAdicionar(id: string) {
        setAdicionando(false);
        const lista = await carregarEditais();
        if (lista.some((e) => e.id === id)) {
            escolher(id);
            await carregarDados([id]);
        }
    }

    const atual = editais?.find((e) => e.id === selecionado) ?? null;
    const dadosAtual = selecionado ? dados[selecionado] : undefined;

    const disciplinas = useMemo(() => (dadosAtual ? porDisciplina(dadosAtual) : []), [dadosAtual]);
    const resumoGeral = useMemo(() => resumir(dadosAtual?.assuntos ?? []), [dadosAtual]);

    const visiveis = useMemo(() => {
        const termo = semAcento(busca.trim());
        return disciplinas
            .map((d) => ({
                ...d,
                filtrados: d.assuntos.filter(
                    (a) =>
                        (filtro === "todos" || situacaoDoAssunto(a) === filtro) &&
                        (!termo || semAcento(`${a.disciplina} ${a.assunto}`).includes(termo))
                ),
            }))
            .filter((d) => d.filtrados.length > 0);
    }, [disciplinas, filtro, busca]);

    const filtrando = filtro !== "todos" || busca.trim() !== "";

    if (assinaturaAtiva === null) {
        return <div className="animate-pulse py-10 text-center text-muted-foreground">Carregando…</div>;
    }

    return (
        <Pagina>
            <CabecalhoPagina
                rotulo="Edital"
                icone={<BookOpen className="h-4 w-4" aria-hidden />}
                titulo="Meu edital"
                descricao="Escolha a instituição e o cargo: o edital é montado com as disciplinas e assuntos que caem nas provas desse cargo. O progresso de cada assunto é calculado sozinho pelas questões, revisões, flashcards e resumos que você faz."
                acoes={
                    assinaturaAtiva ? (
                        <>
                            {selecionado && (
                                <button
                                    type="button"
                                    onClick={() => void carregarDados([selecionado])}
                                    disabled={carregandoDados}
                                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
                                >
                                    <RefreshCw className={`h-4 w-4 ${carregandoDados ? "animate-spin" : ""}`} aria-hidden /> Atualizar
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setAdicionando((v) => !v)}
                                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                            >
                                <Plus className="h-4 w-4" aria-hidden /> Adicionar edital
                            </button>
                        </>
                    ) : undefined
                }
            />

            {assinaturaAtiva === false && <ChamadaAssinatura />}

            {assinaturaAtiva && (
                <>
                    {erro && (
                        <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                            {erro}
                        </div>
                    )}

                    {adicionando && (
                        <NovoEdital
                            jaTem={(editais ?? []).map((e) => `${e.instituicao}|${e.cargo}`)}
                            aoCancelar={editais?.length ? () => setAdicionando(false) : undefined}
                            aoCriar={aoAdicionar}
                        />
                    )}

                    {editais === null && <div className="animate-pulse py-6 text-center text-muted-foreground">Carregando seus editais…</div>}

                    {editais && editais.length > 0 && (
                        <div className="flex gap-3 overflow-x-auto pb-1" role="tablist" aria-label="Seus editais">
                            {editais.map((e) => {
                                const r = dados[e.id] ? resumir(dados[e.id]!.assuntos) : null;
                                const ativo = e.id === selecionado;
                                return (
                                    <button
                                        key={e.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={ativo}
                                        onClick={() => escolher(e.id)}
                                        className={`min-w-[200px] shrink-0 rounded-xl border p-3 text-left transition ${
                                            ativo ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted"
                                        }`}
                                    >
                                        <div className="truncate text-sm font-bold text-foreground">{e.instituicao}</div>
                                        <div className="truncate text-xs text-muted-foreground">{e.cargo}</div>
                                        <div className="mt-2 flex items-center gap-2">
                                            <Barra valor={r?.progresso ?? 0} />
                                            <span className="w-10 shrink-0 text-right text-xs font-bold text-foreground">{r ? `${r.progresso}%` : "…"}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {atual && dadosAtual === undefined && (
                        <div className="animate-pulse py-6 text-center text-muted-foreground">Calculando seu progresso…</div>
                    )}

                    {atual && dadosAtual === null && !carregandoDados && (
                        <Vazio titulo="Não foi possível abrir este edital." texto="Clique em Atualizar para tentar de novo." />
                    )}

                    {atual && dadosAtual && (
                        <>
                            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                                <Numero rotulo="Progresso do edital" valor={`${resumoGeral.progresso}%`} detalhe="pesado pelo que mais cai" />
                                <Numero
                                    rotulo="Assuntos dominados"
                                    valor={`${resumoGeral.porSituacao.dominado}/${resumoGeral.assuntos}`}
                                    detalhe={`${resumoGeral.porSituacao.nao_iniciado} não iniciados`}
                                />
                                <Numero
                                    rotulo="Para revisar"
                                    valor={resumoGeral.porSituacao.revisar}
                                    detalhe={resumoGeral.revisoesVencidas ? `${resumoGeral.revisoesVencidas} revisões vencidas` : "nenhuma vencida"}
                                />
                                <Numero
                                    rotulo="Questões do cargo feitas"
                                    valor={`${resumoGeral.feitasCargo}/${resumoGeral.questoesCargo}`}
                                    detalhe={`${atual.instituicao} · ${atual.cargo}`}
                                />
                                <Numero
                                    rotulo="Acerto no edital"
                                    valor={pct(resumoGeral.feitas ? resumoGeral.acertos / resumoGeral.feitas : null)}
                                    detalhe={`${resumoGeral.feitas} questões respondidas`}
                                />
                            </div>

                            <Painel>
                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <SeletorSegmentado<Filtro>
                                        rotulo="Situação"
                                        valor={filtro}
                                        aoMudar={setFiltro}
                                        opcoes={[
                                            { id: "todos", nome: `Todos (${resumoGeral.assuntos})` },
                                            ...SITUACOES.map((s) => ({ id: s.id, nome: `${s.nome} (${resumoGeral.porSituacao[s.id]})` })),
                                        ]}
                                    />
                                    <label className="relative block md:w-72">
                                        <span className="sr-only">Buscar assunto</span>
                                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                                        <input
                                            value={busca}
                                            onChange={(e) => setBusca(e.target.value)}
                                            placeholder="Buscar disciplina ou assunto"
                                            className="w-full rounded-lg border border-border bg-muted py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
                                        />
                                    </label>
                                </div>
                                <p className="mt-3 text-xs text-muted-foreground">
                                    Dominado = pelo menos {META_QUESTOES} questões do assunto (ou todas que existem) com {Math.round(ACERTO_DOMINIO * 100)}% ou mais de
                                    acerto, contando a última resposta de cada questão, e sem revisão vencida. Questões do assunto em provas de outras instituições também contam.
                                </p>
                            </Painel>

                            {visiveis.length === 0 && (
                                <Vazio
                                    titulo={filtrando ? "Nenhum assunto com esse filtro." : "Este cargo ainda não tem questões no acervo."}
                                    texto={filtrando ? "Troque a situação ou limpe a busca." : undefined}
                                />
                            )}

                            <div className="flex flex-col gap-3">
                                {visiveis.map((d) => {
                                    const aberta = filtrando || abertas.has(d.nome);
                                    return (
                                        <section key={d.nome} className="rounded-xl border border-border bg-card shadow-sm">
                                            <button
                                                type="button"
                                                aria-expanded={aberta}
                                                onClick={() =>
                                                    setAbertas((s) => {
                                                        const n = new Set(s);
                                                        if (n.has(d.nome)) n.delete(d.nome);
                                                        else n.add(d.nome);
                                                        return n;
                                                    })
                                                }
                                                className="flex w-full flex-col gap-2 p-4 text-left sm:flex-row sm:items-center sm:gap-4"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition ${aberta ? "rotate-180" : ""}`} aria-hidden />
                                                        <h2 className="truncate text-base font-bold text-foreground">{d.nome}</h2>
                                                    </div>
                                                    <div className="mt-1 pl-6 text-xs text-muted-foreground">
                                                        {d.resumo.assuntos} {d.resumo.assuntos === 1 ? "assunto" : "assuntos"} · {d.resumo.questoesCargo} questões no cargo ·{" "}
                                                        {d.resumo.porSituacao.dominado} dominados
                                                        {d.resumo.porSituacao.revisar > 0 && ` · ${d.resumo.porSituacao.revisar} para revisar`}
                                                        {d.tempoSeg > 0 && ` · ${formatarTempo(d.tempoSeg)} de estudo`}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 pl-6 sm:w-56 sm:pl-0">
                                                    <Barra valor={d.resumo.progresso} />
                                                    <span className="w-10 shrink-0 text-right text-sm font-bold text-foreground">{d.resumo.progresso}%</span>
                                                </div>
                                            </button>
                                            {aberta && (
                                                <ul className="divide-y divide-border border-t border-border">
                                                    {d.filtrados.map((a) => (
                                                        <LinhaAssunto key={`${a.disciplina}|${a.assunto}`} a={a} edital={atual} />
                                                    ))}
                                                </ul>
                                            )}
                                        </section>
                                    );
                                })}
                            </div>

                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => void remover(atual)}
                                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-500/10 dark:text-red-400"
                                >
                                    <Trash2 className="h-4 w-4" aria-hidden /> Remover este edital
                                </button>
                            </div>
                        </>
                    )}
                </>
            )}
        </Pagina>
    );
}

function LinhaAssunto({ a, edital }: { a: AssuntoEdital; edital: Edital }) {
    const situacao = situacaoDoAssunto(a);
    const acerto = taxaAcerto(a);
    const meta = metaDoAssunto(a);
    // Fez todas do cargo: o link abre o assunto no acervo inteiro (outras provas da mesma matéria).
    const doCargo = a.feitas_cargo < a.n_cargo;
    const detalhes = [
        a.feitas ? `${a.feitas} ${a.feitas === 1 ? "questão" : "questões"} · ${pct(acerto)} de acerto` : "nenhuma questão feita",
        a.flashcards ? `${a.flashcards} flashcard${a.flashcards === 1 ? "" : "s"}` : "",
        a.resumos ? `${a.resumos} resumo${a.resumos === 1 ? "" : "s"}` : "",
        a.revisoes ? `${a.revisoes} revis${a.revisoes === 1 ? "ão feita" : "ões feitas"}` : "",
        a.tempo_seg ? formatarTempo(a.tempo_seg) : "",
    ].filter(Boolean);

    return (
        <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">{a.assunto}</span>
                    <Chip situacao={situacao} />
                    {a.revisoes_vencidas > 0 && (
                        <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                            {a.revisoes_vencidas} {a.revisoes_vencidas === 1 ? "revisão vencida" : "revisões vencidas"}
                        </span>
                    )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                    {detalhes.join(" · ")}
                    {situacao !== "dominado" && a.feitas < meta && ` · faltam ${meta - a.feitas} para a meta`}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                    {a.n_cargo} {a.n_cargo === 1 ? "questão" : "questões"} no cargo ({Math.min(a.feitas_cargo, a.n_cargo)} feitas)
                </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
                {a.revisoes_vencidas > 0 && (
                    <Link href="/revisao" className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
                        Revisar
                    </Link>
                )}
                <Link
                    href={linkQuestoes(a, doCargo ? edital : undefined)}
                    className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                >
                    Resolver questões
                </Link>
            </div>
        </li>
    );
}

function NovoEdital({
    jaTem,
    aoCancelar,
    aoCriar,
}: {
    jaTem: string[];
    aoCancelar?: () => void;
    aoCriar: (id: string) => void;
}) {
    const [instituicoes, setInstituicoes] = useState<string[]>([]);
    const [cargos, setCargos] = useState<string[]>([]);
    const [instituicao, setInstituicao] = useState("");
    const [cargo, setCargo] = useState("");
    const [carregando, setCarregando] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState("");

    useEffect(() => {
        let cancelado = false;
        (async () => {
            setCarregando(true);
            const { data, error } = await supabase.rpc("opcoes_filtro_questoes", {
                p_origem: "ACERVO",
                p_instituicao: instituicao || null,
                p_cargo: null,
                p_banca: null,
                p_disciplina: null,
                p_assunto: null,
                p_modalidade: null,
            });
            if (cancelado) return;
            if (error) setErro("Não foi possível carregar as instituições.");
            const o = (data ?? {}) as { instituicoes?: string[]; cargos?: string[] };
            setInstituicoes(o.instituicoes ?? []);
            setCargos(instituicao ? o.cargos ?? [] : []);
            setCarregando(false);
        })();
        return () => {
            cancelado = true;
        };
    }, [instituicao]);

    const repetido = !!instituicao && !!cargo && jaTem.includes(`${instituicao}|${cargo}`);

    async function criar() {
        if (!instituicao || !cargo) return;
        setSalvando(true);
        setErro("");
        const { data, error } = await supabase.rpc("adicionar_edital_alvo", { p_instituicao: instituicao, p_cargo: cargo });
        setSalvando(false);
        if (error) {
            setErro(error.message || "Não foi possível criar o edital.");
            return;
        }
        aoCriar(String(data));
    }

    const campo = "w-full rounded-lg border border-border bg-muted px-4 py-3 text-base text-foreground shadow-sm outline-none focus:ring-2 focus:ring-primary";

    return (
        <Painel
            titulo="Novo edital"
            descricao="Escolha para qual concurso você estuda. Disciplinas e assuntos vêm das questões desse cargo no acervo."
        >
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <label className="flex flex-col gap-1 text-sm font-semibold text-foreground">
                    Instituição
                    <SearchSelect
                        id="edital-instituicao"
                        name="instituicao"
                        className={campo}
                        value={instituicao}
                        options={instituicoes}
                        onChange={(v) => {
                            setInstituicao(v);
                            setCargo("");
                        }}
                        placeholder={carregando && !instituicoes.length ? "Carregando…" : "Selecione a instituição"}
                        disabled={salvando}
                    />
                </label>
                <label className="flex flex-col gap-1 text-sm font-semibold text-foreground">
                    Cargo
                    <SearchSelect
                        id="edital-cargo"
                        name="cargo"
                        className={campo}
                        value={cargo}
                        options={cargos}
                        onChange={setCargo}
                        placeholder={!instituicao ? "Escolha a instituição primeiro" : carregando ? "Carregando…" : "Selecione o cargo"}
                        disabled={!instituicao || carregando || salvando}
                    />
                </label>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => void criar()}
                        disabled={!instituicao || !cargo || salvando || repetido}
                        className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                        {salvando ? "Criando…" : "Criar edital"}
                    </button>
                    {aoCancelar && (
                        <button type="button" onClick={aoCancelar} className="rounded-lg border border-border px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted">
                            Cancelar
                        </button>
                    )}
                </div>
            </div>
            {repetido && <p className="mt-2 text-sm text-muted-foreground">Você já tem esse edital.</p>}
            {erro && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{erro}</p>}
        </Painel>
    );
}
