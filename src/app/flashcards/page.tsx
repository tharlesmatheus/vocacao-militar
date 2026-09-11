"use client";

import { useEffect, useMemo, useState } from "react";
import {
    Brain,
    CheckCircle2,
    ChevronLeft,
    Eye,
    LayoutGrid,
    List,
    Pause,
    Pencil,
    Play,
    Plus,
    RotateCcw,
    Trash2,
    X,
    XCircle,
} from "lucide-react";

import { supabase } from "@/lib/supabaseClient";

/* =========================
 * TYPES
 * ========================= */

type Flashcard = {
    id: string;
    user_id: string;
    edital_id: string | null;
    materia_id: string | null;
    assunto_id: string | null;
    questao_origem_id: string | null;
    frente: string;
    verso: string;
    created_at: string;
    active: boolean;
};

type Edital = {
    id: string;
    nome: string;
};

type Materia = {
    id: string;
    nome: string;
    edital_id: string | null;
};

type Assunto = {
    id: string;
    nome: string;
    materia_id: string | null;
};

type ViewLevel = "disciplinas" | "assuntos" | "flashcards";

type ViewMode = "grid" | "list";

type CardModalMode = "create" | "edit";

type ReviewResult = "ACERTO" | "ERRO";

/* =========================
 * HELPERS
 * ========================= */

function truncate(text: string, max = 150) {
    const clean = String(text ?? "").replace(/\s+/g, " ").trim();

    if (clean.length <= max) return clean;

    return `${clean.slice(0, max)}...`;
}

function pluralFlashcards(total: number) {
    return total === 1 ? "1 flashcard" : `${total} flashcards`;
}

/* =========================
 * PAGE
 * ========================= */

