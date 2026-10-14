"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminApi, cartao, reais } from "./adminApi";

type Resumo = {
    assinantesAtivos: number;
    leads7: number;
    convertidos7: number;
    conversao7: number;
    eventosFalhos7: number;
    comentariosRevisar: number;
    denunciasPendentes: number;
    questoesAcervo: number;
    questoesOcultas: number;
    vendasMes: number;
    faturamentoMes: number;
};

function Indicador({ titulo, valor, detalhe, alerta, href }: { titulo: string; valor: string; detalhe?: string; alerta?: boolean; href?: string }) {
    const corpo = (
        <div className={`${cartao} h-full ${alerta ? "border-red-300 bg-red-50" : ""}`}>
            <div className="text-xs font-semibold uppercase tracking-wide text-[#7b8bb0]">{titulo}</div>
            <div className={`mt-1 text-3xl font-extrabold ${alerta ? "text-red-700" : "text-[#232939]"}`}>{valor}</div>
            {detalhe && <div className="mt-1 text-sm text-[#7b8bb0]">{detalhe}</div>}
        </div>
    );
    return href ? <Link href={href} className="block hover:opacity-90">{corpo}</Link> : corpo;
}

export default function AdminResumo() {
    const [dados, setDados] = useState<Resumo | null>(null);
    const [erro, setErro] = useState("");

    useEffect(() => {
        adminApi<Resumo>("/api/admin/resumo").then(setDados).catch((e) => setErro(e.message));
    }, []);

    if (erro) return <div className="text-red-600">{erro}</div>;
    if (!dados) return <div className="animate-pulse text-[#7b8bb0]">Carregando indicadores...</div>;

    const n = (v: number) => v.toLocaleString("pt-BR");

    return (
        <div className="flex flex-col gap-6">
            <section>
                <h2 className="mb-3 text-lg font-bold text-[#232939]">Vendas</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Indicador titulo="Assinantes com acesso" valor={n(dados.assinantesAtivos)} href="/admin?tab=vendas" />
                    <Indicador titulo="Vendas no mês" valor={n(dados.vendasMes)} detalhe={`${reais(dados.faturamentoMes)} brutos`} />
                    <Indicador titulo="Cadastros (7 dias)" valor={n(dados.leads7)} detalhe={`${n(dados.convertidos7)} compraram • ${dados.conversao7}%`} />
                    <Indicador
                        titulo="Avisos da Kiwify com falha (7 dias)"
                        valor={n(dados.eventosFalhos7)}
                        detalhe="Veja em Vendas → Eventos"
                        alerta={dados.eventosFalhos7 > 0}
                        href="/admin?tab=vendas"
                    />
                </div>
            </section>

            <section>
                <h2 className="mb-3 text-lg font-bold text-[#232939]">Conteúdo</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Indicador titulo="Questões no acervo" valor={n(dados.questoesAcervo)} detalhe={`${n(dados.questoesOcultas)} ocultas`} href="/admin?tab=questoes" />
                    <Indicador
                        titulo="Comentários para revisar"
                        valor={n(dados.comentariosRevisar)}
                        detalhe="Possível problema no gabarito"
                        alerta={dados.comentariosRevisar > 0}
                        href="/admin?tab=moderacao"
                    />
                    <Indicador
                        titulo="Denúncias pendentes"
                        valor={n(dados.denunciasPendentes)}
                        alerta={dados.denunciasPendentes > 0}
                        href="/admin?tab=moderacao"
                    />
                </div>
            </section>
        </div>
    );
}
