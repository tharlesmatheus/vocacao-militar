"use client";

import { useEffect, useMemo, useState } from "react";
import {
    Building2,
    BriefcaseBusiness,
    GraduationCap,
    Layers3,
    Pencil,
    Plus,
    Save,
    Search,
    Tags,
    ToggleLeft,
    ToggleRight,
    University,
    X,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Tab =
    | "INSTITUICOES"
    | "CARGOS"
    | "BANCAS"
    | "DISCIPLINAS"
    | "ASSUNTOS";

type BaseRow = {
    id: string;
    user_id: string;
    nome: string;
    ativo: boolean;
    created_at: string;
    updated_at: string;
};

type InstituicaoRow = BaseRow & {
    sigla: string | null;
};

type CargoRow = BaseRow;

type BancaRow = BaseRow & {
    sigla: string | null;
};

type DisciplinaRow = BaseRow;

type AssuntoRow = BaseRow & {
    disciplina_id: string;
};

type SimpleDraft = {
    nome: string;
};

type SiglaDraft = {
    nome: string;
    sigla: string;
};

type AssuntoDraft = {
    nome: string;
    disciplina_id: string;
};

const TABS: Array<{
    id: Tab;
    label: string;
    description: string;
    icon: typeof Building2;
}> = [
        {
            id: "INSTITUICOES",
            label: "Instituições",
            description: "PM-BA, PC-BA, CBM-BA...",
            icon: Building2,
        },
        {
            id: "CARGOS",
            label: "Cargos",
            description: "Soldado, Oficial, Delegado...",
            icon: BriefcaseBusiness,
        },
        {
            id: "BANCAS",
            label: "Bancas",
            description: "FCC, IBFC, AOCP...",
            icon: University,
        },
        {
            id: "DISCIPLINAS",
            label: "Disciplinas",
            description: "Direito Penal, Informática...",
            icon: GraduationCap,
        },
        {
            id: "ASSUNTOS",
            label: "Assuntos",
            description: "Tópicos vinculados a uma disciplina.",
            icon: Tags,
        },
    ];

function formatError(error: unknown) {
    if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        String((error as { code?: unknown }).code) === "23505"
    ) {
        return "Já existe um cadastro equivalente. O banco bloqueou a duplicação.";
    }

    if (
        error &&
        typeof error === "object" &&
        "message" in error
    ) {
        return String((error as { message?: unknown }).message);
    }

    if (error instanceof Error) return error.message;

    return "Ocorreu um erro inesperado.";
}

function clean(value: string) {
    return value.trim();
}

