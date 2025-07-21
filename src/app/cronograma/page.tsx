"use client";

import React, { useEffect, useState } from "react";
import { Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const diasDaSemana = [
    { nome: "Segunda", abrev: "Seg" },
    { nome: "Terça", abrev: "Ter" },
    { nome: "Quarta", abrev: "Qua" },
    { nome: "Quinta", abrev: "Qui" },
    { nome: "Sexta", abrev: "Sex" },
    { nome: "Sábado", abrev: "Sáb" },
    { nome: "Domingo", abrev: "Dom" },
];

const blocosPadrao = [
    { hora: "08:00 - 09:00" },
    { hora: "09:00 - 10:00" },
    { hora: "14:00 - 15:00" },
    { hora: "20:00 - 21:00" },
];

export default function CronogramaSemanalPage() {
    const [blocos, setBlocos] = useState<{ hora: string, atividades: string[] }[]>([]);
    const [edit, setEdit] = useState<{ i: number; j: number } | null>(null);
    const [novoBloco, setNovoBloco] = useState("");
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState("");
    const [cronogramaId, setCronogramaId] = useState<string | null>(null);
    const [modoCards, setModoCards] = useState(false); // true = mobile/carrossel
    const [cardDiaAtivo, setCardDiaAtivo] = useState(0);

    // Detectar modo mobile
    useEffect(() => {
        function checkMobile() {
            setModoCards(window.innerWidth < 640); // sm: 640px
        }
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    // Carregar cronograma do usuário ao abrir a página
    useEffect(() => {
        async function fetchCronograma() {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setLoading(false);
                return;
            }
            const { data, error } = await supabase
                .from("cronograma")
                .select("*")
                .eq("user_id", user.id)
                .single();

            if (!data || error) {
                // Se não existir, cria um novo cronograma padrão
                const blocosInicial = blocosPadrao.map(b => ({
                    hora: b.hora,
                    atividades: Array(7).fill(""),
                }));
                const { data: criado } = await supabase
                    .from("cronograma")
                    .insert({
                        user_id: user.id,
                        blocos: blocosInicial,
                    })
                    .select("*")
                    .single();
                setBlocos(criado?.blocos ?? blocosInicial);
                setCronogramaId(criado?.id ?? null);
            } else {
                setBlocos(data.blocos ?? []);
                setCronogramaId(data.id);
            }
            setLoading(false);
        }
        fetchCronograma();
    }, []);

    // Salvar alterações no supabase
    useEffect(() => {
        if (!cronogramaId || loading) return;
        async function salvar() {
            setMsg("Salvando...");
            await supabase
                .from("cronograma")
                .update({ blocos, atualizado_em: new Date().toISOString() })
                .eq("id", cronogramaId);
            setMsg("Cronograma salvo!");
            setTimeout(() => setMsg(""), 1200);
        }
        salvar();
    }, [blocos, cronogramaId, loading]);

    function handleCellEdit(i: number, j: number, value: string) {
        setBlocos((prev) => {
            const next = [...prev];
            next[i] = { ...next[i], atividades: [...next[i].atividades] };
            next[i].atividades[j] = value;
            return next;
        });
    }
    function handleAddBloco() {
        if (!novoBloco.trim()) return;
        setBlocos([...blocos, { hora: novoBloco, atividades: Array(7).fill("") }]);
        setNovoBloco("");
    }
    function handleRemoveBloco(i: number) {
        setBlocos(blocos.filter((_, idx) => idx !== i));
    }

    // Navegação dos cards (mobile)
    function prevCard() { setCardDiaAtivo(v => (v + 6) % 7); }
    function nextCard() { setCardDiaAtivo(v => (v + 1) % 7); }

    return (
        <div className="w-full max-w-5xl mx-auto px-2 sm:px-4 py-7 flex flex-col gap-8">
            <h1 className="text-2xl font-bold mb-4 text-[#232939]">Cronograma Semanal de Estudos</h1>
            {/* Novo bloco */}
            <div className="flex flex-col sm:flex-row items-center gap-3 mb-4">
                <input
                    type="text"
                    className="border border-[#e3e8f3] rounded-lg px-3 py-2 text-sm w-56 focus:ring-2 focus:ring-[#6a88d7] outline-none shadow-sm"
                    placeholder="Ex: 18:00 - 19:00"
                    value={novoBloco}
                    onChange={e => setNovoBloco(e.target.value)}
                    maxLength={20}
                    disabled={loading}
                />
                <button
                    className="flex items-center gap-2 bg-[#6a88d7] hover:bg-[#5272b4] text-white font-bold px-4 py-2 rounded-lg text-sm shadow transition"
                    onClick={handleAddBloco}
                    disabled={loading}
                >
                    <Plus className="w-4 h-4" /> Adicionar Bloco
                </button>
            </div>

            {/* MOBILE: Cards/carrossel */}
            {modoCards ? (
                <div className="w-full flex flex-col items-center">
                    <div className="flex items-center justify-center gap-1 mb-4">
                        <button
                            className="p-2 rounded-full bg-[#f5f7fa] border border-[#e3e8f3] hover:bg-[#e3e8f3] transition"
                            onClick={prevCard}
                        >
                            <ChevronLeft className="w-5 h-5 text-[#6a88d7]" />
                        </button>
                        <span className="text-lg font-bold text-[#232939] w-32 text-center">
                            {diasDaSemana[cardDiaAtivo].nome}
                        </span>
                        <button
                            className="p-2 rounded-full bg-[#f5f7fa] border border-[#e3e8f3] hover:bg-[#e3e8f3] transition"
                            onClick={nextCard}
                        >
                            <ChevronRight className="w-5 h-5 text-[#6a88d7]" />
                        </button>
                    </div>
                    <div className="w-full max-w-md mx-auto bg-white rounded-2xl border border-[#e3e8f3] shadow-lg p-3 transition-all">
                        <table className="w-full text-xs">
                            <thead>
                                <tr>
                                    <th className="bg-[#f3f6fa] text-[#232939] font-bold px-2 py-2 rounded-tl-2xl text-center min-w-[70px]">
                                        Horário
                                    </th>
                                    <th className="bg-[#f3f6fa] text-[#232939] font-bold px-2 py-2 rounded-tr-2xl text-center">
                                        Atividade
                                    </th>
                                    <th className="bg-[#f3f6fa] px-1 py-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {blocos.map((bloco, i) => (
                                    <tr key={i} className="border-b border-[#f3f6fa]">
                                        <td className="px-2 py-2 text-[#6a88d7] font-semibold text-center bg-[#f8fafc] whitespace-nowrap rounded-l-2xl text-xs">
                                            {bloco.hora}
                                        </td>
                                        <td
                                            className="p-1 text-center group cursor-pointer relative min-w-[90px]"
                                            onClick={() => setEdit({ i, j: cardDiaAtivo })}
                                        >
                                            {edit && edit.i === i && edit.j === cardDiaAtivo ? (
                                                <input
                                                    className="w-full rounded px-1 py-1 border border-[#6a88d7] text-xs outline-none"
                                                    autoFocus
                                                    value={bloco.atividades[cardDiaAtivo]}
                                                    onChange={e => handleCellEdit(i, cardDiaAtivo, e.target.value)}
                                                    onBlur={() => setEdit(null)}
                                                    onKeyDown={e => { if (e.key === "Enter") setEdit(null); }}
                                                    placeholder="Tarefa..."
                                                    maxLength={32}
                                                />
                                            ) : (
                                                <div className="transition-colors px-1 py-2 rounded group-hover:bg-[#eaf0fc] text-[#232939] min-h-[20px]">
                                                    {bloco.atividades[cardDiaAtivo] || (
                                                        <span className="text-[#b1bad3] italic">—</span>
                                                    )}
                                                    {bloco.atividades[cardDiaAtivo] && (
                                                        <button
                                                            className="absolute top-1 right-1 text-xs text-[#b1bad3] hover:text-red-400"
                                                            onClick={e => { e.stopPropagation(); handleCellEdit(i, cardDiaAtivo, ""); }}
                                                            tabIndex={-1}
                                                            aria-label="Limpar"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        {/* Remover linha */}
                                        <td className="pl-1 pr-1 text-center align-middle">
                                            <button
                                                className="bg-red-50 hover:bg-red-100 border border-red-100 text-red-400 rounded p-1 transition"
                                                title="Remover Bloco"
                                                onClick={() => handleRemoveBloco(i)}
                                                disabled={loading}
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {/* Navegação bolinhas (dots) */}
                    <div className="flex gap-2 justify-center mt-3">
                        {diasDaSemana.map((_, idx) => (
                            <button
                                key={idx}
                                className={`w-2.5 h-2.5 rounded-full transition ${cardDiaAtivo === idx ? "bg-[#6a88d7]" : "bg-[#e3e8f3]"}`}
                                onClick={() => setCardDiaAtivo(idx)}
                                aria-label={`Ir para ${diasDaSemana[idx].nome}`}
                            />
                        ))}
                    </div>
                </div>
            ) : (
                // DESKTOP/TABLET: tabela original
                <div className="w-full overflow-x-auto rounded-2xl border border-[#e3e8f3] shadow bg-white scrollbar-thin scrollbar-thumb-[#cdd3eb] scrollbar-track-transparent">
                    <table className="min-w-[700px] sm:min-w-full text-xs sm:text-sm">
                        <thead>
                            <tr>
                                <th className="bg-[#f3f6fa] text-[#232939] font-bold px-2 py-2 rounded-tl-2xl text-center min-w-[70px] sm:min-w-[110px]">
                                    Horário
                                </th>
                                {diasDaSemana.map((dia) => (
                                    <th
                                        key={dia.nome}
                                        className="bg-[#f3f6fa] text-[#232939] font-bold px-2 py-2 text-center min-w-[64px] sm:min-w-[110px]"
                                    >
                                        <span className="block sm:hidden">{dia.abrev}</span>
                                        <span className="hidden sm:block">{dia.nome}</span>
                                    </th>
                                ))}
                                <th className="bg-[#f3f6fa] px-1 py-2 rounded-tr-2xl"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {blocos.map((bloco, i) => (
                                <tr key={i} className="border-b border-[#f3f6fa]">
                                    <td className="px-2 py-2 text-[#6a88d7] font-semibold text-center bg-[#f8fafc] whitespace-nowrap rounded-l-2xl text-xs sm:text-sm">
                                        {bloco.hora}
                                    </td>
                                    {diasDaSemana.map((_, j) => (
                                        <td
                                            key={j}
                                            className="p-1 text-center group cursor-pointer min-w-[64px] sm:min-w-[110px] relative"
                                            onClick={() => setEdit({ i, j })}
                                        >
                                            {edit && edit.i === i && edit.j === j ? (
                                                <input
                                                    className="w-full rounded px-1 py-1 border border-[#6a88d7] text-xs sm:text-sm outline-none"
                                                    autoFocus
                                                    value={bloco.atividades[j]}
                                                    onChange={e => handleCellEdit(i, j, e.target.value)}
                                                    onBlur={() => setEdit(null)}
                                                    onKeyDown={e => { if (e.key === "Enter") setEdit(null); }}
                                                    placeholder="Tarefa..."
                                                    maxLength={32}
                                                />
                                            ) : (
                                                <div className="transition-colors px-1 py-2 rounded group-hover:bg-[#eaf0fc] text-[#232939] min-h-[20px]">
                                                    {bloco.atividades[j] || (
                                                        <span className="text-[#b1bad3] italic">—</span>
                                                    )}
                                                    {bloco.atividades[j] && (
                                                        <button
                                                            className="absolute top-1 right-1 text-xs text-[#b1bad3] hover:text-red-400"
                                                            onClick={e => { e.stopPropagation(); handleCellEdit(i, j, ""); }}
                                                            tabIndex={-1}
                                                            aria-label="Limpar"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    ))}
                                    <td className="pl-1 pr-1 text-center align-middle rounded-r-2xl">
                                        <button
                                            className="bg-red-50 hover:bg-red-100 border border-red-100 text-red-400 rounded p-1 transition"
                                            title="Remover Bloco"
                                            onClick={() => handleRemoveBloco(i)}
                                            disabled={loading}
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

            <div className="text-xs text-[#7b8bb0] mt-1 ml-1">
                {modoCards
                    ? "Arraste para o lado ou use as setas para navegar pelos dias da semana."
                    : "Toque/click nas células para editar. Suas alterações são salvas automaticamente!"}
            </div>
            {msg && <div className="text-center text-green-600 mt-2">{msg}</div>}
        </div>
    );
}
