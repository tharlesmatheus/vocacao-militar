"use client";

import { useEffect, useMemo, useState } from "react";
import {
    BookOpen,
    ChevronLeft,
    Eye,
    LayoutGrid,
    List,
    Pencil,
    Plus,
    RotateCcw,
    Trash2,
    X,
} from "lucide-react";

import { supabase } from "@/lib/supabaseClient";

/* ============================================================================
 * Tipos
 * ========================================================================== */

type Resumo = {
    id: string;
    user_id: string;
    titulo: string;
    conteudo: string;
    created_at: string;
    materia_id: string | null;
    assunto_id: string | null;
    disciplina_catalogo_id: string | null;
    assunto_catalogo_id: string | null;
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

type LegacyMateria = {
    id: string;
    nome: string;
};

type LegacyAssunto = {
    id: string;
    materia_id: string | null;
    nome: string;
};

type ViewLevel = "disciplinas" | "assuntos" | "resumos";
type ViewMode = "grid" | "list";
type ModalMode = "create" | "edit";

/* ============================================================================
 * Helpers
 * ========================================================================== */

function normalizar(valor: string) {
    return valor
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR")
        .replace(/[^a-z0-9]+/g, "");
}

function mensagemErro(error: unknown) {
    if (error instanceof Error) return error.message;

    if (error && typeof error === "object" && "message" in error) {
        return String((error as { message?: unknown }).message ?? "Erro inesperado.");
    }

    return "Erro inesperado.";
}

function pluralResumo(total: number) {
    return total === 1 ? "1 resumo" : `${total} resumos`;
}

/* ============================================================================
 * Página
 * ========================================================================== */

export default function ResumosPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");

    const [userId, setUserId] = useState<string | null>(null);

    const [resumos, setResumos] = useState<Resumo[]>([]);
    const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
    const [assuntos, setAssuntos] = useState<Assunto[]>([]);

    // Compatibilidade temporária com resumos antigos.
    const [legacyMaterias, setLegacyMaterias] = useState<LegacyMateria[]>([]);
    const [legacyAssuntos, setLegacyAssuntos] = useState<LegacyAssunto[]>([]);

    const [viewLevel, setViewLevel] = useState<ViewLevel>("disciplinas");
    const [viewMode, setViewMode] = useState<ViewMode>("grid");
    const [disciplinaSel, setDisciplinaSel] = useState<string | null>(null);
    const [assuntoSel, setAssuntoSel] = useState<string | null>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<ModalMode>("create");
    const [editingId, setEditingId] = useState<string | null>(null);

    const [formDisciplinaId, setFormDisciplinaId] = useState("");
    const [formAssuntoId, setFormAssuntoId] = useState("");
    const [formTitulo, setFormTitulo] = useState("");
    const [formConteudo, setFormConteudo] = useState("");

    const [viewer, setViewer] = useState<Resumo | null>(null);

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
                resumosReq,
                disciplinasReq,
                assuntosReq,
                legacyMateriasReq,
                legacyAssuntosReq,
            ] = await Promise.all([
                supabase
                    .from("resumos")
                    .select(`
                        id,
                        user_id,
                        titulo,
                        conteudo,
                        created_at,
                        materia_id,
                        assunto_id,
                        disciplina_catalogo_id,
                        assunto_catalogo_id
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

                supabase
                    .from("materias")
                    .select("id,nome")
                    .eq("user_id", uid),

                supabase
                    .from("assuntos")
                    .select("id,materia_id,nome")
                    .eq("user_id", uid),
            ]);

            const firstError =
                resumosReq.error ||
                disciplinasReq.error ||
                assuntosReq.error ||
                legacyMateriasReq.error ||
                legacyAssuntosReq.error;

            if (firstError) throw firstError;

            setResumos((resumosReq.data ?? []) as Resumo[]);
            setDisciplinas((disciplinasReq.data ?? []) as Disciplina[]);
            setAssuntos((assuntosReq.data ?? []) as Assunto[]);
            setLegacyMaterias((legacyMateriasReq.data ?? []) as LegacyMateria[]);
            setLegacyAssuntos((legacyAssuntosReq.data ?? []) as LegacyAssunto[]);
        } catch (e) {
            setErro(
                `${mensagemErro(e)} Se o erro mencionar disciplina_catalogo_id, execute primeiro a migração SQL do catálogo.`
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void carregarDados();
    }, []);

    /* ------------------------------------------------------------------------
     * Mapas / fallback legado
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

    const disciplinaPorNome = useMemo(() => {
        const map = new Map<string, Disciplina>();
        disciplinas.forEach((item) => map.set(normalizar(item.nome), item));
        return map;
    }, [disciplinas]);

    const legacyMateriaMap = useMemo(() => {
        const map = new Map<string, LegacyMateria>();
        legacyMaterias.forEach((item) => map.set(item.id, item));
        return map;
    }, [legacyMaterias]);

    const legacyAssuntoMap = useMemo(() => {
        const map = new Map<string, LegacyAssunto>();
        legacyAssuntos.forEach((item) => map.set(item.id, item));
        return map;
    }, [legacyAssuntos]);

    function disciplinaEfetivaId(resumo: Resumo) {
        if (
            resumo.disciplina_catalogo_id &&
            disciplinaMap.has(resumo.disciplina_catalogo_id)
        ) {
            return resumo.disciplina_catalogo_id;
        }

        if (resumo.materia_id) {
            const legacy = legacyMateriaMap.get(resumo.materia_id);

            if (legacy) {
                return disciplinaPorNome.get(normalizar(legacy.nome))?.id ?? null;
            }
        }

        return null;
    }

    function assuntoEfetivoId(resumo: Resumo) {
        const disciplinaId = disciplinaEfetivaId(resumo);

        if (
            resumo.assunto_catalogo_id &&
            assuntoMap.has(resumo.assunto_catalogo_id)
        ) {
            return resumo.assunto_catalogo_id;
        }

        if (!disciplinaId || !resumo.assunto_id) return null;

        const legacy = legacyAssuntoMap.get(resumo.assunto_id);
        if (!legacy) return null;

        return (
            assuntos.find(
                (item) =>
                    item.disciplina_id === disciplinaId &&
                    normalizar(item.nome) === normalizar(legacy.nome)
            )?.id ?? null
        );
    }

    function nomeDisciplina(id: string | null) {
        if (!id) return "Sem disciplina canônica";
        return disciplinaMap.get(id)?.nome ?? "Disciplina não encontrada";
    }

    function nomeAssunto(id: string | null) {
        if (!id) return "Sem assunto canônico";
        return assuntoMap.get(id)?.nome ?? "Assunto não encontrado";
    }

    /* ------------------------------------------------------------------------
     * Agrupamentos
     * ---------------------------------------------------------------------- */

    const disciplinasAgrupadas = useMemo(() => {
        const map = new Map<
            string,
            { id: string; nome: string; total: number }
        >();

        for (const resumo of resumos) {
            const id = disciplinaEfetivaId(resumo) ?? "SEM_DISCIPLINA";
            const atual = map.get(id);

            if (atual) {
                atual.total += 1;
            } else {
                map.set(id, {
                    id,
                    nome:
                        id === "SEM_DISCIPLINA"
                            ? "Sem disciplina canônica"
                            : nomeDisciplina(id),
                    total: 1,
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
        resumos,
        disciplinaMap,
        assuntoMap,
        legacyMateriaMap,
        legacyAssuntoMap,
        disciplinaPorNome,
    ]);

    const assuntosAgrupados = useMemo(() => {
        if (!disciplinaSel) return [];

        const map = new Map<
            string,
            { id: string; nome: string; total: number }
        >();

        for (const resumo of resumos) {
            const dId = disciplinaEfetivaId(resumo) ?? "SEM_DISCIPLINA";
            if (dId !== disciplinaSel) continue;

            const aId = assuntoEfetivoId(resumo) ?? "SEM_ASSUNTO";
            const atual = map.get(aId);

            if (atual) {
                atual.total += 1;
            } else {
                map.set(aId, {
                    id: aId,
                    nome:
                        aId === "SEM_ASSUNTO"
                            ? "Sem assunto canônico"
                            : nomeAssunto(aId),
                    total: 1,
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
        resumos,
        disciplinaSel,
        disciplinaMap,
        assuntoMap,
        legacyMateriaMap,
        legacyAssuntoMap,
        disciplinaPorNome,
    ]);

    const resumosFiltrados = useMemo(() => {
        if (!disciplinaSel || !assuntoSel) return [];

        return resumos.filter((resumo) => {
            const dId = disciplinaEfetivaId(resumo) ?? "SEM_DISCIPLINA";
            const aId = assuntoEfetivoId(resumo) ?? "SEM_ASSUNTO";

            return dId === disciplinaSel && aId === assuntoSel;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        resumos,
        disciplinaSel,
        assuntoSel,
        disciplinaMap,
        assuntoMap,
        legacyMateriaMap,
        legacyAssuntoMap,
        disciplinaPorNome,
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
        setFormTitulo("");
        setFormConteudo("");
    }

    function fecharModal() {
        if (saving) return;
        setModalOpen(false);
        limparFormulario();
    }

    function abrirNovoResumo() {
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

    function abrirEditarResumo(resumo: Resumo) {
        setViewer(null);
        setModalMode("edit");
        setEditingId(resumo.id);
        setFormDisciplinaId(disciplinaEfetivaId(resumo) ?? "");
        setFormAssuntoId(assuntoEfetivoId(resumo) ?? "");
        setFormTitulo(resumo.titulo);
        setFormConteudo(resumo.conteudo ?? "");
        setModalOpen(true);
    }

    async function salvarResumo() {
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

        if (!formTitulo.trim()) {
            setErro("Informe o título do resumo.");
            return;
        }

        if (!formConteudo.trim()) {
            setErro("Informe o conteúdo do resumo.");
            return;
        }

        setSaving(true);
        setErro("");
        setMsg("");

        try {
            const payload = {
                titulo: formTitulo.trim(),
                conteudo: formConteudo.trim(),
                disciplina_catalogo_id: formDisciplinaId,
                assunto_catalogo_id: formAssuntoId,
            };

            if (modalMode === "edit" && editingId) {
                const { data, error } = await supabase
                    .from("resumos")
                    .update(payload)
                    .eq("id", editingId)
                    .eq("user_id", userId)
                    .select(`
                        id,
                        user_id,
                        titulo,
                        conteudo,
                        created_at,
                        materia_id,
                        assunto_id,
                        disciplina_catalogo_id,
                        assunto_catalogo_id
                    `)
                    .single();

                if (error) throw error;

                setResumos((prev) =>
                    prev.map((item) =>
                        item.id === editingId ? (data as Resumo) : item
                    )
                );

                setMsg("Resumo atualizado com sucesso.");
            } else {
                const { data, error } = await supabase
                    .from("resumos")
                    .insert({
                        user_id: userId,
                        titulo: formTitulo.trim(),
                        conteudo: formConteudo.trim(),

                        // Classificação oficial.
                        disciplina_catalogo_id: formDisciplinaId,
                        assunto_catalogo_id: formAssuntoId,

                        // Legado não classifica novos resumos.
                        materia_id: null,
                        assunto_id: null,
                    })
                    .select(`
                        id,
                        user_id,
                        titulo,
                        conteudo,
                        created_at,
                        materia_id,
                        assunto_id,
                        disciplina_catalogo_id,
                        assunto_catalogo_id
                    `)
                    .single();

                if (error) throw error;

                setResumos((prev) => [data as Resumo, ...prev]);
                setMsg("Resumo criado com sucesso.");
            }

            setModalOpen(false);
            limparFormulario();
        } catch (e) {
            setErro(mensagemErro(e));
        } finally {
            setSaving(false);
        }
    }

    async function excluirResumo(resumo: Resumo) {
        if (!userId) return;

        const confirmado = window.confirm(
            `Excluir permanentemente o resumo "${resumo.titulo}"?`
        );

        if (!confirmado) return;

        setErro("");

        try {
            const { error } = await supabase
                .from("resumos")
                .delete()
                .eq("id", resumo.id)
                .eq("user_id", userId);

            if (error) throw error;

            setResumos((prev) =>
                prev.filter((item) => item.id !== resumo.id)
            );

            if (viewer?.id === resumo.id) {
                setViewer(null);
            }

            setMsg("Resumo excluído.");
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
        setViewLevel("resumos");
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

    function CategoryCard({
        title,
        count,
        onClick,
    }: {
        title: string;
        count: number;
        onClick: () => void;
    }) {
        if (viewMode === "list") {
            return (
                <button
                    type="button"
                    onClick={onClick}
                    className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left transition hover:bg-muted"
                >
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="shrink-0 rounded-lg bg-red-500 p-2 text-white">
                            <BookOpen size={18} />
                        </div>
                        <div className="min-w-0">
                            <div className="truncate font-medium">
                                {title}
                            </div>
                            <div className="text-xs text-muted-foreground">
                                {pluralResumo(count)}
                            </div>
                        </div>
                    </div>
                </button>
            );
        }

        return (
            <button
                type="button"
                onClick={onClick}
                className="flex flex-col items-center rounded-2xl border border-border bg-card p-6 text-center transition hover:shadow-md"
            >
                <div className="mb-4 rounded-xl bg-red-500 p-4 text-white">
                    <BookOpen size={26} />
                </div>

                <h3 className="text-lg font-semibold">{title}</h3>

                <p className="mt-2 text-sm text-muted-foreground">
                    {pluralResumo(count)}
                </p>
            </button>
        );
    }

    if (loading) {
        return (
            <main className="flex min-h-[60vh] items-center justify-center px-4">
                <div className="text-sm text-muted-foreground">
                    Carregando resumos...
                </div>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-6xl p-4 sm:p-6">
            <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">
                        Meus Resumos
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Biblioteca única por disciplina e assunto do catálogo canônico.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-xl border border-border bg-muted p-1">
                        <button
                            type="button"
                            onClick={() => setViewMode("grid")}
                            className={`rounded-lg p-2 ${viewMode === "grid"
                                    ? "bg-background shadow"
                                    : "text-muted-foreground"
                                }`}
                            aria-label="Visualização em grade"
                        >
                            <LayoutGrid size={18} />
                        </button>

                        <button
                            type="button"
                            onClick={() => setViewMode("list")}
                            className={`rounded-lg p-2 ${viewMode === "list"
                                    ? "bg-background shadow"
                                    : "text-muted-foreground"
                                }`}
                            aria-label="Visualização em lista"
                        >
                            <List size={18} />
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            window.location.href = "/revisao";
                        }}
                        className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 hover:bg-muted"
                    >
                        <RotateCcw size={17} />
                        Revisar
                    </button>

                    <button
                        type="button"
                        onClick={abrirNovoResumo}
                        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-medium text-primary-foreground"
                    >
                        <Plus size={18} />
                        Novo resumo
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

            <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <button
                    type="button"
                    onClick={voltarDisciplinas}
                    className="hover:text-foreground"
                >
                    Resumos
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
                                ? "Sem disciplina canônica"
                                : nomeDisciplina(disciplinaSel)}
                        </button>
                    </>
                )}

                {assuntoSel && (
                    <>
                        <span>/</span>
                        <span className="text-foreground">
                            {assuntoSel === "SEM_ASSUNTO"
                                ? "Sem assunto canônico"
                                : nomeAssunto(assuntoSel)}
                        </span>
                    </>
                )}
            </div>

            {viewLevel === "disciplinas" && (
                <>
                    {disciplinasAgrupadas.length === 0 ? (
                        <EmptyState
                            title="Nenhum resumo criado"
                            description="Crie seu primeiro resumo e classifique-o pelo catálogo canônico."
                            onCreate={abrirNovoResumo}
                        />
                    ) : (
                        <div
                            className={
                                viewMode === "grid"
                                    ? "grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
                                    : "space-y-3"
                            }
                        >
                            {disciplinasAgrupadas.map((item) => (
                                <CategoryCard
                                    key={item.id}
                                    title={item.nome}
                                    count={item.total}
                                    onClick={() =>
                                        entrarDisciplina(item.id)
                                    }
                                />
                            ))}
                        </div>
                    )}
                </>
            )}

            {viewLevel === "assuntos" && (
                <>
                    <button
                        type="button"
                        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                        onClick={voltarDisciplinas}
                    >
                        <ChevronLeft size={16} />
                        Voltar
                    </button>

                    {assuntosAgrupados.length === 0 ? (
                        <EmptyState
                            title="Nenhum assunto com resumos"
                            description="Ainda não existem resumos nessa disciplina."
                            onCreate={abrirNovoResumo}
                        />
                    ) : (
                        <div
                            className={
                                viewMode === "grid"
                                    ? "grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
                                    : "space-y-3"
                            }
                        >
                            {assuntosAgrupados.map((item) => (
                                <CategoryCard
                                    key={item.id}
                                    title={item.nome}
                                    count={item.total}
                                    onClick={() => entrarAssunto(item.id)}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}

            {viewLevel === "resumos" && (
                <>
                    <div className="mb-6 flex items-center justify-between gap-4">
                        <button
                            type="button"
                            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                            onClick={voltarAssuntos}
                        >
                            <ChevronLeft size={16} />
                            Voltar
                        </button>

                        <button
                            type="button"
                            onClick={abrirNovoResumo}
                            className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
                        >
                            <Plus size={16} />
                            Novo neste assunto
                        </button>
                    </div>

                    {resumosFiltrados.length === 0 ? (
                        <EmptyState
                            title="Nenhum resumo neste assunto"
                            description="Crie um resumo para consolidar os pontos mais importantes."
                            onCreate={abrirNovoResumo}
                        />
                    ) : (
                        <div className="space-y-3">
                            {resumosFiltrados.map((resumo) => (
                                <article
                                    key={resumo.id}
                                    className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="font-medium">
                                                {resumo.titulo}
                                            </p>

                                            {!resumo.disciplina_catalogo_id && (
                                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">
                                                    legado mapeado por nome
                                                </span>
                                            )}
                                        </div>

                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {new Date(
                                                resumo.created_at
                                            ).toLocaleDateString("pt-BR")}
                                        </p>

                                        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                                            {resumo.conteudo}
                                        </p>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setViewer(resumo)}
                                            title="Ver resumo"
                                            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                                        >
                                            <Eye size={17} />
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() =>
                                                abrirEditarResumo(resumo)
                                            }
                                            title="Editar"
                                            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                                        >
                                            <Pencil size={17} />
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() =>
                                                void excluirResumo(resumo)
                                            }
                                            title="Excluir"
                                            className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                        >
                                            <Trash2 size={17} />
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </>
            )}

            {viewer && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
                    <button
                        type="button"
                        aria-label="Fechar"
                        className="absolute inset-0 bg-black/60"
                        onClick={() => setViewer(null)}
                    />

                    <div className="relative z-[101] max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card shadow-xl">
                        <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-border bg-card px-5 py-4">
                            <div>
                                <h2 className="text-xl font-semibold">
                                    {viewer.titulo}
                                </h2>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {nomeDisciplina(
                                        disciplinaEfetivaId(viewer)
                                    )}{" "}
                                    •{" "}
                                    {nomeAssunto(
                                        assuntoEfetivoId(viewer)
                                    )}
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setViewer(null)}
                                className="rounded-lg p-2 hover:bg-muted"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-6">
                            <div className="whitespace-pre-wrap leading-7">
                                {viewer.conteudo}
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
                            <button
                                type="button"
                                onClick={() =>
                                    abrirEditarResumo(viewer)
                                }
                                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                            >
                                <Pencil size={16} />
                                Editar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {modalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
                    <button
                        type="button"
                        aria-label="Fechar"
                        className="absolute inset-0 bg-black/60"
                        onClick={fecharModal}
                    />

                    <div className="relative z-[101] max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card shadow-xl">
                        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card px-5 py-4">
                            <div>
                                <h2 className="text-lg font-semibold">
                                    {modalMode === "edit"
                                        ? "Editar resumo"
                                        : "Novo resumo"}
                                </h2>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Disciplina e assunto vêm somente do catálogo.
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
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="mb-2 block text-sm font-medium">
                                        Disciplina
                                    </label>
                                    <select
                                        value={formDisciplinaId}
                                        onChange={(e) => {
                                            setFormDisciplinaId(
                                                e.target.value
                                            );
                                            setFormAssuntoId("");
                                        }}
                                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary/30"
                                    >
                                        <option value="">
                                            Selecione
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
                                            setFormAssuntoId(
                                                e.target.value
                                            )
                                        }
                                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 outline-none disabled:opacity-50 focus:ring-2 focus:ring-primary/30"
                                    >
                                        <option value="">
                                            Selecione
                                        </option>

                                        {assuntosDoFormulario.map(
                                            (item) => (
                                                <option
                                                    key={item.id}
                                                    value={item.id}
                                                >
                                                    {item.nome}
                                                </option>
                                            )
                                        )}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium">
                                    Título
                                </label>
                                <input
                                    value={formTitulo}
                                    onChange={(e) =>
                                        setFormTitulo(e.target.value)
                                    }
                                    maxLength={300}
                                    placeholder="Ex.: Poder de polícia — pontos principais"
                                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary/30"
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium">
                                    Conteúdo
                                </label>
                                <textarea
                                    value={formConteudo}
                                    onChange={(e) =>
                                        setFormConteudo(e.target.value)
                                    }
                                    rows={18}
                                    placeholder="Escreva seu resumo..."
                                    className="w-full resize-y rounded-xl border border-border bg-background px-3 py-3 leading-6 outline-none focus:ring-2 focus:ring-primary/30"
                                />
                            </div>
                        </div>

                        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-card px-5 py-4">
                            <button
                                type="button"
                                onClick={fecharModal}
                                disabled={saving}
                                className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
                            >
                                Cancelar
                            </button>

                            <button
                                type="button"
                                onClick={() => void salvarResumo()}
                                disabled={saving}
                                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                            >
                                {saving
                                    ? "Salvando..."
                                    : modalMode === "edit"
                                        ? "Salvar alterações"
                                        : "Criar resumo"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}

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
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <BookOpen
                className="mx-auto text-muted-foreground"
                size={34}
            />

            <h2 className="mt-4 font-semibold">{title}</h2>

            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {description}
            </p>

            <button
                type="button"
                onClick={onCreate}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
                <Plus size={17} />
                Novo resumo
            </button>
        </div>
    );
}
