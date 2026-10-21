"use client";

import { useEffect, useMemo, useState } from "react";
import {
    Brain,
    ChevronLeft,
    LayoutGrid,
    List,
    Pause,
    Pencil,
    Play,
    Plus,
    RotateCcw,
    Trash2,
    X,
} from "lucide-react";

import { supabase } from "@/lib/supabaseClient";
import { ListaCategorias } from "@/components/app/ListaCategorias";
import { usePendentesRevisao } from "@/lib/revisoesPendentes";

/* ============================================================================
 * Tipos
 * ========================================================================== */

type Flashcard = {
    id: string;
    user_id: string;
    edital_id: string | null;
    materia_id: string | null;
    assunto_id: string | null;
    disciplina_catalogo_id: string | null;
    assunto_catalogo_id: string | null;
    questao_origem_id: string | null;
    frente: string;
    verso: string;
    created_at: string;
    active: boolean;
};

type Disciplina = {
    id: string;
    nome: string;
    ativo: boolean;
};

type Assunto = {
    id: string;
    disciplina_id: string;
    nome: string;
    ativo: boolean;
};

type ViewLevel = "disciplinas" | "assuntos" | "flashcards";
type ViewMode = "grid" | "list";
type ModalMode = "create" | "edit";

/* ============================================================================
 * Helpers
 * ========================================================================== */

function plural(total: number) {
    return total === 1 ? "1 flashcard" : `${total} flashcards`;
}

function mensagemErro(error: unknown) {
    if (error instanceof Error) return error.message;

    if (error && typeof error === "object" && "message" in error) {
        return String((error as { message?: unknown }).message ?? "Erro inesperado.");
    }

    return "Erro inesperado.";
}

/* ============================================================================
 * Página
 * ========================================================================== */

