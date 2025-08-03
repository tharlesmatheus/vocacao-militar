"use client";
import { useEffect, useState } from "react";
import { Star, CheckCircle, CreditCard } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type PlanoStatus = "ativo" | "inativo" | "pendente";

export default function PlanoPage() {
    const [status, setStatus] = useState<PlanoStatus>("inativo");
    const [proximoPagamento, setProximoPagamento] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        async function fetchPlano() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data } = await supabase
                .from("planos")
                .select("*")
                .eq("user_id", user.id)
                .single();

            if (data) {
                setStatus(data.status as PlanoStatus);
                setProximoPagamento(data.proximo_pagamento);
            }
        }
        fetchPlano();
    }, []);

    // Checkout Kiwify
    async function handleCheckout() {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !user.email) {
            alert("Faça login para assinar!");
            setLoading(false);
            return;
        }
        window.location.href = `https://pay.kiwify.com.br/ptQ62f5?email=${encodeURIComponent(user.email)}`;
        setLoading(false);
    }

    return (
        <div className="w-full max-w-5xl mx-auto px-2 sm:px-4 md:px-8 py-8 flex flex-col gap-8">
            <div className="bg-card rounded-2xl shadow border border-border px-6 py-7 flex flex-col gap-5 relative transition">
                {/* Selo de status */}
                <span className={`absolute top-5 right-6 flex items-center gap-2 rounded-full px-4 py-1 shadow-sm font-bold text-xs
                    ${status === "ativo"
                        ? "bg-green-100 border border-green-200 text-green-600"
                        : status === "pendente"
                            ? "bg-yellow-100 border border-yellow-300 text-yellow-600"
                            : "bg-muted border border-border text-muted-foreground"
                    }`
                }>
                    <CheckCircle className="w-4 h-4" />
                    {status === "ativo"
                        ? "Ativo"
                        : status === "pendente"
                            ? "Pendente"
                            : "Inativo"}
                </span>

                <div className="flex flex-col md:flex-row items-center md:items-start gap-7">
                    {/* Plano */}
                    <div className="flex flex-row md:flex-col items-center md:items-start gap-4 md:gap-3 w-full md:w-1/3">
                        <span className="rounded-xl bg-primary/10 p-4">
                            <Star className="w-10 h-10 text-primary" />
                        </span>
                        <div>
                            <h2 className="font-bold text-xl text-foreground mb-1">Plano Premium</h2>
                            <div className="text-muted-foreground text-sm">
                                Acesso completo à plataforma
                            </div>
                        </div>
                    </div>

                    {/* Pagamento */}
                    <div className="flex-1">
                        <div className="rounded-xl border border-border bg-muted p-5 mb-2">
                            <div className="flex items-center gap-2 font-semibold text-base mb-2 text-foreground">
                                <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                                    <rect x="3" y="4" width="18" height="18" rx="4" stroke="#6a88d7" strokeWidth="2" />
                                    <path d="M16 2v4M8 2v4" stroke="#6a88d7" strokeWidth="2" strokeLinecap="round" />
                                    <path d="M3 10h18" stroke="#6a88d7" strokeWidth="2" />
                                </svg>
                                Próximo Pagamento
                            </div>
                            <div className="text-2xl font-bold mb-2 text-foreground">
                                {status === "ativo" && proximoPagamento
                                    ? new Date(proximoPagamento).toLocaleDateString("pt-BR")
                                    : "—"}
                            </div>
                            <div className="text-sm text-muted-foreground">Valor: <b>R$ 7,00</b>/mês</div>
                        </div>
                    </div>

                    {/* Ações de Pagamento */}
                    <div className="flex flex-col gap-2 w-full md:w-1/3">
                        <div className="rounded-xl border border-border bg-muted p-5 mb-2">
                            <div className="flex items-center gap-2 font-semibold text-base mb-2 text-foreground">
                                <CreditCard className="w-5 h-5" />
                                Método de Pagamento
                            </div>
                            <div className="text-sm text-foreground mb-2">
                                {status === "ativo"
                                    ? "Pagamento pela Kiwify"
                                    : "Nenhum cadastrado"}
                            </div>
                            <div className="p-3 rounded border text-sm bg-muted text-muted-foreground">
                                Alterações e cancelamentos devem ser feitos pelo painel do comprador da Kiwify. Em caso de dúvida, contate nosso suporte.
                            </div>
                        </div>

                        <div>
                            <div className="font-bold mb-1 text-foreground text-sm">Ações</div>
                            {status === "ativo" ? (
                                <div className="p-3 rounded border text-sm bg-muted text-muted-foreground">
                                    Seu plano está ativo! Para cancelar ou alterar sua assinatura, acesse o painel do cliente da Kiwify ou utilize o link enviado por e-mail na compra.
                                </div>
                            ) : (
                                <button
                                    className={`block w-full rounded-lg bg-primary hover:bg-primary/80 text-white font-bold px-4 py-2 border border-primary transition text-sm ${loading && "opacity-60 pointer-events-none"}`}
                                    onClick={handleCheckout}
                                    disabled={loading}
                                >
                                    {loading ? "Carregando..." : "Assinar Agora"}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Recursos Inclusos */}
            <div className="bg-card rounded-2xl shadow border border-border px-6 py-7 mt-2">
                <h2 className="font-bold text-lg mb-4 text-foreground">Recursos Inclusos no Seu Plano</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ul className="flex flex-col gap-3 text-foreground text-base">
                        <li className="flex items-center gap-3">
                            <CheckCircle className="w-5 h-5 text-green-500" />
                            Acesso ilimitado a todas as questões
                        </li>
                        <li className="flex items-center gap-3">
                            <CheckCircle className="w-5 h-5 text-green-500" />
                            Sistema de conquistas e gamificação
                        </li>
                        <li className="flex items-center gap-3">
                            <CheckCircle className="w-5 h-5 text-green-500" />
                            Cronograma personalizado de estudos
                        </li>
                        <li className="flex items-center gap-3">
                            <CheckCircle className="w-5 h-5 text-green-500" />
                            Suporte prioritário
                        </li>
                    </ul>
                    <ul className="flex flex-col gap-3 text-foreground text-base">
                        <li className="flex items-center gap-3">
                            <CheckCircle className="w-5 h-5 text-green-500" />
                            Estatísticas detalhadas de desempenho
                        </li>
                        <li className="flex items-center gap-3">
                            <CheckCircle className="w-5 h-5 text-green-500" />
                            Ferramentas de estudo (Pomodoro, cadernos)
                        </li>
                        <li className="flex items-center gap-3">
                            <CheckCircle className="w-5 h-5 text-green-500" />
                            Sistema de revisão espaçada
                        </li>
                        <li className="flex items-center gap-3">
                            <CheckCircle className="w-5 h-5 text-green-500" />
                            Atualizações constantes do banco de questões
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
