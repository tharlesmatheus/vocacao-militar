"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { rotuloBanca, rotuloModalidade } from "@/lib/rotulos";

export interface Filters {
    origem?: string; // "" = todas | "USUARIO" = minhas | "ACERVO" = acervo da plataforma
    instituicao?: string;
    cargo?: string;
    disciplina?: string;
    assunto?: string;
    modalidade?: string;
    banca?: string;
    excluirRespondidas?: boolean;
    /** Mostrar Medicina, Odontologia, Engenharias etc. mesmo sem cargo escolhido. */
    incluirEspecialidades?: boolean;
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
    incluirEspecialidades: false,
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
     * Filtros em cascata (ordem da tela): cada lista vem do banco só com o que
     * existe nos filtros acima dela (PM BA -> só cargos, bancas e disciplinas
     * da PM BA). Assunto só aparece depois da disciplina (são mais de mil).
     */
    useEffect(() => {
        let cancelado = false;

        (async () => {
            setLoading(true);
            setErro("");

            const base = {
                p_origem: ou(selected.origem),
                p_instituicao: ou(selected.instituicao),
                p_disciplina: ou(selected.disciplina),
            };
            let { data, error } = await supabase.rpc("opcoes_filtro_questoes", {
                ...base,
                p_cargo: ou(selected.cargo),
                p_banca: ou(selected.banca),
                p_assunto: ou(selected.assunto),
                p_modalidade: ou(selected.modalidade),
            });
            // Banco ainda sem a migração 20261022: versão antiga (só instituição e disciplina).
            if (error?.code === "PGRST202") {
                ({ data, error } = await supabase.rpc("opcoes_filtro_questoes", base));
            }

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
    }, [selected.origem, selected.instituicao, selected.cargo, selected.banca, selected.disciplina, selected.assunto, selected.modalidade]);

    /*
     * Valor escolhido que deixou de existir com os outros filtros (ex.: trocou
     * a instituição e o cargo não existe nela) volta para "Selecione".
     */
    useEffect(() => {
        if (loading || erro) return;
        const listas: Array<[keyof Filters, string[]]> = [
            ["instituicao", opcoes.instituicoes],
            ["cargo", opcoes.cargos],
            ["banca", opcoes.bancas],
            ["disciplina", opcoes.disciplinas],
            ["assunto", opcoes.assuntos],
            ["modalidade", opcoes.modalidades],
        ];
        const invalidos = listas.filter(([nome, lista]) => {
            const v = selected[nome];
            return typeof v === "string" && v !== "" && !lista.includes(v);
        });
        if (!invalidos.length) return;
        setSelected((prev) => {
            const next = { ...prev };
            for (const [nome] of invalidos) (next as Record<string, unknown>)[nome] = "";
            if (invalidos.some(([nome]) => nome === "disciplina")) next.assunto = "";
            return next;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opcoes, loading, erro]);

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
        opts: { placeholder?: string; disabled?: boolean; rotulo?: (v: string) => string } = {}
    ) {
        return (
            <div>
                <label htmlFor={`filtro-${name}`} className="block mb-2 text-sm font-medium text-muted-foreground">
                    {label}
                </label>
                <select
                    id={`filtro-${name}`}
                    name={name}
                    className={selectClass}
                    value={(selected[name] as string) ?? ""}
                    onChange={handleChange}
                    disabled={loading || opts.disabled}
                >
                    <option value="">{opts.placeholder ?? "Selecione"}</option>
                    {lista.map((nome) => (
                        <option key={nome} value={nome} title={nome}>
                            {opts.rotulo ? opts.rotulo(nome) : nome}
                        </option>
                    ))}
                </select>
            </div>
        );
    }

    return (
        <div className="max-w-full rounded-xl border border-border bg-card p-5 shadow-sm">
            <form
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
                onSubmit={handleFiltrar}
            >
                {campo("instituicao", "Instituição", opcoes.instituicoes)}
                {campo("cargo", "Cargo", opcoes.cargos)}
                {campo("banca", "Banca", opcoes.bancas, { rotulo: rotuloBanca })}
                {campo("disciplina", "Disciplina", opcoes.disciplinas)}
                {campo("assunto", "Assunto", opcoes.assuntos, {
                    placeholder: selected.disciplina ? "Selecione" : "Escolha a disciplina primeiro",
                    disabled: !selected.disciplina,
                })}
                {campo("modalidade", "Modalidade", opcoes.modalidades, { rotulo: rotuloModalidade })}

                {erro && (
                    <div className="col-span-full text-sm text-red-600 dark:text-red-400">{erro}</div>
                )}

                {/* Botões */}
                <div className="col-span-full mt-2 flex flex-wrap items-center gap-3">
                    <label className="mr-auto flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer select-none">
                        <input
                            name="excluirRespondidas"
                            type="checkbox"
                            className="form-checkbox accent-primary w-5 h-5 rounded border border-border transition"
                            checked={selected.excluirRespondidas || false}
                            onChange={handleChange}
                        />
                        Excluir questões já respondidas
                    </label>
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
