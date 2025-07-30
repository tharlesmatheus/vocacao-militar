"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

interface Filters {
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
}

export function QuestionFilters({ onFiltrar }: QuestionFiltersProps) {
    // Estados para listas únicas
    const [instituicoes, setInstituicoes] = useState<string[]>([]);
    const [cargos, setCargos] = useState<string[]>([]);
    const [disciplinas, setDisciplinas] = useState<string[]>([]);
    const [assuntos, setAssuntos] = useState<string[]>([]);
    const [modalidades, setModalidades] = useState<string[]>([]);
    const [bancas, setBancas] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    // Estado dos filtros
    const [selected, setSelected] = useState<Filters>({
        instituicao: "",
        cargo: "",
        disciplina: "",
        assunto: "",
        modalidade: "",
        banca: "",
        excluirRespondidas: false,
    });

    // Buscar opções únicas no banco
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from("questoes")
                .select("instituicao, cargo, disciplina, assunto, modalidade, banca");

            if (!data || error) {
                setLoading(false);
                return;
            }

            // Função para pegar valores distintos
            const getDistinct = (field: keyof Filters) =>
                Array.from(
                    new Set(
                        data
                            .map((q: any) => q[field])
                            .filter((v: string) => !!v)
                    )
                );

            setInstituicoes(getDistinct("instituicao"));
            setCargos(getDistinct("cargo"));
            setDisciplinas(getDistinct("disciplina"));
            setAssuntos(getDistinct("assunto"));
            setModalidades(getDistinct("modalidade"));
            setBancas(getDistinct("banca"));
            setLoading(false);
        };
        fetchData();
    }, []);

    function handleChange(
        e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
    ) {
        const { name, value, type } = e.target;
        setSelected((prev) => ({
            ...prev,
            [name]: type === "checkbox"
                ? (e.target as HTMLInputElement).checked
                : value,
        }));
    }

    function handleFiltrar(e: React.FormEvent) {
        e.preventDefault();
        onFiltrar?.(selected);
    }

    function handleLimpar() {
        setSelected({
            instituicao: "",
            cargo: "",
            disciplina: "",
            assunto: "",
            modalidade: "",
            banca: "",
            excluirRespondidas: false,
        });
        onFiltrar?.({});
    }

    return (
        <div className="bg-card border border-border rounded-2xl shadow-sm p-6 md:p-8 my-2 max-w-full">
            <form
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
                onSubmit={handleFiltrar}
            >
                {/* Instituição */}
                <div>
                    <label className="block mb-2 text-sm font-medium text-muted-foreground">
                        Instituição
                    </label>
                    <select
                        name="instituicao"
                        className="w-full bg-muted border border-border rounded-lg px-4 py-3 text-foreground text-base focus:ring-2 focus:ring-primary outline-none shadow-sm transition"
                        value={selected.instituicao}
                        onChange={handleChange}
                        disabled={loading}
                    >
                        <option value="">Selecione</option>
                        {instituicoes.map((nome) => (
                            <option key={nome} value={nome}>
                                {nome}
                            </option>
                        ))}
                    </select>
                </div>
                {/* Cargo */}
                <div>
                    <label className="block mb-2 text-sm font-medium text-muted-foreground">
                        Cargo
                    </label>
                    <select
                        name="cargo"
                        className="w-full bg-muted border border-border rounded-lg px-4 py-3 text-foreground text-base focus:ring-2 focus:ring-primary outline-none shadow-sm transition"
                        value={selected.cargo}
                        onChange={handleChange}
                        disabled={loading}
                    >
                        <option value="">Selecione</option>
                        {cargos.map((nome) => (
                            <option key={nome} value={nome}>
                                {nome}
                            </option>
                        ))}
                    </select>
                </div>
                {/* Disciplina */}
                <div>
                    <label className="block mb-2 text-sm font-medium text-muted-foreground">
                        Disciplina
                    </label>
                    <select
                        name="disciplina"
                        className="w-full bg-muted border border-border rounded-lg px-4 py-3 text-foreground text-base focus:ring-2 focus:ring-primary outline-none shadow-sm transition"
                        value={selected.disciplina}
                        onChange={handleChange}
                        disabled={loading}
                    >
                        <option value="">Selecione</option>
                        {disciplinas.map((nome) => (
                            <option key={nome} value={nome}>
                                {nome}
                            </option>
                        ))}
                    </select>
                </div>
                {/* Assunto */}
                <div>
                    <label className="block mb-2 text-sm font-medium text-muted-foreground">
                        Assunto
                    </label>
                    <select
                        name="assunto"
                        className="w-full bg-muted border border-border rounded-lg px-4 py-3 text-foreground text-base focus:ring-2 focus:ring-primary outline-none shadow-sm transition"
                        value={selected.assunto}
                        onChange={handleChange}
                        disabled={loading}
                    >
                        <option value="">Selecione</option>
                        {assuntos.map((nome) => (
                            <option key={nome} value={nome}>
                                {nome}
                            </option>
                        ))}
                    </select>
                </div>
                {/* Modalidade */}
                <div>
                    <label className="block mb-2 text-sm font-medium text-muted-foreground">
                        Modalidade
                    </label>
                    <select
                        name="modalidade"
                        className="w-full bg-muted border border-border rounded-lg px-4 py-3 text-foreground text-base focus:ring-2 focus:ring-primary outline-none shadow-sm transition"
                        value={selected.modalidade}
                        onChange={handleChange}
                        disabled={loading}
                    >
                        <option value="">Selecione</option>
                        {modalidades.map((nome) => (
                            <option key={nome} value={nome}>
                                {nome}
                            </option>
                        ))}
                    </select>
                </div>
                {/* Banca */}
                <div>
                    <label className="block mb-2 text-sm font-medium text-muted-foreground">
                        Banca
                    </label>
                    <select
                        name="banca"
                        className="w-full bg-muted border border-border rounded-lg px-4 py-3 text-foreground text-base focus:ring-2 focus:ring-primary outline-none shadow-sm transition"
                        value={selected.banca}
                        onChange={handleChange}
                        disabled={loading}
                    >
                        <option value="">Selecione</option>
                        {bancas.map((nome) => (
                            <option key={nome} value={nome}>
                                {nome}
                            </option>
                        ))}
                    </select>
                </div>
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
