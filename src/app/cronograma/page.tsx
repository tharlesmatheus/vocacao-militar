"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Bloco = {
    id: string;
    hora: string;
    atividades: string[];
};

const DIAS_DA_SEMANA = [
    { nome: "Segunda", abrev: "Seg" },
    { nome: "Terça", abrev: "Ter" },
    { nome: "Quarta", abrev: "Qua" },
    { nome: "Quinta", abrev: "Qui" },
    { nome: "Sexta", abrev: "Sex" },
    { nome: "Sábado", abrev: "Sáb" },
    { nome: "Domingo", abrev: "Dom" },
];

const BLOCOS_PADRAO = [
    "08:00 - 09:00",
    "09:00 - 10:00",
    "14:00 - 15:00",
    "20:00 - 21:00",
];

const DIAS_TOTAL = 7;
const HORARIO_REGEX = /^([01]\d|2[0-3]):([0-5]\d)\s-\s([01]\d|2[0-3]):([0-5]\d)$/;

function gerarId() {
    return crypto.randomUUID();
}

function criarBloco(hora: string): Bloco {
    return {
        id: gerarId(),
        hora,
        atividades: Array(DIAS_TOTAL).fill(""),
    };
}

function criarBlocosPadrao(): Bloco[] {
    return BLOCOS_PADRAO.map(criarBloco);
}

function normalizarBlocos(raw: unknown): Bloco[] {
    if (!Array.isArray(raw)) return criarBlocosPadrao();

    return raw
        .filter((item): item is Partial<Bloco> & { hora: string } => {
            return !!item && typeof item === "object" && typeof item.hora === "string";
        })
        .map((item) => ({
            id: typeof item.id === "string" && item.id.trim() ? item.id : gerarId(),
            hora: item.hora.trim(),
            atividades: Array.isArray(item.atividades)
                ? Array.from({ length: DIAS_TOTAL }, (_, i) =>
                    typeof item.atividades?.[i] === "string" ? item.atividades[i] : ""
                )
                : Array(DIAS_TOTAL).fill(""),
        }));
}

function horarioEhValido(valor: string) {
    const match = valor.match(HORARIO_REGEX);
    if (!match) return false;

    const [, h1, m1, h2, m2] = match;
    const inicio = Number(h1) * 60 + Number(m1);
    const fim = Number(h2) * 60 + Number(m2);

    return fim > inicio;
}

type EditState = { i: number; j: number } | null;

type EditableCellProps = {
    value: string;
    isEditing: boolean;
    onStartEdit: () => void;
    onChange: (value: string) => void;
    onEndEdit: () => void;
    onClear: () => void;
    compact?: boolean;
};

function EditableCell({
    value,
    isEditing,
    onStartEdit,
    onChange,
    onEndEdit,
    onClear,
}: EditableCellProps) {
    return (
        <td
            className="p-1 text-center group cursor-pointer relative min-w-[90px]"
            onClick={onStartEdit}
        >
            {isEditing ? (
                <input
                    className="w-full rounded px-1 py-1 border border-primary text-xs sm:text-sm outline-none"
                    autoFocus
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onBlur={onEndEdit}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") onEndEdit();
                        if (e.key === "Escape") onEndEdit();
                    }}
                    placeholder="Tarefa..."
                    maxLength={64}
                />
            ) : (
                <div className="transition-colors px-1 py-2 rounded group-hover:bg-muted text-foreground min-h-[20px]">
                    {value || <span className="text-muted-foreground italic">—</span>}

                    {value && (
                        <button
                            type="button"
                            className="absolute top-1 right-1 text-xs text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                                e.stopPropagation();
                                onClear();
                            }}
                            aria-label="Limpar"
                        >
                            <Trash2 size={13} />
                        </button>
                    )}
                </div>
            )}
        </td>
    );
}

