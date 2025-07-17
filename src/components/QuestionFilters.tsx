"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

interface Option {
    id: string;
    nome: string;
}

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
    // Estados para os dados de cada filtro
    const [instituicoes, setInstituicoes] = useState<Option[]>([]);
    const [cargos, setCargos] = useState<Option[]>([]);
    const [disciplinas, setDisciplinas] = useState<Option[]>([]);
    const [assuntos, setAssuntos] = useState<Option[]>([]);
    const [modalidades, setModalidades] = useState<Option[]>([]);
    const [bancas, setBancas] = useState<Option[]>([]);
    const [loading, setLoading] = useState(false);

    // Estados para o filtro selecionado
    const [selected, setSelected] = useState<Filters>({
        instituicao: "",
        cargo: "",
        disciplina: "",
        assunto: "",
        modalidade: "",
        banca: "",
        excluirRespondidas: false,
    });

    // Busca os dados dos filtros no banco ao montar o componente
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);

            const [
                { data: inst },
                { data: carg },
                { data: disc },
                { data: ass },
                { data: mod },
                { data: ban },
            ] = await Promise.all([
                supabase.from("instituicoes").select("id, nome").order("nome"),
                supabase.from("cargos").select("id, nome").order("nome"),
                supabase.from("disciplinas").select("id, nome").order("nome"),
                supabase.from("assuntos").select("id, nome").order("nome"),
                supabase.from("modalidades").select("id, nome").order("nome"),
                supabase.from("bancas").select("id, nome").order("nome"),
            ]);
            setInstituicoes(inst || []);
            setCargos(carg || []);
            setDisciplinas(disc || []);
            setAssuntos(ass || []);
            setModalidades(mod || []);
            setBancas(ban || []);

            setLoading(false);
        };
        fetchData();
    }, []);

    // Corrigido para funcionar com checkbox
    const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
        const target = e.target as HTMLInputElement | HTMLSelectElement;
        const { name, value, type } = target;
        setSelected((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? (target as HTMLInputElement).checked : value,
        }));
    };

    // Aplicar filtros
    const handleFiltrar = (e: React.FormEvent) => {
        e.preventDefault();
        if (onFiltrar) onFiltrar(selected);
    };

    // Limpar filtros
    const handleLimpar = () => {
        setSelected({
            instituicao: "",
            cargo: "",
            disciplina: "",
            assunto: "",
            modalidade: "",
            banca: "",
            excluirRespondidas: false,
        });
        if (onFiltrar) onFiltrar({});
    };

    return (
        <div className="bg-white border border-[#E3E8F3] rounded-2xl shadow-sm p-6 md:p-8 my-2 max-w-full">
            <form
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
                onSubmit={handleFiltrar}
            >
                {/* Instituição */}
                <div>
                    <label className="block mb-2 text-sm font-medium text-[#425179]">Instituição</label>
                    <select
                        name="instituicao"
                        className="w-full bg-white border border-[#D8DFEA] rounded-lg px-4 py-3 text-[#232939] text-base focus:ring-2 focus:ring-[#6a88d7] outline-none shadow-sm transition"
                        value={selected.instituicao}
                        onChange={handleChange}
                        disabled={loading}
                    >
                        <option value="">Selecione</option>
                        {instituicoes.map(opt => (
                            <option key={opt.id} value={opt.id}>{opt.nome}</option>
                        ))}
                    </select>
                </div>
                {/* Cargo */}
                <div>
                    <label className="block mb-2 text-sm font-medium text-[#425179]">Cargo</label>
                    <select
                        name="cargo"
                        className="w-full bg-white border border-[#D8DFEA] rounded-lg px-4 py-3 text-[#232939] text-base focus:ring-2 focus:ring-[#6a88d7] outline-none shadow-sm transition"
                        value={selected.cargo}
                        onChange={handleChange}
                        disabled={loading}
                    >
                        <option value="">Selecione</option>
                        {cargos.map(opt => (
                            <option key={opt.id} value={opt.id}>{opt.nome}</option>
                        ))}
                    </select>
                </div>
                {/* Disciplina */}
                <div>
                    <label className="block mb-2 text-sm font-medium text-[#425179]">Disciplina</label>
                    <select
                        name="disciplina"
                        className="w-full bg-white border border-[#D8DFEA] rounded-lg px-4 py-3 text-[#232939] text-base focus:ring-2 focus:ring-[#6a88d7] outline-none shadow-sm transition"
                        value={selected.disciplina}
                        onChange={handleChange}
                        disabled={loading}
                    >
                        <option value="">Selecione</option>
                        {disciplinas.map(opt => (
                            <option key={opt.id} value={opt.id}>{opt.nome}</option>
                        ))}
                    </select>
                </div>
                {/* Assunto */}
                <div>
                    <label className="block mb-2 text-sm font-medium text-[#425179]">Assunto</label>
                    <select
                        name="assunto"
                        className="w-full bg-white border border-[#D8DFEA] rounded-lg px-4 py-3 text-[#232939] text-base focus:ring-2 focus:ring-[#6a88d7] outline-none shadow-sm transition"
                        value={selected.assunto}
                        onChange={handleChange}
                        disabled={loading}
                    >
                        <option value="">Selecione</option>
                        {assuntos.map(opt => (
                            <option key={opt.id} value={opt.id}>{opt.nome}</option>
                        ))}
                    </select>
                </div>
                {/* Modalidade */}
                <div>
                    <label className="block mb-2 text-sm font-medium text-[#425179]">Modalidade</label>
                    <select
                        name="modalidade"
                        className="w-full bg-white border border-[#D8DFEA] rounded-lg px-4 py-3 text-[#232939] text-base focus:ring-2 focus:ring-[#6a88d7] outline-none shadow-sm transition"
                        value={selected.modalidade}
                        onChange={handleChange}
                        disabled={loading}
                    >
                        <option value="">Selecione</option>
                        {modalidades.map(opt => (
                            <option key={opt.id} value={opt.id}>{opt.nome}</option>
                        ))}
                    </select>
                </div>
                {/* Banca */}
                <div>
                    <label className="block mb-2 text-sm font-medium text-[#425179]">Banca</label>
                    <select
                        name="banca"
                        className="w-full bg-white border border-[#D8DFEA] rounded-lg px-4 py-3 text-[#232939] text-base focus:ring-2 focus:ring-[#6a88d7] outline-none shadow-sm transition"
                        value={selected.banca}
                        onChange={handleChange}
                        disabled={loading}
                    >
                        <option value="">Selecione</option>
                        {bancas.map(opt => (
                            <option key={opt.id} value={opt.id}>{opt.nome}</option>
                        ))}
                    </select>
                </div>

                {/* Excluir Questões */}
                <div className="col-span-full mt-2">
                    <fieldset className="flex items-center gap-4 border border-[#E3E8F3] bg-[#f9fbfd] rounded-xl px-4 py-3">
                        <legend className="text-[#425179] text-sm font-semibold mr-3">
                            Excluir Questões:
                        </legend>
                        <label className="flex items-center gap-2 text-sm font-medium text-[#232939] cursor-pointer select-none">
                            <input
                                name="excluirRespondidas"
                                type="checkbox"
                                className="form-checkbox accent-[#6a88d7] w-5 h-5 rounded border border-[#D8DFEA] transition"
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
                        className="bg-[#6a88d7] hover:bg-[#5272b4] text-white font-bold px-6 py-2 rounded-lg border border-[#6a88d7] shadow-sm text-sm transition"
                        disabled={loading}
                    >
                        Aplicar Filtros
                    </button>
                    <button
                        type="button"
                        className="bg-white hover:bg-[#f5f7fa] text-[#232939] font-semibold px-6 py-2 rounded-lg border border-[#D8DFEA] shadow-sm text-sm transition"
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