export default function FlashcardsPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");

    const [userId, setUserId] = useState<string | null>(null);

    const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
    const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
    const [assuntos, setAssuntos] = useState<Assunto[]>([]);

    const [viewLevel, setViewLevel] = useState<ViewLevel>("disciplinas");
    const [viewMode, setViewMode] = useState<ViewMode>("grid");
    // Itens com revisão vencida: viram o selo "N para revisar" nos cards.
    const pendentes = usePendentesRevisao("FLASHCARD");

    const [disciplinaSel, setDisciplinaSel] = useState<string | null>(null);
    const [assuntoSel, setAssuntoSel] = useState<string | null>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<ModalMode>("create");
    const [editingId, setEditingId] = useState<string | null>(null);

    const [formDisciplinaId, setFormDisciplinaId] = useState("");
    const [formAssuntoId, setFormAssuntoId] = useState("");
    const [formFrente, setFormFrente] = useState("");
    const [formVerso, setFormVerso] = useState("");

    /* ------------------------------------------------------------------------
     * Carregamento
     * ---------------------------------------------------------------------- */

    async function carregarDados() {
        setLoading(true);
        setErro("");

        try {
            const { data: auth, error: authError } =
                await supabase.auth.getUser();

            const uid = auth.user?.id ?? null;

            if (authError || !uid) {
                throw new Error("Usuário não autenticado.");
            }

            setUserId(uid);

            const [
                cardsReq,
                disciplinasReq,
                assuntosReq,
            ] = await Promise.all([
                supabase
                    .from("flashcards")
                    .select(`
                        id,
                        user_id,
                        edital_id,
                        materia_id,
                        assunto_id,
                        disciplina_catalogo_id,
                        assunto_catalogo_id,
                        questao_origem_id,
                        frente,
                        verso,
                        created_at,
                        active
                    `)
                    .eq("user_id", uid)
                    .order("created_at", { ascending: false }),

                supabase
                    .from("questao_disciplinas")
                    .select("id,nome,ativo")
                    .eq("user_id", uid)
                    .order("ativo", { ascending: false })
                    .order("nome"),

                supabase
                    .from("questao_assuntos")
                    .select("id,disciplina_id,nome,ativo")
                    .eq("user_id", uid)
                    .order("ativo", { ascending: false })
                    .order("nome"),
            ]);

            const firstError =
                cardsReq.error ||
                disciplinasReq.error ||
                assuntosReq.error;

            if (firstError) throw firstError;

            setFlashcards((cardsReq.data ?? []) as Flashcard[]);
            setDisciplinas((disciplinasReq.data ?? []) as Disciplina[]);
            setAssuntos((assuntosReq.data ?? []) as Assunto[]);
        } catch (e) {
            setErro(
                "Não foi possível carregar agora. Atualize a página; se continuar, fale com o suporte."
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void carregarDados();
    }, []);

    /* ------------------------------------------------------------------------
     * Mapas
     * Só o catálogo canônico classifica. Cards que tinham apenas
     * materia_id/assunto_id (edital antigo, tabelas removidas) caem em
     * "Sem disciplina"/"Sem assunto".
     * ---------------------------------------------------------------------- */

    const disciplinaMap = useMemo(() => {
        const map = new Map<string, Disciplina>();
        disciplinas.forEach((item) => map.set(item.id, item));
        return map;
    }, [disciplinas]);

    const assuntoMap = useMemo(() => {
        const map = new Map<string, Assunto>();
        assuntos.forEach((item) => map.set(item.id, item));
        return map;
    }, [assuntos]);

    function disciplinaEfetivaId(card: Flashcard) {
        if (
            card.disciplina_catalogo_id &&
            disciplinaMap.has(card.disciplina_catalogo_id)
        ) {
            return card.disciplina_catalogo_id;
        }

        return null;
    }

    function assuntoEfetivoId(card: Flashcard) {
        if (
            card.assunto_catalogo_id &&
            assuntoMap.has(card.assunto_catalogo_id)
        ) {
            return card.assunto_catalogo_id;
        }

        return null;
    }

    function nomeDisciplina(id: string | null) {
        if (!id) return "Sem disciplina";
        return disciplinaMap.get(id)?.nome ?? "Disciplina não encontrada";
    }

    function nomeAssunto(id: string | null) {
        if (!id) return "Sem assunto";
        return assuntoMap.get(id)?.nome ?? "Assunto não encontrado";
    }

    /* ------------------------------------------------------------------------
     * Agrupamento
     * ---------------------------------------------------------------------- */

    const disciplinasAgrupadas = useMemo(() => {
        const map = new Map<
            string,
            {
                id: string;
                nome: string;
                total: number; pendentes: number;
                ativos: number;
            }
        >();

        for (const card of flashcards) {
            const id = disciplinaEfetivaId(card) ?? "SEM_DISCIPLINA";
            const atual = map.get(id);

            if (atual) {
                atual.total += 1;
                if (pendentes.has(String(card.id))) atual.pendentes += 1;
                if (card.active) atual.ativos += 1;
            } else {
                map.set(id, {
                    id,
                    nome:
                        id === "SEM_DISCIPLINA"
                            ? "Sem disciplina"
                            : nomeDisciplina(id),
                    total: 1,
                    pendentes: pendentes.has(String(card.id)) ? 1 : 0,
                    ativos: card.active ? 1 : 0,
                });
            }
        }

        return Array.from(map.values()).sort((a, b) =>
            a.nome.localeCompare(b.nome, "pt-BR", {
                sensitivity: "base",
            })
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        flashcards,
        disciplinaMap,
        assuntoMap,
        pendentes,
    ]);

    const assuntosAgrupados = useMemo(() => {
        if (!disciplinaSel) return [];

        const map = new Map<
            string,
            {
                id: string;
                nome: string;
                total: number; pendentes: number;
                ativos: number;
            }
        >();

        for (const card of flashcards) {
            const dId = disciplinaEfetivaId(card) ?? "SEM_DISCIPLINA";
            if (dId !== disciplinaSel) continue;

            const aId = assuntoEfetivoId(card) ?? "SEM_ASSUNTO";
            const atual = map.get(aId);

            if (atual) {
                atual.total += 1;
                if (pendentes.has(String(card.id))) atual.pendentes += 1;
                if (card.active) atual.ativos += 1;
            } else {
                map.set(aId, {
                    id: aId,
                    nome:
                        aId === "SEM_ASSUNTO"
                            ? "Sem assunto"
                            : nomeAssunto(aId),
                    total: 1,
                    pendentes: pendentes.has(String(card.id)) ? 1 : 0,
                    ativos: card.active ? 1 : 0,
                });
            }
        }

        return Array.from(map.values()).sort((a, b) =>
            a.nome.localeCompare(b.nome, "pt-BR", {
                sensitivity: "base",
            })
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        flashcards,
        disciplinaSel,
        disciplinaMap,
        assuntoMap,
        pendentes,
    ]);

    const flashcardsFiltrados = useMemo(() => {
        if (!disciplinaSel || !assuntoSel) return [];

        return flashcards.filter((card) => {
            const dId = disciplinaEfetivaId(card) ?? "SEM_DISCIPLINA";
            const aId = assuntoEfetivoId(card) ?? "SEM_ASSUNTO";

            return dId === disciplinaSel && aId === assuntoSel;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        flashcards,
        disciplinaSel,
        assuntoSel,
        disciplinaMap,
        assuntoMap,
    ]);

    const assuntosDoFormulario = useMemo(
        () =>
            assuntos.filter(
                (item) =>
                    item.ativo &&
                    item.disciplina_id === formDisciplinaId
            ),
        [assuntos, formDisciplinaId]
    );

    /* ------------------------------------------------------------------------
     * Modal
     * ---------------------------------------------------------------------- */

    function limparFormulario() {
        setEditingId(null);
        setFormDisciplinaId("");
        setFormAssuntoId("");
        setFormFrente("");
        setFormVerso("");
    }

    function fecharModal() {
        if (saving) return;
        setModalOpen(false);
        limparFormulario();
    }

    function abrirNovoFlashcard() {
        limparFormulario();
        setModalMode("create");

        if (
            disciplinaSel &&
            disciplinaSel !== "SEM_DISCIPLINA"
        ) {
            setFormDisciplinaId(disciplinaSel);
        }

        if (assuntoSel && assuntoSel !== "SEM_ASSUNTO") {
            setFormAssuntoId(assuntoSel);
        }

        setModalOpen(true);
    }

    function abrirEditarFlashcard(card: Flashcard) {
        setModalMode("edit");
        setEditingId(card.id);
        setFormDisciplinaId(disciplinaEfetivaId(card) ?? "");
        setFormAssuntoId(assuntoEfetivoId(card) ?? "");
        setFormFrente(card.frente);
        setFormVerso(card.verso);
        setModalOpen(true);
    }

    async function salvarFlashcard() {
        if (!userId) {
            setErro("Usuário não autenticado.");
            return;
        }

        if (!formDisciplinaId) {
            setErro("Selecione a disciplina.");
            return;
        }

        if (!formAssuntoId) {
            setErro("Selecione o assunto.");
            return;
        }

        const assunto = assuntoMap.get(formAssuntoId);

        if (!assunto || assunto.disciplina_id !== formDisciplinaId) {
            setErro("O assunto selecionado não pertence à disciplina.");
            return;
        }

        if (!formFrente.trim()) {
            setErro("Informe a frente do flashcard.");
            return;
        }

        if (!formVerso.trim()) {
            setErro("Informe o verso do flashcard.");
            return;
        }

        setSaving(true);
        setErro("");
        setMsg("");

        try {
            const payload = {
                disciplina_catalogo_id: formDisciplinaId,
                assunto_catalogo_id: formAssuntoId,
                frente: formFrente.trim(),
                verso: formVerso.trim(),
            };

            if (modalMode === "edit" && editingId) {
                const { data, error } = await supabase
                    .from("flashcards")
                    .update(payload)
                    .eq("id", editingId)
                    .eq("user_id", userId)
                    .select(`
                        id,
                        user_id,
                        edital_id,
                        materia_id,
                        assunto_id,
                        disciplina_catalogo_id,
                        assunto_catalogo_id,
                        questao_origem_id,
                        frente,
                        verso,
                        created_at,
                        active
                    `)
                    .single();

                if (error) throw error;

                setFlashcards((prev) =>
                    prev.map((item) =>
                        item.id === editingId ? (data as Flashcard) : item
                    )
                );

                setMsg("Flashcard atualizado com sucesso.");
            } else {
                const { data, error } = await supabase
                    .from("flashcards")
                    .insert({
                        user_id: userId,

                        // Classificação oficial:
                        disciplina_catalogo_id: formDisciplinaId,
                        assunto_catalogo_id: formAssuntoId,

                        // Legado fica nulo em novos flashcards manuais.
                        edital_id: null,
                        materia_id: null,
                        assunto_id: null,

                        frente: formFrente.trim(),
                        verso: formVerso.trim(),
                        active: true,
                    })
                    .select(`
                        id,
                        user_id,
                        edital_id,
                        materia_id,
                        assunto_id,
                        disciplina_catalogo_id,
                        assunto_catalogo_id,
                        questao_origem_id,
                        frente,
                        verso,
                        created_at,
                        active
                    `)
                    .single();

                if (error) throw error;

                setFlashcards((prev) => [data as Flashcard, ...prev]);
                setMsg("Flashcard criado com sucesso.");
            }

            setModalOpen(false);
            limparFormulario();
        } catch (e) {
            setErro(mensagemErro(e));
        } finally {
            setSaving(false);
        }
    }

    /* ------------------------------------------------------------------------
     * Ações
     * ---------------------------------------------------------------------- */

    async function alternarAtivo(card: Flashcard) {
        if (!userId) return;

        setErro("");

        try {
            const novoStatus = !card.active;

            const { error } = await supabase
                .from("flashcards")
                .update({ active: novoStatus })
                .eq("id", card.id)
                .eq("user_id", userId);

            if (error) throw error;

            setFlashcards((prev) =>
                prev.map((item) =>
                    item.id === card.id
                        ? { ...item, active: novoStatus }
                        : item
                )
            );

            setMsg(
                novoStatus
                    ? "Flashcard reativado."
                    : "Flashcard pausado."
            );
        } catch (e) {
            setErro(mensagemErro(e));
        }
    }

    async function excluirFlashcard(card: Flashcard) {
        if (!userId) return;

        const confirmado = window.confirm(
            "Excluir este flashcard permanentemente?"
        );

        if (!confirmado) return;

        setErro("");

        try {
            const { error } = await supabase
                .from("flashcards")
                .delete()
                .eq("id", card.id)
                .eq("user_id", userId);

            if (error) throw error;

            setFlashcards((prev) =>
                prev.filter((item) => item.id !== card.id)
            );

            setMsg("Flashcard excluído.");
        } catch (e) {
            setErro(mensagemErro(e));
        }
    }

    function entrarDisciplina(id: string) {
        setDisciplinaSel(id);
        setAssuntoSel(null);
        setViewLevel("assuntos");
    }

    function entrarAssunto(id: string) {
        setAssuntoSel(id);
        setViewLevel("flashcards");
    }

    function voltarDisciplinas() {
        setDisciplinaSel(null);
        setAssuntoSel(null);
        setViewLevel("disciplinas");
    }

    function voltarAssuntos() {
        setAssuntoSel(null);
        setViewLevel("assuntos");
    }

    /* ------------------------------------------------------------------------
     * Componentes locais
     * ---------------------------------------------------------------------- */

    /* ------------------------------------------------------------------------
     * Loading
     * ---------------------------------------------------------------------- */

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center px-4">
                <div className="flex flex-col items-center gap-3">
                    <Brain
                        size={30}
                        className="animate-pulse text-primary"
                    />
                    <span className="text-sm text-muted-foreground">
                        Carregando flashcards...
                    </span>
                </div>
            </div>
        );
    }

    /* ------------------------------------------------------------------------
     * UI
     * ---------------------------------------------------------------------- */

    return (
        <div className="flex w-full flex-col gap-6">
            <header className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
                <div className="flex items-center gap-3">
                    <div>
                        <h1 className="text-3xl font-extrabold text-foreground">
                            Meus Flashcards
                        </h1>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                            Seus flashcards organizados por disciplina e assunto.
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-xl border border-border bg-muted p-1">
                        <button
                            type="button"
                            aria-label="Visualização em grade"
                            onClick={() => setViewMode("grid")}
                            className={`rounded-lg p-2 transition ${viewMode === "grid"
                                    ? "bg-background shadow"
                                    : "text-muted-foreground"
                                }`}
                        >
                            <LayoutGrid size={18} />
                        </button>

                        <button
                            type="button"
                            aria-label="Visualização em lista"
                            onClick={() => setViewMode("list")}
                            className={`rounded-lg p-2 transition ${viewMode === "list"
                                    ? "bg-background shadow"
                                    : "text-muted-foreground"
                                }`}
                        >
                            <List size={18} />
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            window.location.href = "/revisao";
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 font-medium transition hover:bg-muted"
                    >
                        <RotateCcw size={17} />
                        Revisar
                    </button>

                    <button
                        type="button"
                        onClick={abrirNovoFlashcard}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground transition hover:opacity-90"
                    >
                        <Plus size={18} />
                        Novo flashcard
                    </button>
                </div>
            </header>

            {erro && (
                <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {erro}
                </div>
            )}

            {msg && !erro && (
                <div className="mb-6 rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm">
                    {msg}
                </div>
            )}

            {disciplinaSel && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <button
                    type="button"
                    onClick={voltarDisciplinas}
                    className="hover:text-foreground"
                >
                    Flashcards
                </button>

                {disciplinaSel && (
                    <>
                        <span>/</span>
                        <button
                            type="button"
                            onClick={() => {
                                setAssuntoSel(null);
                                setViewLevel("assuntos");
                            }}
                            className="hover:text-foreground"
                        >
                            {disciplinaSel === "SEM_DISCIPLINA"
                                ? "Sem disciplina"
                                : nomeDisciplina(disciplinaSel)}
                        </button>
                    </>
                )}

                {assuntoSel && (
                    <>
                        <span>/</span>
                        <span className="text-foreground">
                            {assuntoSel === "SEM_ASSUNTO"
                                ? "Sem assunto"
                                : nomeAssunto(assuntoSel)}
                        </span>
                    </>
                )}
            </div>
            )}

            {viewLevel === "disciplinas" && (
                <>
                    {disciplinasAgrupadas.length === 0 ? (
                        <EmptyState
                            title="Nenhum flashcard criado"
                            description="Crie seu primeiro flashcard usando uma disciplina e um assunto do catálogo."
                            onCreate={abrirNovoFlashcard}
                        />
                    ) : (
                        <ListaCategorias
                            itens={disciplinasAgrupadas.map((item) => ({ id: item.id, nome: item.nome, total: item.total, pendentes: item.pendentes, detalhe: item.ativos !== item.total ? `${item.total - item.ativos} inativos` : undefined }))}
                            modo={viewMode}
                            icone={<Brain size={20} />}
                            unidade={["flashcard", "flashcards"]}
                            rotuloBusca="Buscar disciplina"
                            aoAbrir={(id) => entrarDisciplina(id)}
                        />
                    )}
                </>
            )}

            {viewLevel === "assuntos" && (
                <>
                    <button
                        type="button"
                        onClick={voltarDisciplinas}
                        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <ChevronLeft size={16} />
                        Voltar
                    </button>

                    {assuntosAgrupados.length === 0 ? (
                        <EmptyState
                            title="Nenhum assunto com flashcards"
                            description="Ainda não existem flashcards nessa disciplina."
                            onCreate={abrirNovoFlashcard}
                        />
                    ) : (
                        <ListaCategorias
                            itens={assuntosAgrupados.map((item) => ({ id: item.id, nome: item.nome, total: item.total, pendentes: item.pendentes, detalhe: item.ativos !== item.total ? `${item.total - item.ativos} inativos` : undefined }))}
                            modo={viewMode}
                            icone={<Brain size={20} />}
                            unidade={["flashcard", "flashcards"]}
                            rotuloBusca="Buscar assunto"
                            aoAbrir={(id) => entrarAssunto(id)}
                        />
                    )}
                </>
            )}

            {viewLevel === "flashcards" && (
                <>
                    <div className="mb-6 flex items-center justify-between gap-4">
                        <button
                            type="button"
                            onClick={voltarAssuntos}
                            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                        >
                            <ChevronLeft size={16} />
                            Voltar
                        </button>

                        <button
                            type="button"
                            onClick={abrirNovoFlashcard}
                            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
                        >
                            <Plus size={16} />
                            Novo neste assunto
                        </button>
                    </div>

                    {flashcardsFiltrados.length === 0 ? (
                        <EmptyState
                            title="Nenhum flashcard neste assunto"
                            description="Adicione cartões curtos e objetivos."
                            onCreate={abrirNovoFlashcard}
                        />
                    ) : (
                        <div className="space-y-4">
                            {flashcardsFiltrados.map((card, index) => (
                                <article
                                    key={card.id}
                                    className={`rounded-xl border bg-card p-5 ${card.active
                                            ? "border-border"
                                            : "border-border opacity-60"
                                        }`}
                                >
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0 flex-1">
                                            <div className="mb-2 flex flex-wrap items-center gap-2">
                                                <span className="text-xs text-muted-foreground">
                                                    Flashcard {index + 1}
                                                </span>

                                                {!card.active && (
                                                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                                        Pausado
                                                    </span>
                                                )}

                                                {card.questao_origem_id && (
                                                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                                                        Criado de questão
                                                    </span>
                                                )}

                                                {!card.disciplina_catalogo_id && (
                                                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                                                        sem disciplina definida
                                                    </span>
                                                )}
                                            </div>

                                            <p className="font-semibold leading-relaxed">
                                                {card.frente}
                                            </p>

                                            <div className="mt-3 rounded-xl bg-muted/50 px-4 py-3">
                                                <p className="mb-1 text-xs font-medium text-muted-foreground">
                                                    Verso
                                                </p>
                                                <p className="whitespace-pre-wrap text-sm">
                                                    {card.verso}
                                                </p>
                                            </div>

                                            <p className="mt-4 text-xs text-muted-foreground">
                                                Criado em{" "}
                                                {new Date(
                                                    card.created_at
                                                ).toLocaleDateString("pt-BR")}
                                            </p>
                                        </div>

                                        <div className="flex shrink-0 items-center gap-1">
                                            <button
                                                type="button"
                                                title="Editar"
                                                onClick={() =>
                                                    abrirEditarFlashcard(card)
                                                }
                                                className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                                            >
                                                <Pencil size={17} />
                                            </button>

                                            <button
                                                type="button"
                                                title={
                                                    card.active
                                                        ? "Pausar"
                                                        : "Reativar"
                                                }
                                                onClick={() =>
                                                    void alternarAtivo(card)
                                                }
                                                className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                                            >
                                                {card.active ? (
                                                    <Pause size={17} />
                                                ) : (
                                                    <Play size={17} />
                                                )}
                                            </button>

                                            <button
                                                type="button"
                                                title="Excluir"
                                                onClick={() =>
                                                    void excluirFlashcard(card)
                                                }
                                                className="rounded-lg p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                                            >
                                                <Trash2 size={17} />
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </>
            )}

            {modalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
                    <button
                        type="button"
                        aria-label="Fechar modal"
                        className="absolute inset-0 bg-black/60"
                        onClick={fecharModal}
                    />

                    <div className="relative z-[101] max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
                        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-4">
                            <div>
                                <h2 className="text-lg font-semibold">
                                    {modalMode === "edit"
                                        ? "Editar flashcard"
                                        : "Novo flashcard"}
                                </h2>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    A disciplina e o assunto vêm do menu Disciplinas.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={fecharModal}
                                disabled={saving}
                                className="rounded-lg p-2 hover:bg-muted"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="space-y-5 p-5">
                            <div>
                                <label className="mb-2 block text-sm font-medium">
                                    Disciplina
                                </label>
                                <select
                                    value={formDisciplinaId}
                                    onChange={(e) => {
                                        setFormDisciplinaId(e.target.value);
                                        setFormAssuntoId("");
                                    }}
                                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary/30"
                                >
                                    <option value="">
                                        Selecione a disciplina
                                    </option>

                                    {disciplinas
                                        .filter((item) => item.ativo)
                                        .map((item) => (
                                            <option
                                                key={item.id}
                                                value={item.id}
                                            >
                                                {item.nome}
                                            </option>
                                        ))}
                                </select>
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium">
                                    Assunto
                                </label>
                                <select
                                    value={formAssuntoId}
                                    disabled={!formDisciplinaId}
                                    onChange={(e) =>
                                        setFormAssuntoId(e.target.value)
                                    }
                                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 outline-none disabled:opacity-50 focus:ring-2 focus:ring-primary/30"
                                >
                                    <option value="">
                                        Selecione o assunto
                                    </option>

                                    {assuntosDoFormulario.map((item) => (
                                        <option
                                            key={item.id}
                                            value={item.id}
                                        >
                                            {item.nome}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium">
                                    Frente
                                </label>
                                <textarea
                                    value={formFrente}
                                    onChange={(e) =>
                                        setFormFrente(e.target.value)
                                    }
                                    rows={4}
                                    maxLength={2000}
                                    placeholder="Ex.: Qual é o prazo para..."
                                    className="w-full resize-y rounded-xl border border-border bg-background px-3 py-3 outline-none focus:ring-2 focus:ring-primary/30"
                                />
                                <p className="mt-1 text-right text-xs text-muted-foreground">
                                    {formFrente.length}/2000
                                </p>
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium">
                                    Verso
                                </label>
                                <textarea
                                    value={formVerso}
                                    onChange={(e) =>
                                        setFormVerso(e.target.value)
                                    }
                                    rows={7}
                                    maxLength={4000}
                                    placeholder="Resposta curta, objetiva e suficiente para revisar."
                                    className="w-full resize-y rounded-xl border border-border bg-background px-3 py-3 outline-none focus:ring-2 focus:ring-primary/30"
                                />
                                <p className="mt-1 text-right text-xs text-muted-foreground">
                                    {formVerso.length}/4000
                                </p>
                            </div>
                        </div>

                        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-card px-5 py-4">
                            <button
                                type="button"
                                onClick={fecharModal}
                                disabled={saving}
                                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
                            >
                                Cancelar
                            </button>

                            <button
                                type="button"
                                onClick={() => void salvarFlashcard()}
                                disabled={saving}
                                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                            >
                                {saving
                                    ? "Salvando..."
                                    : modalMode === "edit"
                                        ? "Salvar alterações"
                                        : "Criar flashcard"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ============================================================================
 * Empty state
 * ========================================================================== */

function EmptyState({
    title,
    description,
    onCreate,
}: {
    title: string;
    description: string;
    onCreate: () => void;
}) {
    return (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <Brain className="mx-auto text-muted-foreground" size={34} />

            <h2 className="mt-4 font-semibold">{title}</h2>

            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {description}
            </p>

            <button
                type="button"
                onClick={onCreate}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
                <Plus size={17} />
                Novo flashcard
            </button>
        </div>
    );
}