export default function CatalogosQuestoesPage() {
    const [tab, setTab] = useState<Tab>("INSTITUICOES");

    const [userId, setUserId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [search, setSearch] = useState("");

    const [instituicoes, setInstituicoes] = useState<InstituicaoRow[]>([]);
    const [cargos, setCargos] = useState<CargoRow[]>([]);
    const [bancas, setBancas] = useState<BancaRow[]>([]);
    const [disciplinas, setDisciplinas] = useState<DisciplinaRow[]>([]);
    const [assuntos, setAssuntos] = useState<AssuntoRow[]>([]);

    const [editingId, setEditingId] = useState<string | null>(null);

    const [siglaDraft, setSiglaDraft] = useState<SiglaDraft>({
        nome: "",
        sigla: "",
    });

    const [simpleDraft, setSimpleDraft] = useState<SimpleDraft>({
        nome: "",
    });

    const [assuntoDraft, setAssuntoDraft] = useState<AssuntoDraft>({
        nome: "",
        disciplina_id: "",
    });

    const disciplinasMap = useMemo(() => {
        const map = new Map<string, string>();

        for (const item of disciplinas) {
            map.set(item.id, item.nome);
        }

        return map;
    }, [disciplinas]);

    const activeDisciplinas = useMemo(
        () =>
            disciplinas
                .filter((item) => item.ativo)
                .sort((a, b) =>
                    a.nome.localeCompare(b.nome, "pt-BR", {
                        sensitivity: "base",
                    })
                ),
        [disciplinas]
    );

    useEffect(() => {
        void initialize();
    }, []);

    useEffect(() => {
        clearForm();
        setSearch("");
        setError("");
        setMessage("");
    }, [tab]);

    async function initialize() {
        setLoading(true);
        setError("");

        try {
            const { data, error: authError } =
                await supabase.auth.getUser();

            const uid = data.user?.id ?? null;

            if (authError || !uid) {
                throw new Error("Usuário não autenticado.");
            }

            setUserId(uid);
            await loadAll(uid);
        } catch (e) {
            setError(formatError(e));
        } finally {
            setLoading(false);
        }
    }

    async function loadAll(uid = userId) {
        if (!uid) return;

        const [
            instituicoesReq,
            cargosReq,
            bancasReq,
            disciplinasReq,
            assuntosReq,
        ] = await Promise.all([
            supabase
                .from("questao_instituicoes")
                .select("id,user_id,nome,sigla,ativo,created_at,updated_at")
                .eq("user_id", uid)
                .order("ativo", { ascending: false })
                .order("nome", { ascending: true }),

            supabase
                .from("questao_cargos")
                .select("id,user_id,nome,ativo,created_at,updated_at")
                .eq("user_id", uid)
                .order("ativo", { ascending: false })
                .order("nome", { ascending: true }),

            supabase
                .from("questao_bancas")
                .select("id,user_id,nome,sigla,ativo,created_at,updated_at")
                .eq("user_id", uid)
                .order("ativo", { ascending: false })
                .order("nome", { ascending: true }),

            supabase
                .from("questao_disciplinas")
                .select("id,user_id,nome,ativo,created_at,updated_at")
                .eq("user_id", uid)
                .order("ativo", { ascending: false })
                .order("nome", { ascending: true }),

            supabase
                .from("questao_assuntos")
                .select("id,user_id,disciplina_id,nome,ativo,created_at,updated_at")
                .eq("user_id", uid)
                .order("ativo", { ascending: false })
                .order("nome", { ascending: true }),
        ]);

        const firstError =
            instituicoesReq.error ||
            cargosReq.error ||
            bancasReq.error ||
            disciplinasReq.error ||
            assuntosReq.error;

        if (firstError) throw firstError;

        setInstituicoes((instituicoesReq.data ?? []) as InstituicaoRow[]);
        setCargos((cargosReq.data ?? []) as CargoRow[]);
        setBancas((bancasReq.data ?? []) as BancaRow[]);
        setDisciplinas((disciplinasReq.data ?? []) as DisciplinaRow[]);
        setAssuntos((assuntosReq.data ?? []) as AssuntoRow[]);
    }

    function clearForm() {
        setEditingId(null);
        setSiglaDraft({ nome: "", sigla: "" });
        setSimpleDraft({ nome: "" });
        setAssuntoDraft({
            nome: "",
            disciplina_id: "",
        });
    }

    function beginEdit(
        item:
            | InstituicaoRow
            | CargoRow
            | BancaRow
            | DisciplinaRow
            | AssuntoRow
    ) {
        setEditingId(item.id);
        setError("");
        setMessage("");

        if (tab === "INSTITUICOES") {
            const row = item as InstituicaoRow;
            setSiglaDraft({
                nome: row.nome,
                sigla: row.sigla ?? "",
            });
            return;
        }

        if (tab === "BANCAS") {
            const row = item as BancaRow;
            setSiglaDraft({
                nome: row.nome,
                sigla: row.sigla ?? "",
            });
            return;
        }

        if (tab === "ASSUNTOS") {
            const row = item as AssuntoRow;
            setAssuntoDraft({
                nome: row.nome,
                disciplina_id: row.disciplina_id,
            });
            return;
        }

        setSimpleDraft({ nome: item.nome });
    }

    async function saveCurrent() {
        if (!userId || saving) return;

        setSaving(true);
        setError("");
        setMessage("");

        try {
            if (tab === "INSTITUICOES") {
                await saveSiglaEntity(
                    "questao_instituicoes",
                    "Instituição"
                );
            } else if (tab === "BANCAS") {
                await saveSiglaEntity("questao_bancas", "Banca");
            } else if (tab === "CARGOS") {
                await saveSimpleEntity("questao_cargos", "Cargo");
            } else if (tab === "DISCIPLINAS") {
                await saveSimpleEntity(
                    "questao_disciplinas",
                    "Disciplina"
                );
            } else {
                await saveAssunto();
            }

            await loadAll(userId);
            clearForm();
        } catch (e) {
            setError(formatError(e));
        } finally {
            setSaving(false);
        }
    }

    async function saveSiglaEntity(
        table: "questao_instituicoes" | "questao_bancas",
        label: string
    ) {
        if (!userId) return;

        const nome = clean(siglaDraft.nome);
        const sigla = clean(siglaDraft.sigla);

        if (!nome) {
            throw new Error(`Informe o nome da ${label.toLowerCase()}.`);
        }

        const payload = {
            nome,
            sigla: sigla || null,
        };

        if (editingId) {
            const { error } = await supabase
                .from(table)
                .update(payload)
                .eq("id", editingId)
                .eq("user_id", userId);

            if (error) throw error;

            setMessage(`${label} atualizada com sucesso.`);
            return;
        }

        const { error } = await supabase.from(table).insert({
            user_id: userId,
            ...payload,
        });

        if (error) throw error;

        setMessage(`${label} criada com sucesso.`);
    }

    async function saveSimpleEntity(
        table: "questao_cargos" | "questao_disciplinas",
        label: string
    ) {
        if (!userId) return;

        const nome = clean(simpleDraft.nome);

        if (!nome) {
            throw new Error(`Informe o nome do ${label.toLowerCase()}.`);
        }

        if (editingId) {
            const { error } = await supabase
                .from(table)
                .update({ nome })
                .eq("id", editingId)
                .eq("user_id", userId);

            if (error) throw error;

            setMessage(`${label} atualizado com sucesso.`);
            return;
        }

        const { error } = await supabase.from(table).insert({
            user_id: userId,
            nome,
        });

        if (error) throw error;

        setMessage(`${label} criado com sucesso.`);
    }

    async function saveAssunto() {
        if (!userId) return;

        const nome = clean(assuntoDraft.nome);
        const disciplinaId = assuntoDraft.disciplina_id;

        if (!disciplinaId) {
            throw new Error("Selecione a disciplina do assunto.");
        }

        if (!nome) {
            throw new Error("Informe o nome do assunto.");
        }

        const payload = {
            disciplina_id: disciplinaId,
            nome,
        };

        if (editingId) {
            const { error } = await supabase
                .from("questao_assuntos")
                .update(payload)
                .eq("id", editingId)
                .eq("user_id", userId);

            if (error) throw error;

            setMessage("Assunto atualizado com sucesso.");
            return;
        }

        const { error } = await supabase
            .from("questao_assuntos")
            .insert({
                user_id: userId,
                ...payload,
            });

        if (error) throw error;

        setMessage("Assunto criado com sucesso.");
    }

    async function toggleActive(
        table:
            | "questao_instituicoes"
            | "questao_cargos"
            | "questao_bancas"
            | "questao_disciplinas"
            | "questao_assuntos",
        item: BaseRow
    ) {
        if (!userId || saving) return;

        setSaving(true);
        setError("");
        setMessage("");

        try {
            const { error } = await supabase
                .from(table)
                .update({ ativo: !item.ativo })
                .eq("id", item.id)
                .eq("user_id", userId);

            if (error) throw error;

            await loadAll(userId);

            setMessage(
                item.ativo
                    ? "Cadastro desativado."
                    : "Cadastro reativado."
            );
        } catch (e) {
            setError(formatError(e));
        } finally {
            setSaving(false);
        }
    }

    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");

    function matches(...values: Array<string | null | undefined>) {
        if (!normalizedSearch) return true;

        return values.some((value) =>
            String(value ?? "")
                .toLocaleLowerCase("pt-BR")
                .includes(normalizedSearch)
        );
    }

    const filteredInstituicoes = instituicoes.filter((item) =>
        matches(item.nome, item.sigla)
    );

    const filteredCargos = cargos.filter((item) =>
        matches(item.nome)
    );

    const filteredBancas = bancas.filter((item) =>
        matches(item.nome, item.sigla)
    );

    const filteredDisciplinas = disciplinas.filter((item) =>
        matches(item.nome)
    );

    const filteredAssuntos = assuntos.filter((item) =>
        matches(
            item.nome,
            disciplinasMap.get(item.disciplina_id)
        )
    );

    const tabInfo =
        TABS.find((item) => item.id === tab) ?? TABS[0];

    const currentCount =
        tab === "INSTITUICOES"
            ? filteredInstituicoes.length
            : tab === "CARGOS"
                ? filteredCargos.length
                : tab === "BANCAS"
                    ? filteredBancas.length
                    : tab === "DISCIPLINAS"
                        ? filteredDisciplinas.length
                        : filteredAssuntos.length;

    if (loading) {
        return (
            <main className="min-h-[60vh] flex items-center justify-center px-4">
                <span className="text-sm text-muted-foreground">
                    Carregando catálogos de questões...
                </span>
            </main>
        );
    }

    return (
        <main className="w-full px-4 py-6 sm:px-6 lg:px-8 md:py-10">
            <div className="mx-auto max-w-7xl space-y-6">
                <header>
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <Layers3 size={22} />
                        </div>

                        <div>
                            <h1 className="text-2xl font-bold">
                                Catálogos de Questões
                            </h1>

                            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                                Cadastre aqui as categorias usadas pelo banco de
                                questões. A tela de inserir questões deve apenas
                                selecionar estes registros; ela não deve criar
                                novas categorias.
                            </p>
                        </div>
                    </div>
                </header>

                {error && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {message && (
                    <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                        {message}
                    </div>
                )}

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
                    <aside className="h-fit rounded-3xl border border-border bg-card p-3 shadow-sm">
                        <div className="space-y-1">
                            {TABS.map((item) => {
                                const Icon = item.icon;
                                const selected = item.id === tab;

                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setTab(item.id)}
                                        className={`w-full rounded-2xl px-3 py-3 text-left transition ${selected
                                                ? "bg-primary text-primary-foreground"
                                                : "hover:bg-muted"
                                            }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <Icon
                                                size={18}
                                                className="mt-0.5 shrink-0"
                                            />

                                            <div className="min-w-0">
                                                <div className="text-sm font-semibold">
                                                    {item.label}
                                                </div>

                                                <div
                                                    className={`mt-0.5 text-xs leading-relaxed ${selected
                                                            ? "text-primary-foreground/75"
                                                            : "text-muted-foreground"
                                                        }`}
                                                >
                                                    {item.description}
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </aside>

                    <section className="space-y-5">
                        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                                <div>
                                    <h2 className="text-lg font-semibold">
                                        {tabInfo.label}
                                    </h2>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {editingId
                                            ? "Editando um cadastro existente."
                                            : "Adicione um novo cadastro canônico."}
                                    </p>
                                </div>

                                <div className="relative w-full xl:max-w-sm">
                                    <Search
                                        size={17}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                    />
                                    <input
                                        value={search}
                                        onChange={(e) =>
                                            setSearch(e.target.value)
                                        }
                                        placeholder="Pesquisar..."
                                        className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                    />
                                </div>
                            </div>

                            <div className="mt-6">
                                {(tab === "INSTITUICOES" ||
                                    tab === "BANCAS") && (
                                        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto]">
                                            <Field
                                                label="Nome"
                                                value={siglaDraft.nome}
                                                onChange={(value) =>
                                                    setSiglaDraft((prev) => ({
                                                        ...prev,
                                                        nome: value,
                                                    }))
                                                }
                                                placeholder={
                                                    tab === "INSTITUICOES"
                                                        ? "Polícia Militar da Bahia"
                                                        : "Fundação Carlos Chagas"
                                                }
                                            />

                                            <Field
                                                label="Sigla"
                                                value={siglaDraft.sigla}
                                                onChange={(value) =>
                                                    setSiglaDraft((prev) => ({
                                                        ...prev,
                                                        sigla: value,
                                                    }))
                                                }
                                                placeholder={
                                                    tab === "INSTITUICOES"
                                                        ? "PM-BA"
                                                        : "FCC"
                                                }
                                            />

                                            <FormActions
                                                editing={!!editingId}
                                                saving={saving}
                                                onSave={() => void saveCurrent()}
                                                onCancel={clearForm}
                                            />
                                        </div>
                                    )}

                                {(tab === "CARGOS" ||
                                    tab === "DISCIPLINAS") && (
                                        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                                            <Field
                                                label="Nome"
                                                value={simpleDraft.nome}
                                                onChange={(value) =>
                                                    setSimpleDraft({ nome: value })
                                                }
                                                placeholder={
                                                    tab === "CARGOS"
                                                        ? "Soldado"
                                                        : "Direito Penal"
                                                }
                                            />

                                            <FormActions
                                                editing={!!editingId}
                                                saving={saving}
                                                onSave={() => void saveCurrent()}
                                                onCancel={clearForm}
                                            />
                                        </div>
                                    )}

                                {tab === "ASSUNTOS" && (
                                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)_auto]">
                                        <div>
                                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                                                Disciplina
                                            </label>

                                            <select
                                                value={
                                                    assuntoDraft.disciplina_id
                                                }
                                                onChange={(e) =>
                                                    setAssuntoDraft((prev) => ({
                                                        ...prev,
                                                        disciplina_id:
                                                            e.target.value,
                                                    }))
                                                }
                                                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                            >
                                                <option value="">
                                                    Selecione
                                                </option>

                                                {activeDisciplinas.map(
                                                    (disciplina) => (
                                                        <option
                                                            key={disciplina.id}
                                                            value={disciplina.id}
                                                        >
                                                            {disciplina.nome}
                                                        </option>
                                                    )
                                                )}
                                            </select>
                                        </div>

                                        <Field
                                            label="Assunto"
                                            value={assuntoDraft.nome}
                                            onChange={(value) =>
                                                setAssuntoDraft((prev) => ({
                                                    ...prev,
                                                    nome: value,
                                                }))
                                            }
                                            placeholder="Crimes contra o patrimônio"
                                        />

                                        <FormActions
                                            editing={!!editingId}
                                            saving={saving}
                                            onSave={() => void saveCurrent()}
                                            onCancel={clearForm}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
                            <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
                                <div>
                                    <div className="font-semibold">
                                        Cadastros
                                    </div>
                                    <div className="mt-0.5 text-xs text-muted-foreground">
                                        {currentCount} item(ns) exibido(s)
                                    </div>
                                </div>

                                <div className="text-xs text-muted-foreground">
                                    Desative em vez de duplicar.
                                </div>
                            </div>

                            {tab === "INSTITUICOES" && (
                                <CatalogTable
                                    empty="Nenhuma instituição cadastrada."
                                    rows={filteredInstituicoes.map((item) => ({
                                        id: item.id,
                                        name: item.nome,
                                        secondary: item.sigla || "Sem sigla",
                                        active: item.ativo,
                                        raw: item,
                                    }))}
                                    onEdit={(item) =>
                                        beginEdit(
                                            item.raw as InstituicaoRow
                                        )
                                    }
                                    onToggle={(item) =>
                                        void toggleActive(
                                            "questao_instituicoes",
                                            item.raw as InstituicaoRow
                                        )
                                    }
                                />
                            )}

                            {tab === "CARGOS" && (
                                <CatalogTable
                                    empty="Nenhum cargo cadastrado."
                                    rows={filteredCargos.map((item) => ({
                                        id: item.id,
                                        name: item.nome,
                                        secondary: null,
                                        active: item.ativo,
                                        raw: item,
                                    }))}
                                    onEdit={(item) =>
                                        beginEdit(item.raw as CargoRow)
                                    }
                                    onToggle={(item) =>
                                        void toggleActive(
                                            "questao_cargos",
                                            item.raw as CargoRow
                                        )
                                    }
                                />
                            )}

                            {tab === "BANCAS" && (
                                <CatalogTable
                                    empty="Nenhuma banca cadastrada."
                                    rows={filteredBancas.map((item) => ({
                                        id: item.id,
                                        name: item.nome,
                                        secondary: item.sigla || "Sem sigla",
                                        active: item.ativo,
                                        raw: item,
                                    }))}
                                    onEdit={(item) =>
                                        beginEdit(item.raw as BancaRow)
                                    }
                                    onToggle={(item) =>
                                        void toggleActive(
                                            "questao_bancas",
                                            item.raw as BancaRow
                                        )
                                    }
                                />
                            )}

                            {tab === "DISCIPLINAS" && (
                                <CatalogTable
                                    empty="Nenhuma disciplina cadastrada."
                                    rows={filteredDisciplinas.map((item) => ({
                                        id: item.id,
                                        name: item.nome,
                                        secondary: null,
                                        active: item.ativo,
                                        raw: item,
                                    }))}
                                    onEdit={(item) =>
                                        beginEdit(
                                            item.raw as DisciplinaRow
                                        )
                                    }
                                    onToggle={(item) =>
                                        void toggleActive(
                                            "questao_disciplinas",
                                            item.raw as DisciplinaRow
                                        )
                                    }
                                />
                            )}

                            {tab === "ASSUNTOS" && (
                                <CatalogTable
                                    empty="Nenhum assunto cadastrado."
                                    rows={filteredAssuntos.map((item) => ({
                                        id: item.id,
                                        name: item.nome,
                                        secondary:
                                            disciplinasMap.get(
                                                item.disciplina_id
                                            ) ?? "Disciplina não encontrada",
                                        active: item.ativo,
                                        raw: item,
                                    }))}
                                    onEdit={(item) =>
                                        beginEdit(item.raw as AssuntoRow)
                                    }
                                    onToggle={(item) =>
                                        void toggleActive(
                                            "questao_assuntos",
                                            item.raw as AssuntoRow
                                        )
                                    }
                                />
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
}

function Field({
    label,
    value,
    onChange,
    placeholder,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}) {
    return (
        <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {label}
            </label>

            <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
        </div>
    );
}

function FormActions({
    editing,
    saving,
    onSave,
    onCancel,
}: {
    editing: boolean;
    saving: boolean;
    onSave: () => void;
    onCancel: () => void;
}) {
    return (
        <div className="flex items-end gap-2">
            <button
                type="button"
                disabled={saving}
                onClick={onSave}
                className="inline-flex h-[42px] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
                {editing ? <Save size={17} /> : <Plus size={17} />}
                {saving
                    ? "Salvando..."
                    : editing
                        ? "Salvar"
                        : "Adicionar"}
            </button>

            {editing && (
                <button
                    type="button"
                    disabled={saving}
                    onClick={onCancel}
                    className="inline-flex h-[42px] items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm hover:bg-muted disabled:opacity-50"
                >
                    <X size={17} />
                    Cancelar
                </button>
            )}
        </div>
    );
}

type CatalogTableRow = {
    id: string;
    name: string;
    secondary: string | null;
    active: boolean;
    raw: BaseRow;
};

function CatalogTable({
    rows,
    empty,
    onEdit,
    onToggle,
}: {
    rows: CatalogTableRow[];
    empty: string;
    onEdit: (row: CatalogTableRow) => void;
    onToggle: (row: CatalogTableRow) => void;
}) {
    if (!rows.length) {
        return (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                {empty}
            </div>
        );
    }

    return (
        <div className="divide-y divide-border">
            {rows.map((item) => (
                <div
                    key={item.id}
                    className={`flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 ${item.active ? "" : "opacity-60"
                        }`}
                >
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">
                                {item.name}
                            </span>

                            <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.active
                                        ? "bg-green-100 text-green-700"
                                        : "bg-muted text-muted-foreground"
                                    }`}
                            >
                                {item.active ? "Ativo" : "Inativo"}
                            </span>
                        </div>

                        {item.secondary && (
                            <div className="mt-1 text-sm text-muted-foreground">
                                {item.secondary}
                            </div>
                        )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onEdit(item)}
                            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted"
                        >
                            <Pencil size={15} />
                            Editar
                        </button>

                        <button
                            type="button"
                            onClick={() => onToggle(item)}
                            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted"
                        >
                            {item.active ? (
                                <ToggleRight size={17} />
                            ) : (
                                <ToggleLeft size={17} />
                            )}

                            {item.active ? "Desativar" : "Ativar"}
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
