"use client";

import { useEffect, useMemo, useState } from "react";
import { Star, CheckCircle, CreditCard } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type PlanoStatus = "ativo" | "inativo" | "pendente";

type PlanoRow = {
    id?: string;
    user_id?: string | null;
    email?: string | null;
    status: PlanoStatus;
    proximo_pagamento?: string | null; // ISO string no banco (timestamp/date)
    access_until?: string | null;      // opcional (se você salvar do webhook)
    updated_at?: string | null;
};

const CHECKOUT_URL = "https://pay.kiwify.com.br/ptQ62f5";
const PRECO_MENSAL = "R$ 7,00";

function toPtBRDate(dateIso: string) {
    const d = new Date(dateIso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("pt-BR");
}

export default function PlanoPage() {
    const [status, setStatus] = useState<PlanoStatus>("inativo");
    const [proximoPagamento, setProximoPagamento] = useState<string | null>(null);
    const [accessUntil, setAccessUntil] = useState<string | null>(null);

    const [loading, setLoading] = useState(false);
    const [loadingPlano, setLoadingPlano] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const emDia = useMemo(() => {
        // Regra simples:
        // 1) Se tiver access_until, confia nela (mais precisa).
        // 2) Senão, considera em dia se status ativo.
        if (accessUntil) {
            const t = new Date(accessUntil).getTime();
            if (Number.isNaN(t)) return status === "ativo";
            return status === "ativo" && t >= Date.now();
        }
        return status === "ativo";
    }, [status, accessUntil]);

    useEffect(() => {
        let unsub: { data: { subscription: { unsubscribe: () => void } | null } } | null = null;

        async function fetchPlano() {
            setLoadingPlano(true);
            setErrorMsg(null);

            const { data: authData, error: authErr } = await supabase.auth.getUser();
            const user = authData?.user;

            if (authErr) {
                setErrorMsg("Erro ao verificar login.");
                setLoadingPlano(false);
                return;
            }
            if (!user) {
                setStatus("inativo");
                setProximoPagamento(null);
                setAccessUntil(null);
                setLoadingPlano(false);
                return;
            }

            // ✅ CORREÇÃO PRINCIPAL:
            // Buscamos primeiro por user_id (se existir registro amarrado ao usuário),
            // e se não achar, fazemos fallback por email (porque seu webhook faz upsert por email).
            let plano: PlanoRow | null = null;

            const byUser = await supabase
                .from("planos")
                .select("status, proximo_pagamento, access_until, email, user_id")
                .eq("user_id", user.id)
                .maybeSingle();

            if (byUser.error) {
                setErrorMsg("Erro ao buscar seu plano.");
                setLoadingPlano(false);
                return;
            }

            if (byUser.data) {
                plano = byUser.data as PlanoRow;
            } else if (user.email) {
                const byEmail = await supabase
                    .from("planos")
                    .select("status, proximo_pagamento, access_until, email, user_id")
                    .eq("email", user.email)
                    .maybeSingle();

                if (byEmail.error) {
                    setErrorMsg("Erro ao buscar seu plano.");
                    setLoadingPlano(false);
                    return;
                }

                plano = (byEmail.data as PlanoRow | null) ?? null;

                // Se encontrou por email mas ainda não tem user_id, tenta amarrar (boa prática).
                // ⚠️ Isso exige permissão via RLS. Se der erro, só ignora.
                if (plano && !plano.user_id) {
                    await supabase
                        .from("planos")
                        .update({ user_id: user.id })
                        .eq("email", user.email);
                }
            }

            if (plano) {
                setStatus((plano.status as PlanoStatus) ?? "inativo");
                setProximoPagamento(plano.proximo_pagamento ?? null);
                setAccessUntil(plano.access_until ?? null);
            } else {
                setStatus("inativo");
                setProximoPagamento(null);
                setAccessUntil(null);
            }

            setLoadingPlano(false);
        }

        fetchPlano();

        // 🔄 Atualiza automaticamente se o usuário fizer login/logout
        unsub = supabase.auth.onAuthStateChange(() => {
            fetchPlano();
        });

        return () => {
            unsub?.data.subscription?.unsubscribe?.();
        };
    }, []);

    async function handleCheckout() {
        setLoading(true);
        setErrorMsg(null);

        const { data: authData, error: authErr } = await supabase.auth.getUser();
        const user = authData?.user;

        if (authErr) {
            setErrorMsg("Erro ao verificar login.");
            setLoading(false);
            return;
        }

        if (!user || !user.email) {
            setErrorMsg("Faça login para assinar.");
            setLoading(false);
            return;
        }

        // ✅ Boa prática: cria/atualiza um registro "pendente" antes de mandar pro checkout.
        // Assim você garante que existe linha por user_id/email.
        // ⚠️ Isso também depende de RLS permitir. Se falhar, seguimos mesmo assim (webhook vai criar por email).
        try {
            await supabase.from("planos").upsert(
                [
                    {
                        user_id: user.id,
                        email: user.email,
                        status: "pendente",
                        updated_at: new Date().toISOString(),
                    },
                ],
                { onConflict: "email" } // se sua tabela tem unique em email
            );
        } catch {
            // ignora: webhook fará upsert
        }

        // Redireciona com email pré-preenchido (reduz erro do usuário comprar com email diferente)
        window.location.href = `${CHECKOUT_URL}?email=${encodeURIComponent(user.email)}`;
    }

    const badgeClass =
        status === "ativo"
            ? "bg-green-100 border border-green-200 text-green-600"
            : status === "pendente"
                ? "bg-yellow-100 border border-yellow-300 text-yellow-600"
                : "bg-muted border border-border text-muted-foreground";

    const badgeLabel =
        status === "ativo" ? "Ativo" : status === "pendente" ? "Pendente" : "Inativo";

    const proximoPagamentoLabel =
        emDia && proximoPagamento ? toPtBRDate(proximoPagamento) : "—";

    const emDiaLabel = accessUntil
        ? `Acesso até ${toPtBRDate(accessUntil)}`
        : status === "ativo"
            ? "Plano ativo"
            : "Plano inativo";

    return (
        <div className="w-full max-w-5xl mx-auto px-2 sm:px-4 md:px-8 py-8 flex flex-col gap-8">
            <div className="bg-card rounded-2xl shadow border border-border px-6 py-7 flex flex-col gap-5 relative transition">
                {/* Selo de status */}
                <span
                    className={`absolute top-5 right-6 flex items-center gap-2 rounded-full px-4 py-1 shadow-sm font-bold text-xs ${badgeClass}`}
                    title={emDiaLabel}
                >
                    <CheckCircle className="w-4 h-4" />
                    {badgeLabel}
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
                            <div className="text-xs mt-2 text-muted-foreground">
                                {loadingPlano ? "Carregando status..." : emDiaLabel}
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
                                {loadingPlano ? "—" : proximoPagamentoLabel}
                            </div>

                            <div className="text-sm text-muted-foreground">
                                Valor: <b>{PRECO_MENSAL}</b>/mês
                            </div>

                            {accessUntil && (
                                <div className="text-xs mt-2 text-muted-foreground">
                                    Acesso até: <b>{toPtBRDate(accessUntil)}</b>
                                </div>
                            )}
                        </div>

                        {errorMsg && (
                            <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
                                {errorMsg}
                            </div>
                        )}
                    </div>

                    {/* Ações de Pagamento */}
                    <div className="flex flex-col gap-2 w-full md:w-1/3">
                        <div className="rounded-xl border border-border bg-muted p-5 mb-2">
                            <div className="flex items-center gap-2 font-semibold text-base mb-2 text-foreground">
                                <CreditCard className="w-5 h-5" />
                                Método de Pagamento
                            </div>
                            <div className="text-sm text-foreground mb-2">
                                {status === "ativo" || status === "pendente"
                                    ? "Pagamento pela Kiwify"
                                    : "Nenhum cadastrado"}
                            </div>
                            <div className="p-3 rounded border text-sm bg-muted text-muted-foreground">
                                Alterações e cancelamentos devem ser feitos pelo painel do comprador da Kiwify.
                                Em caso de dúvida, contate nosso suporte.
                            </div>
                        </div>

                        <div>
                            <div className="font-bold mb-1 text-foreground text-sm">Ações</div>

                            {status === "ativo" && emDia ? (
                                <div className="p-3 rounded border text-sm bg-muted text-muted-foreground">
                                    Seu plano está ativo! Para cancelar ou alterar sua assinatura, acesse o painel do
                                    cliente da Kiwify ou utilize o link enviado por e-mail na compra.
                                </div>
                            ) : status === "pendente" ? (
                                <div className="p-3 rounded border text-sm bg-muted text-muted-foreground">
                                    Seu pagamento está pendente. Assim que a Kiwify confirmar, seu acesso será liberado
                                    automaticamente. Se você pagou via Pix/boleto, aguarde a compensação.
                                </div>
                            ) : (
                                <button
                                    className={`block w-full rounded-lg bg-primary hover:bg-primary/80 text-white font-bold px-4 py-2 border border-primary transition text-sm ${loading ? "opacity-60 pointer-events-none" : ""
                                        }`}
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