export default function FlashcardsPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");

    const [userId, setUserId] = useState<string | null>(null);

    const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
    const [editais, setEditais] = useState<Edital[]>([]);
    const [materias, setMaterias] = useState<Materia[]>([]);
    const [assuntos, setAssuntos] = useState<Assunto[]>([]);

    const [viewLevel, setViewLevel] =
        useState<ViewLevel>("disciplinas");

    const [viewMode, setViewMode] =
        useState<ViewMode>("grid");

    const [materiaSel, setMateriaSel] =
        useState<string | null>(null);

    const [assuntoSel, setAssuntoSel] =
        useState<string | null>(null);

    /* =========================
     * MODAL
     * ========================= */

    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] =
        useState<CardModalMode>("create");

    const [editingId, setEditingId] =
        useState<string | null>(null);

    const [formEditalId, setFormEditalId] =
        useState("");

    const [formMateriaId, setFormMateriaId] =
        useState("");

    const [formAssuntoId, setFormAssuntoId] =
        useState("");

    const [formFrente, setFormFrente] =
        useState("");

    const [formVerso, setFormVerso] =
        useState("");

    /* =========================
     * REVIEW
     * ========================= */

    const [reviewMode, setReviewMode] =
        useState(false);

    const [reviewIndex, setReviewIndex] =
        useState(0);

    const [showBack, setShowBack] =
        useState(false);

    const [reviewSaving, setReviewSaving] =
        useState(false);

    /* =========================
     * LOAD
     * ========================= */

    async function carregarDados() {
        setLoading(true);
        setErro("");

        try {
            const {
                data: auth,
                error: authError,
            } = await supabase.auth.getUser();

            const user = auth?.user;

            if (authError || !user?.id) {
                throw new Error("Usuário não autenticado.");
            }

            setUserId(user.id);

            const [
                flashcardsReq,
                editaisReq,
                materiasReq,
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
                        questao_origem_id,
                        frente,
                        verso,
                        created_at,
                        active
                    `)
                    .eq("user_id", user.id)
                    .order("created_at", {
                        ascending: false,
                    }),

                supabase
                    .from("editais")
                    .select("id,nome")
                    .eq("user_id", user.id)
                    .order("nome"),

                supabase
                    .from("materias")
                    .select("id,nome,edital_id")
                    .eq("user_id", user.id)
                    .order("nome"),

                supabase
                    .from("assuntos")
                    .select("id,nome,materia_id")
                    .eq("user_id", user.id)
                    .order("nome"),
            ]);

            if (flashcardsReq.error) {
                throw flashcardsReq.error;
            }

            if (editaisReq.error) {
                throw editaisReq.error;
            }

            if (materiasReq.error) {
                throw materiasReq.error;
            }

            if (assuntosReq.error) {
                throw assuntosReq.error;
            }

            setFlashcards(
                (flashcardsReq.data ?? []) as Flashcard[]
            );

            setEditais(
                (editaisReq.data ?? []) as Edital[]
            );

            setMaterias(
                (materiasReq.data ?? []) as Materia[]
            );

            setAssuntos(
                (assuntosReq.data ?? []) as Assunto[]
            );
        } catch (e: any) {
            setErro(
                e?.message ||
                "Não foi possível carregar os flashcards."
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        carregarDados();
    }, []);

    /* =========================
     * MAPAS
     * ========================= */

    const materiaMap = useMemo(() => {
        const map: Record<string, string> = {};

        materias.forEach((materia) => {
            map[materia.id] = materia.nome;
        });

        return map;
    }, [materias]);

    const assuntoMap = useMemo(() => {
        const map: Record<string, string> = {};

        assuntos.forEach((assunto) => {
            map[assunto.id] = assunto.nome;
        });

        return map;
    }, [assuntos]);

    const nomeMateria = (id?: string | null) => {
        if (!id) return "Sem disciplina";

        return materiaMap[id] ?? "Sem disciplina";
    };

    const nomeAssunto = (id?: string | null) => {
        if (!id) return "Sem assunto";

        return assuntoMap[id] ?? "Sem assunto";
    };

    /* =========================
     * AGRUPAMENTOS
     * ========================= */

    const disciplinasAgrupadas = useMemo(() => {
        const map = new Map<
            string,
            {
                id: string;
                nome: string;
                total: number;
                ativos: number;
            }
        >();

        for (const flashcard of flashcards) {
            const id =
                flashcard.materia_id ?? "SEM_MATERIA";

            const current = map.get(id);

            if (current) {
                current.total += 1;

                if (flashcard.active) {
                    current.ativos += 1;
                }
            } else {
                map.set(id, {
                    id,
                    nome: nomeMateria(
                        flashcard.materia_id
                    ),
                    total: 1,
                    ativos: flashcard.active ? 1 : 0,
                });
            }
        }

        return Array.from(map.values()).sort(
            (a, b) =>
                a.nome.localeCompare(
                    b.nome,
                    "pt-BR"
                )
        );
    }, [flashcards, materiaMap]);

    const assuntosAgrupados = useMemo(() => {
        if (!materiaSel) return [];

        const map = new Map<
            string,
            {
                id: string;
                nome: string;
                total: number;
                ativos: number;
            }
        >();

        const cards = flashcards.filter((card) => {
            const id =
                card.materia_id ?? "SEM_MATERIA";

            return id === materiaSel;
        });

        for (const flashcard of cards) {
            const id =
                flashcard.assunto_id ?? "SEM_ASSUNTO";

            const current = map.get(id);

            if (current) {
                current.total += 1;

                if (flashcard.active) {
                    current.ativos += 1;
                }
            } else {
                map.set(id, {
                    id,
                    nome: nomeAssunto(
                        flashcard.assunto_id
                    ),
                    total: 1,
                    ativos: flashcard.active ? 1 : 0,
                });
            }
        }

        return Array.from(map.values()).sort(
            (a, b) =>
                a.nome.localeCompare(
                    b.nome,
                    "pt-BR"
                )
        );
    }, [
        flashcards,
        materiaSel,
        assuntoMap,
    ]);

    const flashcardsFiltrados = useMemo(() => {
        if (!materiaSel || !assuntoSel) {
            return [];
        }

        return flashcards.filter((card) => {
            const mat =
                card.materia_id ?? "SEM_MATERIA";

            const ass =
                card.assunto_id ?? "SEM_ASSUNTO";

            return (
                mat === materiaSel &&
                ass === assuntoSel
            );
        });
    }, [
        flashcards,
        materiaSel,
        assuntoSel,
    ]);

    const flashcardsRevisao = useMemo(
        () =>
            flashcardsFiltrados.filter(
                (card) => card.active
            ),
        [flashcardsFiltrados]
    );

    /* =========================
     * FORM FILTERS
     * ========================= */

    const materiasForm = useMemo(
        () =>
            materias.filter(
                (materia) =>
                    materia.edital_id ===
                    formEditalId
            ),
        [materias, formEditalId]
    );

    const assuntosForm = useMemo(
        () =>
            assuntos.filter(
                (assunto) =>
                    assunto.materia_id ===
                    formMateriaId
            ),
        [assuntos, formMateriaId]
    );

    /* =========================
     * MODAL HELPERS
     * ========================= */

    function limparFormulario() {
        setEditingId(null);
        setFormEditalId("");
        setFormMateriaId("");
        setFormAssuntoId("");
        setFormFrente("");
        setFormVerso("");
    }

    function fecharModal() {
        setModalOpen(false);
        limparFormulario();
    }

    function abrirNovoFlashcard() {
        limparFormulario();

        setModalMode("create");

        if (
            materiaSel &&
            materiaSel !== "SEM_MATERIA"
        ) {
            const materia = materias.find(
                (m) => m.id === materiaSel
            );

            if (materia) {
                setFormEditalId(
                    materia.edital_id ?? ""
                );

                setFormMateriaId(materia.id);
            }
        }

        if (
            assuntoSel &&
            assuntoSel !== "SEM_ASSUNTO"
        ) {
            setFormAssuntoId(assuntoSel);
        }

        setModalOpen(true);
    }

    function abrirEditarFlashcard(
        flashcard: Flashcard
    ) {
        const materia = materias.find(
            (m) => m.id === flashcard.materia_id
        );

        setModalMode("edit");
        setEditingId(flashcard.id);

        setFormEditalId(
            flashcard.edital_id ??
            materia?.edital_id ??
            ""
        );

        setFormMateriaId(
            flashcard.materia_id ?? ""
        );

        setFormAssuntoId(
            flashcard.assunto_id ?? ""
        );

        setFormFrente(flashcard.frente);
        setFormVerso(flashcard.verso);

        setModalOpen(true);
    }

    /* =========================
     * SAVE
     * ========================= */

    async function salvarFlashcard() {
        if (!userId) {
            setErro("Usuário não autenticado.");
            return;
        }

        if (!formEditalId) {
            setErro("Selecione o edital.");
            return;
        }

        if (!formMateriaId) {
            setErro("Selecione a disciplina.");
            return;
        }

        if (!formAssuntoId) {
            setErro("Selecione o assunto.");
            return;
        }

        if (!formFrente.trim()) {
            setErro(
                "Informe a frente do flashcard."
            );
            return;
        }

        if (!formVerso.trim()) {
            setErro(
                "Informe o verso do flashcard."
            );
            return;
        }

        setSaving(true);
        setErro("");
        setMsg("");

        try {
            if (
                modalMode === "edit" &&
                editingId
            ) {
                const {
                    data,
                    error,
                } = await supabase
                    .from("flashcards")
                    .update({
                        edital_id: formEditalId,
                        materia_id: formMateriaId,
                        assunto_id: formAssuntoId,
                        frente: formFrente.trim(),
                        verso: formVerso.trim(),
                    })
                    .eq("id", editingId)
                    .eq("user_id", userId)
                    .select(`
                        id,
                        user_id,
                        edital_id,
                        materia_id,
                        assunto_id,
                        questao_origem_id,
                        frente,
                        verso,
                        created_at,
                        active
                    `)
                    .single();

                if (error) throw error;

                setFlashcards((prev) =>
                    prev.map((card) =>
                        card.id === editingId
                            ? (data as Flashcard)
                            : card
                    )
                );

                setMsg(
                    "Flashcard atualizado com sucesso."
                );
            } else {
                const {
                    data,
                    error,
                } = await supabase
                    .from("flashcards")
                    .insert({
                        user_id: userId,
                        edital_id: formEditalId,
                        materia_id: formMateriaId,
                        assunto_id: formAssuntoId,
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
                        questao_origem_id,
                        frente,
                        verso,
                        created_at,
                        active
                    `)
                    .single();

                if (error) throw error;

                setFlashcards((prev) => [
                    data as Flashcard,
                    ...prev,
                ]);

                setMsg(
                    "Flashcard criado com sucesso."
                );
            }

            fecharModal();
        } catch (e: any) {
            setErro(
                e?.message ||
                "Não foi possível salvar o flashcard."
            );
        } finally {
            setSaving(false);
        }
    }

    /* =========================
     * PAUSE / RESUME
     * ========================= */

    async function alternarAtivo(
        flashcard: Flashcard
    ) {
        if (!userId) return;

        setErro("");

        try {
            const novoStatus =
                !flashcard.active;

            const { error } = await supabase
                .from("flashcards")
                .update({
                    active: novoStatus,
                })
                .eq("id", flashcard.id)
                .eq("user_id", userId);

            if (error) throw error;

            setFlashcards((prev) =>
                prev.map((card) =>
                    card.id === flashcard.id
                        ? {
                            ...card,
                            active:
                                novoStatus,
                        }
                        : card
                )
            );

            setMsg(
                novoStatus
                    ? "Flashcard reativado."
                    : "Flashcard pausado."
            );
        } catch (e: any) {
            setErro(
                e?.message ||
                "Não foi possível alterar o flashcard."
            );
        }
    }

    /* =========================
     * DELETE
     * ========================= */

    async function excluirFlashcard(
        flashcard: Flashcard
    ) {
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
                .eq("id", flashcard.id)
                .eq("user_id", userId);

            if (error) throw error;

            setFlashcards((prev) =>
                prev.filter(
                    (card) =>
                        card.id !== flashcard.id
                )
            );

            setMsg("Flashcard excluído.");
        } catch (e: any) {
            setErro(
                e?.message ||
                "Não foi possível excluir o flashcard."
            );
        }
    }

    /* =========================
     * REVIEW
     * ========================= */

    function iniciarRevisao() {
        setReviewIndex(0);
        setShowBack(false);
        setReviewMode(true);
        setErro("");
    }

    function sairRevisao() {
        setReviewMode(false);
        setReviewIndex(0);
        setShowBack(false);
    }

    async function registrarResultadoRevisao(
        resultado: ReviewResult
    ) {
        if (!userId) return;

        const card =
            flashcardsRevisao[reviewIndex];

        if (!card) return;

        setReviewSaving(true);
        setErro("");

        try {
            /*
             * Esta tabela registra o histórico da
             * revisão sem inventar a próxima data.
             *
             * A agenda futura pode depois ser
             * integrada à página /revisao.
             */
            const { error } = await supabase
                .from("flashcard_reviews")
                .insert({
                    user_id: userId,
                    flashcard_id: card.id,
                    resultado,
                    created_at:
                        new Date().toISOString(),
                });

            if (error) throw error;

            setShowBack(false);
            setReviewIndex(
                (current) => current + 1
            );
        } catch (e: any) {
            setErro(
                e?.message ||
                "Não foi possível registrar a revisão."
            );
        } finally {
            setReviewSaving(false);
        }
    }

    /* =========================
     * NAVIGATION
     * ========================= */

    function entrarDisciplina(id: string) {
        setMateriaSel(id);
        setAssuntoSel(null);
        setReviewMode(false);
        setViewLevel("assuntos");
    }

    function entrarAssunto(id: string) {
        setAssuntoSel(id);
        setReviewMode(false);
        setReviewIndex(0);
        setShowBack(false);
        setViewLevel("flashcards");
    }

    function voltarParaDisciplinas() {
        setMateriaSel(null);
        setAssuntoSel(null);
        setReviewMode(false);
        setViewLevel("disciplinas");
    }

    function voltarParaAssuntos() {
        setAssuntoSel(null);
        setReviewMode(false);
        setViewLevel("assuntos");
    }

    /* =========================
     * CATEGORY CARD
     * ========================= */

    function CategoryCard({
        title,
        total,
        ativos,
        onClick,
    }: {
        title: string;
        total: number;
        ativos: number;
        onClick: () => void;
    }) {
        if (viewMode === "list") {
            return (
                <button
                    type="button"
                    onClick={onClick}
                    className="
                        w-full flex items-center
                        justify-between gap-4
                        border border-border
                        bg-card rounded-xl
                        px-4 py-3
                        hover:bg-muted
                        transition
                    "
                >
                    <div className="flex items-center gap-3 min-w-0">
                        <div
                            className="
                                bg-primary/10
                                text-primary
                                p-2 rounded-lg
                                shrink-0
                            "
                        >
                            <Brain size={18} />
                        </div>

                        <div className="text-left min-w-0">
                            <div className="font-medium truncate">
                                {title}
                            </div>

                            <div className="text-xs text-muted-foreground">
                                {pluralFlashcards(
                                    total
                                )}
                            </div>
                        </div>
                    </div>

                    {ativos !== total && (
                        <span
                            className="
                                shrink-0
                                text-xs
                                rounded-full
                                bg-muted
                                px-2 py-1
                                text-muted-foreground
                            "
                        >
                            {ativos} ativos
                        </span>
                    )}
                </button>
            );
        }

        return (
            <button
                type="button"
                onClick={onClick}
                className="
                    bg-card
                    border border-border
                    rounded-2xl
                    p-6
                    flex flex-col
                    items-center
                    text-center
                    hover:shadow-md
                    transition
                "
            >
                <div
                    className="
                        bg-primary/10
                        text-primary
                        p-4 rounded-xl
                        mb-4
                    "
                >
                    <Brain size={26} />
                </div>

                <h3 className="font-semibold text-lg">
                    {title}
                </h3>

                <p className="text-sm text-muted-foreground mt-2">
                    {pluralFlashcards(total)}
                </p>

                {ativos !== total && (
                    <p className="text-xs text-muted-foreground mt-1">
                        {ativos} ativos
                    </p>
                )}
            </button>
        );
    }

    /* =========================
     * LOADING
     * ========================= */

    if (loading) {
        return (
            <main className="min-h-[60vh] flex items-center justify-center px-4">
                <div className="flex flex-col items-center gap-3">
                    <Brain
                        size={30}
                        className="text-primary animate-pulse"
                    />

                    <span className="text-sm text-muted-foreground">
                        Carregando flashcards...
                    </span>
                </div>
            </main>
        );
    }

    /* =========================
     * UI
     * ========================= */

    return (
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 md:py-10">
            {/* HEADER */}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div>
                    <div className="flex items-center gap-3">
                        <div
                            className="
                                w-11 h-11
                                rounded-xl
                                bg-primary/10
                                text-primary
                                flex items-center
                                justify-center
                            "
                        >
                            <Brain size={24} />
                        </div>

                        <div>
                            <h1 className="text-2xl font-semibold">
                                Meus Flashcards
                            </h1>

                            <p className="text-sm text-muted-foreground mt-0.5">
                                Memorize conceitos, regras,
                                prazos e exceções
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {!reviewMode && (
                        <div
                            className="
                                flex bg-muted
                                border border-border
                                rounded-xl p-1
                            "
                        >
                            <button
                                type="button"
                                aria-label="Visualização em grade"
                                onClick={() =>
                                    setViewMode(
                                        "grid"
                                    )
                                }
                                className={`p-2 rounded-lg transition ${viewMode ===
                                        "grid"
                                        ? "bg-background shadow"
                                        : "text-muted-foreground"
                                    }`}
                            >
                                <LayoutGrid
                                    size={18}
                                />
                            </button>

                            <button
                                type="button"
                                aria-label="Visualização em lista"
                                onClick={() =>
                                    setViewMode(
                                        "list"
                                    )
                                }
                                className={`p-2 rounded-lg transition ${viewMode ===
                                        "list"
                                        ? "bg-background shadow"
                                        : "text-muted-foreground"
                                    }`}
                            >
                                <List size={18} />
                            </button>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={
                            abrirNovoFlashcard
                        }
                        className="
                            inline-flex
                            items-center
                            justify-center
                            gap-2
                            bg-primary
                            text-primary-foreground
                            px-4 py-2.5
                            rounded-xl
                            font-medium
                            hover:opacity-90
                            transition
                        "
                    >
                        <Plus size={18} />
                        <span className="hidden sm:inline">
                            Novo flashcard
                        </span>
                        <span className="sm:hidden">
                            Novo
                        </span>
                    </button>
                </div>
            </div>

            {/* MENSAGENS */}

            {erro && (
                <div
                    className="
                        mb-6
                        rounded-xl
                        border
                        border-destructive/30
                        bg-destructive/10
                        px-4 py-3
                        text-sm
                        text-destructive
                    "
                >
                    {erro}
                </div>
            )}

            {msg && !erro && (
                <div
                    className="
                        mb-6
                        rounded-xl
                        border border-border
                        bg-muted/50
                        px-4 py-3
                        text-sm
                    "
                >
                    {msg}
                </div>
            )}

            {/* BREADCRUMB */}

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mb-6">
                <button
                    type="button"
                    onClick={
                        voltarParaDisciplinas
                    }
                    className="hover:text-foreground"
                >
                    Flashcards
                </button>

                {materiaSel && (
                    <>
                        <span>/</span>

                        <button
                            type="button"
                            onClick={() => {
                                setAssuntoSel(null);
                                setReviewMode(
                                    false
                                );
                                setViewLevel(
                                    "assuntos"
                                );
                            }}
                            className="hover:text-foreground"
                        >
                            {materiaSel ===
                                "SEM_MATERIA"
                                ? "Sem disciplina"
                                : nomeMateria(
                                    materiaSel
                                )}
                        </button>
                    </>
                )}

                {assuntoSel && (
                    <>
                        <span>/</span>

                        <span className="text-foreground">
                            {assuntoSel ===
                                "SEM_ASSUNTO"
                                ? "Sem assunto"
                                : nomeAssunto(
                                    assuntoSel
                                )}
                        </span>
                    </>
                )}
            </div>

            {/* =========================
                DISCIPLINAS
            ========================= */}

            {viewLevel ===
                "disciplinas" && (
                    <>
                        {disciplinasAgrupadas.length ===
                            0 ? (
                            <EmptyState
                                title="Nenhum flashcard criado"
                                description="Crie seu primeiro flashcard e vincule-o a um edital, disciplina e assunto."
                                onCreate={
                                    abrirNovoFlashcard
                                }
                            />
                        ) : (
                            <div
                                className={
                                    viewMode ===
                                        "grid"
                                        ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
                                        : "space-y-3"
                                }
                            >
                                {disciplinasAgrupadas.map(
                                    (item) => (
                                        <CategoryCard
                                            key={
                                                item.id
                                            }
                                            title={
                                                item.nome
                                            }
                                            total={
                                                item.total
                                            }
                                            ativos={
                                                item.ativos
                                            }
                                            onClick={() =>
                                                entrarDisciplina(
                                                    item.id
                                                )
                                            }
                                        />
                                    )
                                )}
                            </div>
                        )}
                    </>
                )}

            {/* =========================
                ASSUNTOS
            ========================= */}

            {viewLevel === "assuntos" && (
                <>
                    <button
                        type="button"
                        className="
                            inline-flex
                            items-center
                            gap-1
                            mb-6
                            text-sm
                            text-muted-foreground
                            hover:text-foreground
                        "
                        onClick={
                            voltarParaDisciplinas
                        }
                    >
                        <ChevronLeft size={16} />
                        Voltar
                    </button>

                    {assuntosAgrupados.length ===
                        0 ? (
                        <EmptyState
                            title="Nenhum assunto com flashcards"
                            description="Ainda não existem flashcards nesta disciplina."
                            onCreate={
                                abrirNovoFlashcard
                            }
                        />
                    ) : (
                        <div
                            className={
                                viewMode ===
                                    "grid"
                                    ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
                                    : "space-y-3"
                            }
                        >
                            {assuntosAgrupados.map(
                                (item) => (
                                    <CategoryCard
                                        key={
                                            item.id
                                        }
                                        title={
                                            item.nome
                                        }
                                        total={
                                            item.total
                                        }
                                        ativos={
                                            item.ativos
                                        }
                                        onClick={() =>
                                            entrarAssunto(
                                                item.id
                                            )
                                        }
                                    />
                                )
                            )}
                        </div>
                    )}
                </>
            )}

            {/* =========================
                FLASHCARDS
            ========================= */}

            {viewLevel ===
                "flashcards" &&
                !reviewMode && (
                    <>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                            <button
                                type="button"
                                className="
                                    inline-flex
                                    items-center
                                    gap-1
                                    text-sm
                                    text-muted-foreground
                                    hover:text-foreground
                                "
                                onClick={
                                    voltarParaAssuntos
                                }
                            >
                                <ChevronLeft
                                    size={16}
                                />
                                Voltar
                            </button>

                            {flashcardsRevisao.length >
                                0 && (
                                    <button
                                        type="button"
                                        onClick={
                                            iniciarRevisao
                                        }
                                        className="
                                        inline-flex
                                        items-center
                                        justify-center
                                        gap-2
                                        border
                                        border-border
                                        bg-card
                                        px-4 py-2
                                        rounded-xl
                                        hover:bg-muted
                                        transition
                                    "
                                    >
                                        <RotateCcw
                                            size={17}
                                        />
                                        Revisar ativos
                                    </button>
                                )}
                        </div>

                        {flashcardsFiltrados.length ===
                            0 ? (
                            <EmptyState
                                title="Nenhum flashcard neste assunto"
                                description="Adicione cartões curtos e objetivos para memorizar os pontos importantes."
                                onCreate={
                                    abrirNovoFlashcard
                                }
                            />
                        ) : (
                            <div className="space-y-4">
                                {flashcardsFiltrados.map(
                                    (
                                        flashcard,
                                        index
                                    ) => (
                                        <div
                                            key={
                                                flashcard.id
                                            }
                                            className={`
                                                bg-card
                                                border
                                                rounded-2xl
                                                p-5
                                                ${flashcard.active
                                                    ? "border-border"
                                                    : "border-border opacity-60"
                                                }
                                            `}
                                        >
                                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                                <div className="flex gap-4 min-w-0">
                                                    <div
                                                        className="
                                                            w-10 h-10
                                                            shrink-0
                                                            rounded-xl
                                                            bg-primary/10
                                                            text-primary
                                                            flex
                                                            items-center
                                                            justify-center
                                                        "
                                                    >
                                                        <Brain
                                                            size={
                                                                20
                                                            }
                                                        />
                                                    </div>

                                                    <div className="min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2 mb-2">
                                                            <span className="text-xs text-muted-foreground">
                                                                Flashcard{" "}
                                                                {index +
                                                                    1}
                                                            </span>

                                                            {!flashcard.active && (
                                                                <span
                                                                    className="
                                                                        text-xs
                                                                        rounded-full
                                                                        bg-muted
                                                                        px-2 py-0.5
                                                                        text-muted-foreground
                                                                    "
                                                                >
                                                                    Pausado
                                                                </span>
                                                            )}

                                                            {flashcard.questao_origem_id && (
                                                                <span
                                                                    className="
                                                                        text-xs
                                                                        rounded-full
                                                                        bg-primary/10
                                                                        text-primary
                                                                        px-2 py-0.5
                                                                    "
                                                                >
                                                                    Criado
                                                                    de
                                                                    questão
                                                                </span>
                                                            )}
                                                        </div>

                                                        <p className="font-semibold leading-relaxed">
                                                            {
                                                                flashcard.frente
                                                            }
                                                        </p>

                                                        <div
                                                            className="
                                                                mt-3
                                                                rounded-xl
                                                                bg-muted/50
                                                                px-4 py-3
                                                            "
                                                        >
                                                            <p className="text-xs font-medium text-muted-foreground mb-1">
                                                                Verso
                                                            </p>

                                                            <p className="text-sm whitespace-pre-wrap">
                                                                {
                                                                    flashcard.verso
                                                                }
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-1 shrink-0">
                                                    <button
                                                        type="button"
                                                        title="Editar"
                                                        onClick={() =>
                                                            abrirEditarFlashcard(
                                                                flashcard
                                                            )
                                                        }
                                                        className="
                                                            p-2
                                                            rounded-lg
                                                            text-muted-foreground
                                                            hover:text-foreground
                                                            hover:bg-muted
                                                            transition
                                                        "
                                                    >
                                                        <Pencil
                                                            size={
                                                                17
                                                            }
                                                        />
                                                    </button>

                                                    <button
                                                        type="button"
                                                        title={
                                                            flashcard.active
                                                                ? "Pausar"
                                                                : "Reativar"
                                                        }
                                                        onClick={() =>
                                                            alternarAtivo(
                                                                flashcard
                                                            )
                                                        }
                                                        className="
                                                            p-2
                                                            rounded-lg
                                                            text-muted-foreground
                                                            hover:text-foreground
                                                            hover:bg-muted
                                                            transition
                                                        "
                                                    >
                                                        {flashcard.active ? (
                                                            <Pause
                                                                size={
                                                                    17
                                                                }
                                                            />
                                                        ) : (
                                                            <Play
                                                                size={
                                                                    17
                                                                }
                                                            />
                                                        )}
                                                    </button>

                                                    <button
                                                        type="button"
                                                        title="Excluir"
                                                        onClick={() =>
                                                            excluirFlashcard(
                                                                flashcard
                                                            )
                                                        }
                                                        className="
                                                            p-2
                                                            rounded-lg
                                                            text-muted-foreground
                                                            hover:text-destructive
                                                            hover:bg-destructive/10
                                                            transition
                                                        "
                                                    >
                                                        <Trash2
                                                            size={
                                                                17
                                                            }
                                                        />
                                                    </button>
                                                </div>
                                            </div>

                                            <p className="mt-4 text-xs text-muted-foreground">
                                                Criado em{" "}
                                                {new Date(
                                                    flashcard.created_at
                                                ).toLocaleDateString(
                                                    "pt-BR"
                                                )}
                                            </p>
                                        </div>
                                    )
                                )}
                            </div>
                        )}
                    </>
                )}

            {/* =========================
                REVIEW MODE
            ========================= */}

            {viewLevel ===
                "flashcards" &&
                reviewMode && (
                    <ReviewArea
                        cards={
                            flashcardsRevisao
                        }
                        index={reviewIndex}
                        showBack={showBack}
                        saving={reviewSaving}
                        onReveal={() =>
                            setShowBack(true)
                        }
                        onResult={
                            registrarResultadoRevisao
                        }
                        onExit={
                            sairRevisao
                        }
                    />
                )}

            {/* =========================
                MODAL
            ========================= */}

            {modalOpen && (
                <div
                    className="
                        fixed inset-0
                        z-[100]
                        flex items-center
                        justify-center
                        px-4
                    "
                >
                    <div
                        className="
                            absolute inset-0
                            bg-black/60
                        "
                        onClick={
                            saving
                                ? undefined
                                : fecharModal
                        }
                    />

                    <div
                        className="
                            relative
                            z-[101]
                            w-full
                            max-w-2xl
                            max-h-[90vh]
                            overflow-y-auto
                            rounded-2xl
                            border
                            border-border
                            bg-card
                            shadow-xl
                        "
                    >
                        <div
                            className="
                                sticky top-0
                                bg-card
                                flex items-center
                                justify-between
                                px-5 py-4
                                border-b
                                border-border
                                z-10
                            "
                        >
                            <div>
                                <h2 className="text-lg font-semibold">
                                    {modalMode ===
                                        "edit"
                                        ? "Editar flashcard"
                                        : "Novo flashcard"}
                                </h2>

                                <p className="text-xs text-muted-foreground mt-1">
                                    Mantenha a
                                    informação curta e
                                    objetiva.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={
                                    fecharModal
                                }
                                disabled={saving}
                                className="
                                    p-2
                                    rounded-lg
                                    hover:bg-muted
                                "
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-5 space-y-5">
                            <div>
                                <label className="block text-sm font-medium mb-2">
                                    Edital
                                </label>

                                <select
                                    value={
                                        formEditalId
                                    }
                                    onChange={(
                                        e
                                    ) => {
                                        setFormEditalId(
                                            e.target
                                                .value
                                        );

                                        setFormMateriaId(
                                            ""
                                        );

                                        setFormAssuntoId(
                                            ""
                                        );
                                    }}
                                    className="
                                        w-full
                                        rounded-xl
                                        border
                                        border-border
                                        bg-background
                                        px-3 py-2.5
                                        outline-none
                                        focus:ring-2
                                        focus:ring-primary/30
                                    "
                                >
                                    <option value="">
                                        Selecione
                                        o edital
                                    </option>

                                    {editais.map(
                                        (edital) => (
                                            <option
                                                key={
                                                    edital.id
                                                }
                                                value={
                                                    edital.id
                                                }
                                            >
                                                {
                                                    edital.nome
                                                }
                                            </option>
                                        )
                                    )}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2">
                                    Disciplina
                                </label>

                                <select
                                    value={
                                        formMateriaId
                                    }
                                    disabled={
                                        !formEditalId
                                    }
                                    onChange={(
                                        e
                                    ) => {
                                        setFormMateriaId(
                                            e.target
                                                .value
                                        );

                                        setFormAssuntoId(
                                            ""
                                        );
                                    }}
                                    className="
                                        w-full
                                        rounded-xl
                                        border
                                        border-border
                                        bg-background
                                        px-3 py-2.5
                                        outline-none
                                        disabled:opacity-50
                                        focus:ring-2
                                        focus:ring-primary/30
                                    "
                                >
                                    <option value="">
                                        Selecione
                                        a
                                        disciplina
                                    </option>

                                    {materiasForm.map(
                                        (materia) => (
                                            <option
                                                key={
                                                    materia.id
                                                }
                                                value={
                                                    materia.id
                                                }
                                            >
                                                {
                                                    materia.nome
                                                }
                                            </option>
                                        )
                                    )}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2">
                                    Assunto
                                </label>

                                <select
                                    value={
                                        formAssuntoId
                                    }
                                    disabled={
                                        !formMateriaId
                                    }
                                    onChange={(
                                        e
                                    ) =>
                                        setFormAssuntoId(
                                            e.target
                                                .value
                                        )
                                    }
                                    className="
                                        w-full
                                        rounded-xl
                                        border
                                        border-border
                                        bg-background
                                        px-3 py-2.5
                                        outline-none
                                        disabled:opacity-50
                                        focus:ring-2
                                        focus:ring-primary/30
                                    "
                                >
                                    <option value="">
                                        Selecione
                                        o assunto
                                    </option>

                                    {assuntosForm.map(
                                        (assunto) => (
                                            <option
                                                key={
                                                    assunto.id
                                                }
                                                value={
                                                    assunto.id
                                                }
                                            >
                                                {
                                                    assunto.nome
                                                }
                                            </option>
                                        )
                                    )}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2">
                                    Frente
                                </label>

                                <textarea
                                    value={
                                        formFrente
                                    }
                                    onChange={(
                                        e
                                    ) =>
                                        setFormFrente(
                                            e.target
                                                .value
                                        )
                                    }
                                    rows={4}
                                    maxLength={
                                        2000
                                    }
                                    placeholder="Ex.: Qual é o prazo para..."
                                    className="
                                        w-full
                                        resize-y
                                        rounded-xl
                                        border
                                        border-border
                                        bg-background
                                        px-3 py-3
                                        outline-none
                                        focus:ring-2
                                        focus:ring-primary/30
                                    "
                                />

                                <p className="text-right text-xs text-muted-foreground mt-1">
                                    {
                                        formFrente.length
                                    }
                                    /2000
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2">
                                    Verso
                                </label>

                                <textarea
                                    value={
                                        formVerso
                                    }
                                    onChange={(
                                        e
                                    ) =>
                                        setFormVerso(
                                            e.target
                                                .value
                                        )
                                    }
                                    rows={6}
                                    maxLength={
                                        4000
                                    }
                                    placeholder="Resposta curta, objetiva e suficiente para testar a informação."
                                    className="
                                        w-full
                                        resize-y
                                        rounded-xl
                                        border
                                        border-border
                                        bg-background
                                        px-3 py-3
                                        outline-none
                                        focus:ring-2
                                        focus:ring-primary/30
                                    "
                                />

                                <p className="text-right text-xs text-muted-foreground mt-1">
                                    {
                                        formVerso.length
                                    }
                                    /4000
                                </p>
                            </div>
                        </div>

                        <div
                            className="
                                sticky bottom-0
                                bg-card
                                border-t
                                border-border
                                px-5 py-4
                                flex
                                justify-end
                                gap-3
                            "
                        >
                            <button
                                type="button"
                                disabled={saving}
                                onClick={
                                    fecharModal
                                }
                                className="
                                    px-4 py-2
                                    rounded-xl
                                    border
                                    border-border
                                    hover:bg-muted
                                    disabled:opacity-50
                                "
                            >
                                Cancelar
                            </button>

                            <button
                                type="button"
                                disabled={saving}
                                onClick={
                                    salvarFlashcard
                                }
                                className="
                                    px-5 py-2
                                    rounded-xl
                                    bg-primary
                                    text-primary-foreground
                                    font-medium
                                    hover:opacity-90
                                    disabled:opacity-50
                                "
                            >
                                {saving
                                    ? "Salvando..."
                                    : modalMode ===
                                        "edit"
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

/* =========================
 * EMPTY STATE
 * ========================= */

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
        <div
            className="
                min-h-[300px]
                rounded-2xl
                border
                border-dashed
                border-border
                bg-card
                flex
                flex-col
                items-center
                justify-center
                text-center
                px-6
                py-12
            "
        >
            <div
                className="
                    w-14 h-14
                    rounded-2xl
                    bg-primary/10
                    text-primary
                    flex
                    items-center
                    justify-center
                    mb-4
                "
            >
                <Brain size={28} />
            </div>

            <h2 className="font-semibold text-lg">
                {title}
            </h2>

            <p className="mt-2 text-sm text-muted-foreground max-w-md">
                {description}
            </p>

            <button
                type="button"
                onClick={onCreate}
                className="
                    mt-5
                    inline-flex
                    items-center
                    gap-2
                    bg-primary
                    text-primary-foreground
                    px-4 py-2
                    rounded-xl
                    font-medium
                    hover:opacity-90
                "
            >
                <Plus size={17} />
                Novo flashcard
            </button>
        </div>
    );
}

/* =========================
 * REVIEW AREA
 * ========================= */

function ReviewArea({
    cards,
    index,
    showBack,
    saving,
    onReveal,
    onResult,
    onExit,
}: {
    cards: Flashcard[];
    index: number;
    showBack: boolean;
    saving: boolean;
    onReveal: () => void;
    onResult: (
        result: ReviewResult
    ) => Promise<void>;
    onExit: () => void;
}) {
    const finished = index >= cards.length;

    if (!cards.length) {
        return (
            <div className="text-center py-16">
                <Brain
                    size={36}
                    className="mx-auto text-muted-foreground mb-4"
                />

                <h2 className="text-lg font-semibold">
                    Nenhum flashcard ativo
                </h2>

                <p className="text-sm text-muted-foreground mt-2">
                    Reative algum flashcard para
                    iniciar uma revisão.
                </p>

                <button
                    type="button"
                    onClick={onExit}
                    className="
                        mt-5
                        border
                        border-border
                        px-4 py-2
                        rounded-xl
                        hover:bg-muted
                    "
                >
                    Voltar
                </button>
            </div>
        );
    }

    if (finished) {
        return (
            <div
                className="
                    max-w-xl
                    mx-auto
                    text-center
                    border
                    border-border
                    bg-card
                    rounded-2xl
                    p-10
                "
            >
                <CheckCircle2
                    size={48}
                    className="mx-auto text-primary mb-4"
                />

                <h2 className="text-xl font-semibold">
                    Revisão concluída
                </h2>

                <p className="text-sm text-muted-foreground mt-2">
                    Você revisou {cards.length}{" "}
                    {cards.length === 1
                        ? "flashcard"
                        : "flashcards"}
                    .
                </p>

                <button
                    type="button"
                    onClick={onExit}
                    className="
                        mt-6
                        bg-primary
                        text-primary-foreground
                        px-5 py-2
                        rounded-xl
                        font-medium
                    "
                >
                    Concluir
                </button>
            </div>
        );
    }

    const card = cards[index];

    return (
        <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between gap-4 mb-6">
                <button
                    type="button"
                    onClick={onExit}
                    className="
                        inline-flex
                        items-center
                        gap-1
                        text-sm
                        text-muted-foreground
                        hover:text-foreground
                    "
                >
                    <ChevronLeft size={16} />
                    Sair da revisão
                </button>

                <span className="text-sm text-muted-foreground">
                    {index + 1} de {cards.length}
                </span>
            </div>

            <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-6">
                <div
                    className="h-full bg-primary transition-all"
                    style={{
                        width: `${((index + 1) /
                                cards.length) *
                            100
                            }%`,
                    }}
                />
            </div>

            <div
                className="
                    border
                    border-border
                    bg-card
                    rounded-3xl
                    shadow-sm
                    overflow-hidden
                "
            >
                <div className="p-7 sm:p-10">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
                        <Brain
                            size={16}
                            className="text-primary"
                        />
                        Frente
                    </div>

                    <p
                        className="
                            text-xl
                            sm:text-2xl
                            leading-relaxed
                            font-semibold
                            whitespace-pre-wrap
                        "
                    >
                        {card.frente}
                    </p>

                    {!showBack && (
                        <button
                            type="button"
                            onClick={onReveal}
                            className="
                                mt-8
                                w-full
                                inline-flex
                                items-center
                                justify-center
                                gap-2
                                border
                                border-border
                                rounded-xl
                                py-3
                                font-medium
                                hover:bg-muted
                                transition
                            "
                        >
                            <Eye size={18} />
                            Mostrar resposta
                        </button>
                    )}

                    {showBack && (
                        <>
                            <div className="my-8 border-t border-border" />

                            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                                <RotateCcw
                                    size={15}
                                    className="text-primary"
                                />
                                Verso
                            </div>

                            <div
                                className="
                                    rounded-2xl
                                    bg-muted/50
                                    p-5
                                "
                            >
                                <p className="leading-relaxed whitespace-pre-wrap">
                                    {card.verso}
                                </p>
                            </div>

                            <div className="mt-8">
                                <p className="text-center text-sm text-muted-foreground mb-4">
                                    Você lembrou
                                    corretamente?
                                </p>

                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        disabled={
                                            saving
                                        }
                                        onClick={() =>
                                            onResult(
                                                "ERRO"
                                            )
                                        }
                                        className="
                                            inline-flex
                                            items-center
                                            justify-center
                                            gap-2
                                            rounded-xl
                                            border
                                            border-destructive/30
                                            bg-destructive/10
                                            text-destructive
                                            py-3
                                            font-semibold
                                            hover:bg-destructive/15
                                            disabled:opacity-50
                                        "
                                    >
                                        <XCircle
                                            size={19}
                                        />
                                        Errei
                                    </button>

                                    <button
                                        type="button"
                                        disabled={
                                            saving
                                        }
                                        onClick={() =>
                                            onResult(
                                                "ACERTO"
                                            )
                                        }
                                        className="
                                            inline-flex
                                            items-center
                                            justify-center
                                            gap-2
                                            rounded-xl
                                            bg-primary
                                            text-primary-foreground
                                            py-3
                                            font-semibold
                                            hover:opacity-90
                                            disabled:opacity-50
                                        "
                                    >
                                        <CheckCircle2
                                            size={19}
                                        />
                                        Acertei
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <p className="text-center text-xs text-muted-foreground mt-5">
                {truncate(card.frente, 80)}
            </p>
        </div>
    );
}