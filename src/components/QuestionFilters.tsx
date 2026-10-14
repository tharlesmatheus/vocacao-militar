"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export interface Filters {
    origem?: string; // "" = todas | "USUARIO" = minhas | "ACERVO" = acervo da plataforma
    instituicao?: string;
    cargo?: string;
    disciplina?: string;
    assunto?: string;
    modalidade?: string;
    banca?: string;
    excluirRespondidas?: boolean;
}

interface QuestionFiltersProps {
    onFiltrar?: (filters: Filters) => void;
    /** Filtros já aplicados por fora (ex.: a meta do aluno). Sincroniza os campos. */
    iniciais?: Filters;
}

type Opcoes = {
    instituicoes: string[];
    cargos: string[];
    bancas: string[];
    disciplinas: string[];
    modalidades: string[];
    assuntos: string[];
};

const OPCOES_VAZIAS: Opcoes = {
    instituicoes: [],
    cargos: [],
    bancas: [],
    disciplinas: [],
    modalidades: [],
    assuntos: [],
};

const FILTROS_VAZIOS: Filters = {
    origem: "",
    instituicao: "",
    cargo: "",
    disciplina: "",
    assunto: "",
    modalidade: "",
    banca: "",
    excluirRespondidas: false,
};

const selectClass =
    "w-full bg-muted border border-border rounded-lg px-4 py-3 text-foreground text-base focus:ring-2 focus:ring-primary outline-none shadow-sm transition";

const ou = (v?: string) => (v && v.trim() ? v : null);

export function QuestionFilters({ onFiltrar, iniciais }: QuestionFiltersProps) {
    const [opcoes, setOpcoes] = useState<Opcoes>(OPCOES_VAZIAS);
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState("");
    const [selected, setSelected] = useState<Filters>(() => ({ ...FILTROS_VAZIOS, ...iniciais }));

    useEffect(() => {
        if (iniciais) setSelected({ ...FILTROS_VAZIOS, ...iniciais });
    }, [iniciais]);

    /*
     * As opções vêm do banco já agregadas (valores distintos), em vez de
     * baixar todas as questões. Cargos dependem da instituição e assuntos
     * dependem da disciplina: o acervo tem milhares de assuntos.
     */
    useEffect(() => {
        let cancelado = false;

        (async () => {
            setLoading(true);
            setErro("");

            const { data, error } = await supabase.rpc("opcoes_filtro_questoes", {
                p_origem: ou(selected.origem),
                p_instituicao: ou(selected.instituicao),
                p_disciplina: ou(selected.disciplina),
            });

            if (cancelado) return;

            if (error) {
                setErro("Não foi possível carregar os filtros.");
                setOpcoes(OPCOES_VAZIAS);
            } else {
                setOpcoes({ ...OPCOES_VAZIAS, ...((data ?? {}) as Partial<Opcoes>) });
            }

            setLoading(false);
        })();

        return () => {
            cancelado = true;
        };
    }, [selected.origem, selected.instituicao, selected.disciplina]);

    function handleChange(
        e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
    ) {
        const { name, value, type } = e.target;

        setSelected((prev) => {
            const next: Filters = {
                ...prev,
                [name]: type === "checkbox"
                    ? (e.target as HTMLInputElement).checked
                    : value,
            };

            // Filtros dependentes: trocar o "pai" limpa o "filho".
            if (name === "instituicao") next.cargo = "";
            if (name === "disciplina") next.assunto = "";
            if (name === "origem") {
                next.instituicao = "";
                next.cargo = "";
                next.disciplina = "";
                next.assunto = "";
                next.banca = "";
                next.modalidade = "";
            }

            return next;
        });
    }

    function handleFiltrar(e: React.FormEvent) {
        e.preventDefault();
        onFiltrar?.(selected);
    }

    function handleLimpar() {
        setSelected(FILTROS_VAZIOS);
        onFiltrar?.({});
    }

    function campo(
        name: keyof Filters,
        label: string,
        lista: string[],
        opts: { placeholder?: string; disabled?: boolean } = {}
    ) {
        return (
            <div>
                <label className="block mb-2 text-sm font-medium text-muted-foreground">
                    {label}
                </label>
                <select
                    name={name}
                    className={selectClass}
                    value={(selected[name] as string) ?? ""}
                    onChange={handleChange}
                    disabled={loading || opts.disabled}
                >
                    <option value="">{opts.placeholder ?? "Selecione"}</option>
                    {lista.map((nome) => (
                        <option key={nome} value={nome}>
                            {nome}
                        </option>
                    ))}
                </select>
            </div>
        );
    }

    return (
        <div className="bg-card border border-border rounded-2xl shadow-sm p-6 md:p-8 my-2 max-w-full">
            <form
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
                onSubmit={handleFiltrar}
            >
                {/* Origem */}
                <div>
                    <label className="block mb-2 text-sm font-medium text-muted-foreground">
                        Origem
                    </label>
                    <select
                        name="origem"
                        className={selectClass}
                        value={selected.origem ?? ""}
                        onChange={handleChange}
                        disabled={loading}
                    >
                        <option value="">Todas</option>
                        <option value="ACERVO">Banco de questões</option>
                        <option value="USUARIO">Minhas questões</option>
                    </select>
                </div>

                {campo("instituicao", "Instituição", opcoes.instituicoes)}
                {campo("cargo", "Cargo", opcoes.cargos)}
                {campo("banca", "Banca", opcoes.bancas)}
                {campo("disciplina", "Disciplina", opcoes.disciplinas)}
                {campo("assunto", "Assunto", opcoes.assuntos, {
                    placeholder: selected.disciplina ? "Selecione" : "Escolha a disciplina primeiro",
                    disabled: !selected.disciplina,
                })}
                {campo("modalidade", "Modalidade", opcoes.modalidades)}

                {erro && (
                    <div className="col-span-full text-sm text-red-600 dark:text-red-400">{erro}</div>
                )}

                {/* Excluir Questões Respondidas */}
                <div className="col-span-full mt-2">
                    <fieldset className="flex items-center gap-4 border border-border bg-muted rounded-xl px-4 py-3">
                        <legend className="text-muted-foreground text-sm font-semibold mr-3">
                            Excluir Questões:
                        </legend>
                        <label className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer select-none">
                            <input
                                name="excluirRespondidas"
                                type="checkbox"
                                className="form-checkbox accent-primary w-5 h-5 rounded border border-border transition"
                                checked={selected.excluirRespondidas || false}
                                onChange={handleChange}
                            />
                            Já Respondidas
                        </label>
                    </fieldset>
                </div>

                {/* Botões */}
                <div className="col-span-full flex flex-wrap gap-3 mt-4 justify-end">
                    <button
                        type="submit"
                        className="bg-primary hover:bg-primary/80 text-primary-foreground font-bold px-6 py-2 rounded-lg border border-primary shadow-sm text-sm transition"
                        disabled={loading}
                    >
                        Aplicar Filtros
                    </button>
                    <button
                        type="button"
                        className="bg-card hover:bg-muted text-foreground font-semibold px-6 py-2 rounded-lg border border-border shadow-sm text-sm transition"
                        onClick={handleLimpar}
                        disabled={loading}
                    >
                        Limpar Filtros
                    </button>
                </div>
            </form>
        </div>
    );
}