export default function CronogramaSemanalPage() {
    const [blocos, setBlocos] = useState<Bloco[]>([]);
    const [edit, setEdit] = useState<EditState>(null);
    const [novoBloco, setNovoBloco] = useState("");
    const [loadingInicial, setLoadingInicial] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [msg, setMsg] = useState("");
    const [cronogramaId, setCronogramaId] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [modoCards, setModoCards] = useState(false);
    const [cardDiaAtivo, setCardDiaAtivo] = useState(0);

    const carregouDoBancoRef = useRef(false);
    const msgTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const blocosOrdenados = useMemo(() => blocos, [blocos]);

    useEffect(() => {
        function checkMobile() {
            setModoCards(window.innerWidth < 640);
        }

        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    useEffect(() => {
        async function fetchCronograma() {
            setLoadingInicial(true);

            const {
                data: { user },
                error: authError,
            } = await supabase.auth.getUser();

            if (authError || !user) {
                setMsg("Usuário não autenticado.");
                setLoadingInicial(false);
                return;
            }

            setUserId(user.id);

            const { data, error } = await supabase
                .from("cronograma")
                .select("id, blocos")
                .eq("user_id", user.id)
                .maybeSingle();

            if (error) {
                setMsg("Erro ao carregar cronograma.");
                setLoadingInicial(false);
                return;
            }

            if (!data) {
                const blocosIniciais = criarBlocosPadrao();

                const { data: criado, error: insertError } = await supabase
                    .from("cronograma")
                    .insert({
                        user_id: user.id,
                        blocos: blocosIniciais,
                    })
                    .select("id, blocos")
                    .single();

                if (insertError || !criado) {
                    setMsg("Erro ao criar cronograma.");
                    setLoadingInicial(false);
                    return;
                }

                setCronogramaId(criado.id);
                setBlocos(normalizarBlocos(criado.blocos));
            } else {
                setCronogramaId(data.id);
                setBlocos(normalizarBlocos(data.blocos));
            }

            carregouDoBancoRef.current = true;
            setLoadingInicial(false);
        }

        fetchCronograma();

        return () => {
            if (msgTimeoutRef.current) clearTimeout(msgTimeoutRef.current);
        };
    }, []);

    useEffect(() => {
        if (!carregouDoBancoRef.current) return;
        if (!cronogramaId || !userId) return;

        const timeout = setTimeout(async () => {
            setSalvando(true);
            setMsg("Salvando...");

            const { error } = await supabase
                .from("cronograma")
                .update({
                    blocos,
                    atualizado_em: new Date().toISOString(),
                })
                .eq("id", cronogramaId)
                .eq("user_id", userId);

            setSalvando(false);

            if (error) {
                setMsg("Erro ao salvar.");
                return;
            }

            setMsg("Cronograma salvo!");

            if (msgTimeoutRef.current) clearTimeout(msgTimeoutRef.current);
            msgTimeoutRef.current = setTimeout(() => setMsg(""), 1500);
        }, 700);

        return () => clearTimeout(timeout);
    }, [blocos, cronogramaId, userId]);

    function handleCellEdit(i: number, j: number, value: string) {
        setBlocos((prev) => {
            const next = [...prev];
            const bloco = next[i];

            if (!bloco) return prev;

            const atividades = Array.isArray(bloco.atividades)
                ? [...bloco.atividades]
                : Array(DIAS_TOTAL).fill("");

            atividades[j] = value;

            next[i] = { ...bloco, atividades };
            return next;
        });
    }

    function handleAddBloco() {
        const valor = novoBloco.trim();

        if (!valor) {
            setMsg("Informe um horário.");
            return;
        }

        if (!horarioEhValido(valor)) {
            setMsg("Use o formato HH:MM - HH:MM com horário válido.");
            return;
        }

        const duplicado = blocos.some(
            (bloco) => bloco.hora.toLowerCase() === valor.toLowerCase()
        );

        if (duplicado) {
            setMsg("Esse bloco já existe.");
            return;
        }

        setBlocos((prev) => [...prev, criarBloco(valor)]);
        setNovoBloco("");
        setMsg("");
    }

    function handleRemoveBloco(index: number) {
        setBlocos((prev) => prev.filter((_, i) => i !== index));
        setEdit((prev) => {
            if (!prev) return null;
            if (prev.i === index) return null;
            if (prev.i > index) return { ...prev, i: prev.i - 1 };
            return prev;
        });
    }

    function prevCard() {
        setCardDiaAtivo((v) => (v + DIAS_TOTAL - 1) % DIAS_TOTAL);
    }

    function nextCard() {
        setCardDiaAtivo((v) => (v + 1) % DIAS_TOTAL);
    }

    return (
        <div className="w-full max-w-5xl mx-auto px-2 sm:px-4 py-7 flex flex-col gap-8">
            <div className="flex flex-col sm:flex-row items-center gap-3 mb-4">
                <input
                    type="text"
                    className="border border-border rounded-lg px-3 py-2 text-sm w-56 focus:ring-2 focus:ring-primary outline-none shadow-sm bg-input text-foreground"
                    placeholder="Ex: 18:00 - 19:00"
                    value={novoBloco}
                    onChange={(e) => setNovoBloco(e.target.value)}
                    maxLength={20}
                    disabled={loadingInicial || salvando}
                />
                <button
                    type="button"
                    className="flex items-center gap-2 bg-primary hover:bg-primary/80 text-primary-foreground font-bold px-4 py-2 rounded-lg text-sm shadow transition disabled:opacity-50"
                    onClick={handleAddBloco}
                    disabled={loadingInicial || salvando}
                >
                    <Plus className="w-4 h-4" /> Adicionar Bloco
                </button>
            </div>

            {modoCards ? (
                <div className="w-full flex flex-col items-center">
                    <div className="flex items-center justify-center gap-1 mb-4">
                        <button
                            type="button"
                            className="p-2 rounded-full bg-muted border border-border hover:bg-muted/80 transition"
                            onClick={prevCard}
                        >
                            <ChevronLeft className="w-5 h-5 text-primary" />
                        </button>

                        <span className="text-lg font-bold text-foreground w-32 text-center">
                            {DIAS_DA_SEMANA[cardDiaAtivo].nome}
                        </span>

                        <button
                            type="button"
                            className="p-2 rounded-full bg-muted border border-border hover:bg-muted/80 transition"
                            onClick={nextCard}
                        >
                            <ChevronRight className="w-5 h-5 text-primary" />
                        </button>
                    </div>

                    <div className="w-full max-w-md mx-auto bg-card rounded-2xl border border-border shadow-lg p-3 transition-all">
                        <table className="w-full text-xs">
                            <thead>
                                <tr>
                                    <th className="bg-muted text-foreground font-bold px-2 py-2 rounded-tl-2xl text-center min-w-[70px]">
                                        Horário
                                    </th>
                                    <th className="bg-muted text-foreground font-bold px-2 py-2 rounded-tr-2xl text-center">
                                        Atividade
                                    </th>
                                    <th className="bg-muted px-1 py-2" />
                                </tr>
                            </thead>

                            <tbody>
                                {blocosOrdenados.map((bloco, i) => (
                                    <tr key={bloco.id} className="border-b border-muted">
                                        <td className="px-2 py-2 text-primary font-semibold text-center bg-input whitespace-nowrap rounded-l-2xl text-xs">
                                            {bloco.hora}
                                        </td>

                                        <EditableCell
                                            value={bloco.atividades[cardDiaAtivo] ?? ""}
                                            isEditing={!!edit && edit.i === i && edit.j === cardDiaAtivo}
                                            onStartEdit={() => setEdit({ i, j: cardDiaAtivo })}
                                            onChange={(value) => handleCellEdit(i, cardDiaAtivo, value)}
                                            onEndEdit={() => setEdit(null)}
                                            onClear={() => handleCellEdit(i, cardDiaAtivo, "")}
                                        />

                                        <td className="pl-1 pr-1 text-center align-middle">
                                            <button
                                                type="button"
                                                className="bg-destructive/10 hover:bg-destructive/20 border border-destructive/10 text-destructive rounded p-1 transition disabled:opacity-50"
                                                title="Remover bloco"
                                                onClick={() => handleRemoveBloco(i)}
                                                disabled={loadingInicial || salvando}
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex gap-2 justify-center mt-3">
                        {DIAS_DA_SEMANA.map((dia, idx) => (
                            <button
                                key={dia.nome}
                                type="button"
                                className={`w-2.5 h-2.5 rounded-full transition ${cardDiaAtivo === idx ? "bg-primary" : "bg-border"
                                    }`}
                                onClick={() => setCardDiaAtivo(idx)}
                                aria-label={`Ir para ${dia.nome}`}
                            />
                        ))}
                    </div>
                </div>
            ) : (
                <div className="w-full overflow-x-auto rounded-2xl border border-border shadow bg-card scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                    <table className="min-w-[700px] sm:min-w-full text-xs sm:text-sm">
                        <thead>
                            <tr>
                                <th className="bg-muted text-foreground font-bold px-2 py-2 rounded-tl-2xl text-center min-w-[70px] sm:min-w-[110px]">
                                    Horário
                                </th>

                                {DIAS_DA_SEMANA.map((dia) => (
                                    <th
                                        key={dia.nome}
                                        className="bg-muted text-foreground font-bold px-2 py-2 text-center min-w-[64px] sm:min-w-[110px]"
                                    >
                                        <span className="block sm:hidden">{dia.abrev}</span>
                                        <span className="hidden sm:block">{dia.nome}</span>
                                    </th>
                                ))}

                                <th className="bg-muted px-1 py-2 rounded-tr-2xl" />
                            </tr>
                        </thead>

                        <tbody>
                            {blocosOrdenados.map((bloco, i) => (
                                <tr key={bloco.id} className="border-b border-muted">
                                    <td className="px-2 py-2 text-primary font-semibold text-center bg-input whitespace-nowrap rounded-l-2xl text-xs sm:text-sm">
                                        {bloco.hora}
                                    </td>

                                    {DIAS_DA_SEMANA.map((_, j) => (
                                        <EditableCell
                                            key={`${bloco.id}-${j}`}
                                            value={bloco.atividades[j] ?? ""}
                                            isEditing={!!edit && edit.i === i && edit.j === j}
                                            onStartEdit={() => setEdit({ i, j })}
                                            onChange={(value) => handleCellEdit(i, j, value)}
                                            onEndEdit={() => setEdit(null)}
                                            onClear={() => handleCellEdit(i, j, "")}
                                        />
                                    ))}

                                    <td className="pl-1 pr-1 text-center align-middle rounded-r-2xl">
                                        <button
                                            type="button"
                                            className="bg-destructive/10 hover:bg-destructive/20 border border-destructive/10 text-destructive rounded p-1 transition disabled:opacity-50"
                                            title="Remover bloco"
                                            onClick={() => handleRemoveBloco(i)}
                                            disabled={loadingInicial || salvando}
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {msg && (
                <div
                    className={`text-center mt-2 ${msg.toLowerCase().includes("erro")
                            ? "text-red-600"
                            : "text-green-600"
                        }`}
                >
                    {msg}
                </div>
            )}
        </div>
    );
}