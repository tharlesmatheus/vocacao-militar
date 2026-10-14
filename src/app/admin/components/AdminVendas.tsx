"use client";

import { useEffect, useState } from "react";
import { adminApi, botao, cartao, dataCurta, dataHora, entrada, reais } from "./adminApi";

type Tipo = "planos" | "leads" | "eventos";
type Resposta = { itens: any[]; total: number; porPagina: number };

const ABAS: { id: Tipo; nome: string }[] = [
    { id: "planos", nome: "Assinaturas" },
    { id: "leads", nome: "Cadastros da página" },
    { id: "eventos", nome: "Eventos da Kiwify" },
];

const corStatus: Record<string, string> = {
    ativo: "bg-green-100 text-green-800",
    pendente: "bg-amber-100 text-amber-800",
    inativo: "bg-gray-200 text-gray-700",
    convertido: "bg-green-100 text-green-800",
    checkout: "bg-blue-100 text-blue-800",
};

function Selo({ texto }: { texto: string }) {
    return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${corStatus[texto] ?? "bg-gray-100 text-gray-700"}`}>{texto}</span>;
}

export default function AdminVendas() {
    const [tipo, setTipo] = useState<Tipo>("planos");
    const [pagina, setPagina] = useState(1);
    const [busca, setBusca] = useState("");
    const [filtro, setFiltro] = useState("");
    const [dados, setDados] = useState<Resposta | null>(null);
    const [erro, setErro] = useState("");

    useEffect(() => {
        setDados(null);
        setErro("");
        const qs = new URLSearchParams({ tipo, pagina: String(pagina), busca: filtro });
        adminApi<Resposta>(`/api/admin/vendas?${qs}`).then(setDados).catch((e) => setErro(e.message));
    }, [tipo, pagina, filtro]);

    const paginas = dados ? Math.max(1, Math.ceil(dados.total / dados.porPagina)) : 1;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
                {ABAS.map((a) => (
                    <button
                        key={a.id}
                        onClick={() => { setTipo(a.id); setPagina(1); }}
                        className={`${botao} ${tipo === a.id ? "bg-[#6a88d7] text-white" : "bg-[#eef1f7] text-[#232939]"}`}
                    >
                        {a.nome}
                    </button>
                ))}
                <form
                    className="ml-auto flex gap-2"
                    onSubmit={(e) => { e.preventDefault(); setPagina(1); setFiltro(busca.trim()); }}
                >
                    <input className={entrada} placeholder="Buscar por e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} />
                    <button className={`${botao} bg-[#232939] text-white`}>Buscar</button>
                </form>
            </div>

            {erro && <div className="text-red-600">{erro}</div>}
            {!dados && !erro && <div className="animate-pulse text-[#7b8bb0]">Carregando...</div>}

            {dados && (
                <div className={`${cartao} overflow-x-auto p-0`}>
                    <table className="w-full min-w-[720px] text-sm">
                        <thead className="bg-[#f5f6fa] text-left text-xs uppercase text-[#7b8bb0]">
                            {tipo === "planos" && (
                                <tr><th className="p-3">E-mail</th><th className="p-3">Situação</th><th className="p-3">Acesso até</th><th className="p-3">Último valor</th><th className="p-3">Último evento</th></tr>
                            )}
                            {tipo === "leads" && (
                                <tr><th className="p-3">Nome</th><th className="p-3">E-mail / WhatsApp</th><th className="p-3">Situação</th><th className="p-3">Origem</th><th className="p-3">Data</th></tr>
                            )}
                            {tipo === "eventos" && (
                                <tr><th className="p-3">Data</th><th className="p-3">Evento</th><th className="p-3">E-mail</th><th className="p-3">Aplicado</th><th className="p-3">Detalhe</th></tr>
                            )}
                        </thead>
                        <tbody>
                            {dados.itens.length === 0 && (
                                <tr><td colSpan={5} className="p-6 text-center text-[#7b8bb0]">Nada encontrado.</td></tr>
                            )}
                            {tipo === "planos" && dados.itens.map((p) => (
                                <tr key={p.email} className="border-t border-[#eef1f7]">
                                    <td className="p-3 font-medium">{p.email}</td>
                                    <td className="p-3"><Selo texto={p.status ?? "—"} /></td>
                                    <td className="p-3">{dataCurta(p.access_until)}</td>
                                    <td className="p-3">{reais(p.valor_pago)}</td>
                                    <td className="p-3 text-[#7b8bb0]">{p.ultimo_evento ?? "—"} • {dataHora(p.ultimo_evento_em)}</td>
                                </tr>
                            ))}
                            {tipo === "leads" && dados.itens.map((l) => (
                                <tr key={l.id} className="border-t border-[#eef1f7]">
                                    <td className="p-3 font-medium">{l.nome}</td>
                                    <td className="p-3">
                                        <div>{l.email}</div>
                                        <div className="text-[#7b8bb0]">
                                            {l.telefone ?? "—"}{l.aceite_contato ? " • aceita contato" : " • sem permissão de contato"}
                                        </div>
                                    </td>
                                    <td className="p-3"><Selo texto={l.status} /></td>
                                    <td className="p-3 text-[#7b8bb0]">{l.utm?.utm_source ?? l.utm?.src ?? "direto"}</td>
                                    <td className="p-3">{dataHora(l.created_at)}</td>
                                </tr>
                            ))}
                            {tipo === "eventos" && dados.itens.map((ev) => (
                                <tr key={ev.id} className={`border-t border-[#eef1f7] ${ev.aplicado === false && !/ignorado|recusado|antigo/i.test(ev.motivo ?? "") ? "bg-red-50" : ""}`}>
                                    <td className="p-3">{dataHora(ev.created_at)}</td>
                                    <td className="p-3 font-mono text-xs">{ev.event}</td>
                                    <td className="p-3">{ev.email}</td>
                                    <td className="p-3">{ev.aplicado ? "sim" : ev.aplicado === false ? "não" : "—"}</td>
                                    <td className="p-3 text-[#7b8bb0]">{ev.motivo ?? "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {dados && paginas > 1 && (
                <div className="flex items-center justify-end gap-2 text-sm">
                    <button className={`${botao} bg-[#eef1f7]`} disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</button>
                    <span>Página {pagina} de {paginas} • {dados.total.toLocaleString("pt-BR")} registros</span>
                    <button className={`${botao} bg-[#eef1f7]`} disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>Próxima</button>
                </div>
            )}
        </div>
    );
}
