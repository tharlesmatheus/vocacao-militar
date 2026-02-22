"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
    User2,
    Lock,
    Phone,
    Mail,
    CalendarDays,
    CheckCircle,
    Star,
    CreditCard,
    AlertTriangle,
} from "lucide-react";

type PlanoStatus = "ativo" | "inativo" | "pendente";

type PlanoRow = {
    status: PlanoStatus;
    proximo_pagamento?: string | null;
    access_until?: string | null;
    email?: string | null;
    user_id?: string | null;
};

const CHECKOUT_URL = "https://pay.kiwify.com.br/ptQ62f5";
const PRECO_MENSAL = "R$ 7,00";

function toPtBRDate(dateIso: string) {
    const d = new Date(dateIso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("pt-BR");
}

export default function ContaPage() {
    // -----------------------------
    // Auth / User
    // -----------------------------
    const [loading, setLoading] = useState(true);
    const [savingProfile, setSavingProfile] = useState(false);

    const [isGoogleUser, setIsGoogleUser] = useState(false);
    const [criadoEm, setCriadoEm] = useState("");

    // Perfil
    const [editandoPerfil, setEditandoPerfil] = useState(false);
    const [nome, setNome] = useState("");
    const [email, setEmail] = useState("");
    const [telefone, setTelefone] = useState("");

    // Senha
    const [novaSenha, setNovaSenha] = useState("");
    const [msgPerfil, setMsgPerfil] = useState<string | null>(null);
    const [errPerfil, setErrPerfil] = useState<string | null>(null);

    // -----------------------------
    // Plano
    // -----------------------------
    const [loadingPlano, setLoadingPlano] = useState(true);
    const [loadingCheckout, setLoadingCheckout] = useState(false);

    const [planoStatus, setPlanoStatus] = useState<PlanoStatus>("inativo");
    const [proximoPagamento, setProximoPagamento] = useState<string | null>(null);
    const [accessUntil, setAccessUntil] = useState<string | null>(null);
    const [errPlano, setErrPlano] = useState<string | null>(null);

    const emDia = useMemo(() => {
        // 1) Se houver access_until, confia nela.
        // 2) Senão, considera em dia se status ativo.
        if (accessUntil) {
            const t = new Date(accessUntil).getTime();
            if (Number.isNaN(t)) return planoStatus === "ativo";
            return planoStatus === "ativo" && t >= Date.now();
        }
        return planoStatus === "ativo";
    }, [planoStatus, accessUntil]);

    const badge = useMemo(() => {
        const klass =
            planoStatus === "ativo"
                ? "bg-green-100 border border-green-200 text-green-700"
                : planoStatus === "pendente"
                    ? "bg-yellow-100 border border-yellow-300 text-yellow-700"
                    : "bg-muted border border-border text-muted-foreground";

        const label =
            planoStatus === "ativo"
                ? "Ativo"
                : planoStatus === "pendente"
                    ? "Pendente"
                    : "Inativo";

        return { klass, label };
    }, [planoStatus]);

    const proximoPagamentoLabel = useMemo(() => {
        if (emDia && proximoPagamento) return toPtBRDate(proximoPagamento);
        return "—";
    }, [emDia, proximoPagamento]);

    const emDiaLabel = useMemo(() => {
        if (accessUntil) return `Acesso até ${toPtBRDate(accessUntil)}`;
        if (planoStatus === "ativo") return "Plano ativo";
        if (planoStatus === "pendente") return "Pagamento pendente";
        return "Plano inativo";
    }, [accessUntil, planoStatus]);

    // -----------------------------
    // Load user + plan
    // -----------------------------
    useEffect(() => {
        let unsub:
            | { data: { subscription: { unsubscribe: () => void } | null } }
            | null = null;

        async function fetchUserAndPlan() {
            setLoading(true);
            setLoadingPlano(true);
            setErrPlano(null);
            setErrPerfil(null);
            setMsgPerfil(null);

            const { data: authData, error: authErr } = await supabase.auth.getUser();
            const user = authData?.user;

            if (authErr || !user) {
                // Você pode redirecionar aqui se quiser, mas deixei neutro.
                setLoading(false);
                setLoadingPlano(false);
                return;
            }

            // Perfil
            const nomeMeta =
                (user.user_metadata?.nome as string | undefined) ??
                (user.user_metadata?.full_name as string | undefined) ??
                (user.user_metadata?.name as string | undefined) ??
                "";

            setNome(nomeMeta);
            setEmail(user.email ?? "");
            setTelefone((user.user_metadata?.telefone as string | undefined) ?? "");

            setCriadoEm(
                user.created_at
                    ? new Date(user.created_at).toLocaleDateString("pt-BR", {
                        month: "long",
                        year: "numeric",
                    })
                    : ""
            );

            setIsGoogleUser(user.app_metadata?.provider === "google");

            // Plano — busca por user_id e fallback por email
            let plano: PlanoRow | null = null;

            const byUser = await supabase
                .from("planos")
                .select("status, proximo_pagamento, access_until, email, user_id")
                .eq("user_id", user.id)
                .maybeSingle();

            if (byUser.error) {
                setErrPlano("Erro ao buscar seu plano.");
                setLoading(false);
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
                    setErrPlano("Erro ao buscar seu plano.");
                    setLoading(false);
                    setLoadingPlano(false);
                    return;
                }

                plano = (byEmail.data as PlanoRow | null) ?? null;

                // Se encontrou por email e não tem user_id, tenta amarrar (se RLS permitir)
                if (plano && !plano.user_id) {
                    await supabase.from("planos").update({ user_id: user.id }).eq("email", user.email);
                }
            }

            if (plano) {
                setPlanoStatus(plano.status ?? "inativo");
                setProximoPagamento(plano.proximo_pagamento ?? null);
                setAccessUntil(plano.access_until ?? null);
            } else {
                setPlanoStatus("inativo");
                setProximoPagamento(null);
                setAccessUntil(null);
            }

            setLoading(false);
            setLoadingPlano(false);
        }

        fetchUserAndPlan();

        unsub = supabase.auth.onAuthStateChange(() => {
            fetchUserAndPlan();
        });

        return () => {
            unsub?.data.subscription?.unsubscribe?.();
        };
    }, []);

    // -----------------------------
    // Actions
    // -----------------------------
    async function handleSalvarPerfil(e: React.FormEvent) {
        e.preventDefault();
        setErrPerfil(null);
        setMsgPerfil(null);
        setSavingProfile(true);

        // Atualiza só user_metadata
        const { error } = await supabase.auth.updateUser({
            data: { nome, telefone },
        });

        if (error) {
            setErrPerfil("Erro ao atualizar dados: " + error.message);
            setSavingProfile(false);
            return;
        }

        // Atualiza senha se informado e se NÃO for Google user
        if (!isGoogleUser && novaSenha.trim()) {
            const { error: errSenha } = await supabase.auth.updateUser({
                password: novaSenha.trim(),
            });

            if (errSenha) {
                setErrPerfil("Erro ao atualizar senha: " + errSenha.message);
                setSavingProfile(false);
                return;
            }
        }

        setMsgPerfil("Dados atualizados com sucesso!");
        setEditandoPerfil(false);
        setNovaSenha("");
        setSavingProfile(false);

        window.setTimeout(() => setMsgPerfil(null), 2500);
    }

    async function handleCheckout() {
        setLoadingCheckout(true);
        setErrPlano(null);

        const { data: authData, error: authErr } = await supabase.auth.getUser();
        const user = authData?.user;

        if (authErr || !user || !user.email) {
            setErrPlano("Faça login para assinar.");
            setLoadingCheckout(false);
            return;
        }

        // Boa prática: registra pendente antes do checkout (se RLS permitir)
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
                { onConflict: "email" }
            );
        } catch {
            // ignora: webhook faz upsert por email
        }

        window.location.href = `${CHECKOUT_URL}?email=${encodeURIComponent(user.email)}`;
    }

    if (loading) {
        return (
            <main className="min-h-screen flex items-center justify-center px-4">
                <span className="text-lg text-foreground">Carregando...</span>
            </main>
        );
    }

    return (
        <main className="w-full px-4 sm:px-6 lg:px-8 py-6 md:py-10">
            <div className="mx-auto w-full max-w-5xl flex flex-col gap-6">
                {/* Breadcrumb / título */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="text-primary">⌂</span>
                    <span>/</span>
                    <span className="text-foreground">Conta</span>
                </div>

                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Minha Conta</h1>
                    <p className="text-sm text-muted-foreground">
                        Gerencie seu perfil e seu plano em um só lugar.
                    </p>
                </div>

                {/* ====== GRID PRINCIPAL ====== */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* =========================
              COLUNA ESQUERDA (PERFIL)
             ========================= */}
                    <section className="lg:col-span-2 rounded-2xl border border-border bg-card shadow-sm">
                        <form onSubmit={handleSalvarPerfil} className="p-6">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <User2 className="w-5 h-5 text-primary" />
                                    <div>
                                        <h2 className="text-lg font-bold text-foreground">Perfil</h2>
                                        <p className="text-sm text-muted-foreground">
                                            Seus dados pessoais e segurança.
                                        </p>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    className="rounded-lg border border-border bg-muted px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted/80 transition disabled:opacity-60"
                                    onClick={() => {
                                        setErrPerfil(null);
                                        setMsgPerfil(null);
                                        setEditandoPerfil((v) => !v);
                                        setNovaSenha("");
                                    }}
                                    disabled={savingProfile}
                                >
                                    {editandoPerfil ? "Cancelar" : "Editar"}
                                </button>
                            </div>

                            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Membro desde */}
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                                        <span className="inline-flex items-center gap-2">
                                            <CalendarDays className="w-4 h-4" />
                                            Membro desde
                                        </span>
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-foreground outline-none text-sm font-medium"
                                        value={criadoEm}
                                        disabled
                                    />
                                </div>

                                {/* Nome */}
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                                        Nome completo
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-foreground outline-none focus:ring-2 focus:ring-primary text-sm font-medium transition disabled:opacity-70"
                                        value={nome}
                                        onChange={(e) => setNome(e.target.value)}
                                        disabled={!editandoPerfil || savingProfile}
                                        autoComplete="name"
                                    />
                                </div>

                                {/* Email */}
                                <div>
                                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                                        <span className="inline-flex items-center gap-2">
                                            <Mail className="w-4 h-4" />
                                            Email
                                        </span>
                                    </label>
                                    <input
                                        type="email"
                                        className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-foreground outline-none text-sm font-medium disabled:opacity-70"
                                        value={email}
                                        disabled
                                    />
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        O email não pode ser alterado por aqui.
                                    </p>
                                </div>

                                {/* Telefone */}
                                <div>
                                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                                        <span className="inline-flex items-center gap-2">
                                            <Phone className="w-4 h-4" />
                                            Telefone
                                        </span>
                                    </label>
                                    <input
                                        type="tel"
                                        className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-foreground outline-none focus:ring-2 focus:ring-primary text-sm font-medium transition disabled:opacity-70"
                                        value={telefone}
                                        onChange={(e) => setTelefone(e.target.value)}
                                        disabled={!editandoPerfil || savingProfile}
                                        autoComplete="tel"
                                    />
                                </div>

                                {/* Segurança / Senha */}
                                <div className="md:col-span-2 mt-2">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Lock className="w-4 h-4 text-primary" />
                                        <p className="text-sm font-semibold text-foreground">Segurança</p>
                                    </div>

                                    {isGoogleUser ? (
                                        <div className="rounded-xl border border-border bg-muted p-4 text-sm text-muted-foreground">
                                            <div className="flex items-start gap-2">
                                                <AlertTriangle className="w-5 h-5 mt-0.5 text-yellow-600" />
                                                <div>
                                                    <p className="font-semibold text-foreground">
                                                        Conta Google
                                                    </p>
                                                    <p className="mt-1">
                                                        Usuários Google não alteram senha neste painel.
                                                        A alteração deve ser feita na sua conta Google.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <label className="block text-sm font-medium text-muted-foreground mb-1">
                                                Nova senha
                                            </label>
                                            <input
                                                type="password"
                                                placeholder={editandoPerfil ? "Digite a nova senha" : "Clique em editar para alterar"}
                                                className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-foreground outline-none focus:ring-2 focus:ring-primary text-sm font-medium transition disabled:opacity-70"
                                                value={novaSenha}
                                                onChange={(e) => setNovaSenha(e.target.value)}
                                                disabled={!editandoPerfil || savingProfile}
                                                autoComplete="new-password"
                                            />
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                Preencha apenas se quiser trocar a senha.
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Mensagens */}
                            {errPerfil && (
                                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                    {errPerfil}
                                </div>
                            )}
                            {msgPerfil && (
                                <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                                    {msgPerfil}
                                </div>
                            )}

                            {/* Ações */}
                            {editandoPerfil && (
                                <div className="mt-6 flex items-center justify-end gap-3">
                                    <button
                                        type="button"
                                        className="rounded-lg border border-border bg-muted px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted/80 transition disabled:opacity-60"
                                        onClick={() => {
                                            setEditandoPerfil(false);
                                            setErrPerfil(null);
                                            setMsgPerfil(null);
                                            setNovaSenha("");
                                        }}
                                        disabled={savingProfile}
                                    >
                                        Cancelar
                                    </button>

                                    <button
                                        type="submit"
                                        className="rounded-lg bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/80 transition disabled:opacity-60"
                                        disabled={savingProfile}
                                    >
                                        {savingProfile ? "Salvando..." : "Salvar alterações"}
                                    </button>
                                </div>
                            )}
                        </form>
                    </section>

                    {/* =========================
              COLUNA DIREITA (PLANO)
             ========================= */}
                    <aside className="rounded-2xl border border-border bg-card shadow-sm p-6">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <Star className="w-5 h-5 text-primary" />
                                <div>
                                    <h2 className="text-lg font-bold text-foreground">Plano</h2>
                                    <p className="text-sm text-muted-foreground">Sua assinatura e acesso.</p>
                                </div>
                            </div>

                            <span
                                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${badge.klass}`}
                                title={emDiaLabel}
                            >
                                <CheckCircle className="w-4 h-4" />
                                {badge.label}
                            </span>
                        </div>

                        <div className="mt-6 rounded-xl border border-border bg-muted p-4">
                            <div className="text-sm font-semibold text-foreground">Plano Premium</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                                {loadingPlano ? "Carregando status..." : emDiaLabel}
                            </div>

                            <div className="mt-4 flex items-center justify-between">
                                <div>
                                    <div className="text-xs text-muted-foreground">Próximo pagamento</div>
                                    <div className="text-lg font-bold text-foreground">
                                        {loadingPlano ? "—" : proximoPagamentoLabel}
                                    </div>
                                </div>

                                <div className="text-right">
                                    <div className="text-xs text-muted-foreground">Valor</div>
                                    <div className="text-sm font-semibold text-foreground">
                                        {PRECO_MENSAL}/mês
                                    </div>
                                </div>
                            </div>

                            {accessUntil && (
                                <div className="mt-3 text-xs text-muted-foreground">
                                    Acesso até: <b className="text-foreground">{toPtBRDate(accessUntil)}</b>
                                </div>
                            )}
                        </div>

                        {errPlano && (
                            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                {errPlano}
                            </div>
                        )}

                        <div className="mt-4">
                            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                <CreditCard className="w-4 h-4" />
                                Pagamento
                            </div>

                            <div className="mt-2 text-sm text-muted-foreground">
                                {planoStatus === "ativo" || planoStatus === "pendente"
                                    ? "Pagamento pela Kiwify"
                                    : "Nenhum método cadastrado"}
                            </div>

                            <div className="mt-3 rounded-xl border border-border bg-muted p-3 text-xs text-muted-foreground">
                                Alterações e cancelamentos devem ser feitos pelo painel do comprador da Kiwify (ou link enviado por e-mail
                                na compra).
                            </div>
                        </div>

                        <div className="mt-5">
                            <div className="text-sm font-bold text-foreground mb-2">Ações</div>

                            {planoStatus === "ativo" && emDia ? (
                                <div className="rounded-xl border border-border bg-muted p-3 text-sm text-muted-foreground">
                                    Seu plano está ativo! Para cancelar ou alterar, use o painel da Kiwify.
                                </div>
                            ) : planoStatus === "pendente" ? (
                                <div className="rounded-xl border border-border bg-muted p-3 text-sm text-muted-foreground">
                                    Pagamento pendente. Assim que confirmado, seu acesso será liberado automaticamente.
                                </div>
                            ) : (
                                <button
                                    className={`w-full rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/80 transition border border-primary ${loadingCheckout ? "opacity-60 pointer-events-none" : ""
                                        }`}
                                    onClick={handleCheckout}
                                    disabled={loadingCheckout}
                                >
                                    {loadingCheckout ? "Abrindo checkout..." : "Assinar agora"}
                                </button>
                            )}
                        </div>
                    </aside>
                </div>

                {/* =========================
            Recursos do plano (separado)
           ========================= */}
                <section className="rounded-2xl border border-border bg-card shadow-sm p-6">
                    <h2 className="text-lg font-bold text-foreground">Recursos inclusos</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        O que você ganha ao assinar o Premium.
                    </p>

                    <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <ul className="space-y-3 text-sm text-foreground">
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

                        <ul className="space-y-3 text-sm text-foreground">
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
                </section>
            </div>
        </main>
    );
}