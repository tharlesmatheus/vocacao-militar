"use client";

import React, { useEffect, useRef, useState } from "react";
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
    status?: PlanoStatus | null;
    proximo_pagamento?: string | null;
    access_until?: string | null;
    valor_pago?: number | string | null;
};

const CHECKOUT_URL = "https://pay.kiwify.com.br/ptQ62f5";

function toPtBRDate(dateIso?: string | null) {
    if (!dateIso) return "—";
    const d = new Date(dateIso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("pt-BR");
}

function toPtBRMoney(value?: number | string | null) {
    if (value === null || value === undefined || value === "") {
        return "—";
    }

    const parsed =
        typeof value === "number"
            ? value
            : Number(String(value).replace(",", ".").replace(/[^\d.-]/g, ""));

    if (Number.isNaN(parsed)) return "—";

    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(parsed);
}

export default function ContaPage() {
    const [loading, setLoading] = useState(true);
    const [loadingPlano, setLoadingPlano] = useState(true);
    const [savingProfile, setSavingProfile] = useState(false);
    const [loadingCheckout, setLoadingCheckout] = useState(false);

    const [isGoogleUser, setIsGoogleUser] = useState(false);
    const [criadoEm, setCriadoEm] = useState("");

    const [editandoPerfil, setEditandoPerfil] = useState(false);

    const [nome, setNome] = useState("");
    const [email, setEmail] = useState("");
    const [telefone, setTelefone] = useState("");

    const [nomeOriginal, setNomeOriginal] = useState("");
    const [telefoneOriginal, setTelefoneOriginal] = useState("");

    const [novaSenha, setNovaSenha] = useState("");

    const [msgPerfil, setMsgPerfil] = useState<string | null>(null);
    const [errPerfil, setErrPerfil] = useState<string | null>(null);
    const [errPlano, setErrPlano] = useState<string | null>(null);

    const [planoStatus, setPlanoStatus] = useState<PlanoStatus>("inativo");
    const [proximoPagamento, setProximoPagamento] = useState<string | null>(null);
    const [accessUntil, setAccessUntil] = useState<string | null>(null);
    const [valorPago, setValorPago] = useState<number | string | null>(null);

    const msgTimeoutRef = useRef<number | null>(null);

    const emDia = (() => {
        if (planoStatus !== "ativo") return false;
        if (!accessUntil) return true;

        const t = new Date(accessUntil).getTime();
        return !Number.isNaN(t) && t >= Date.now();
    })();

    const badge = (() => {
        if (planoStatus === "ativo") {
            return {
                klass: "bg-green-100 border border-green-200 text-green-700",
                label: "Ativo",
            };
        }

        if (planoStatus === "pendente") {
            return {
                klass: "bg-yellow-100 border border-yellow-300 text-yellow-700",
                label: "Pendente",
            };
        }

        return {
            klass: "bg-muted border border-border text-muted-foreground",
            label: "Inativo",
        };
    })();

    const emDiaLabel = (() => {
        if (accessUntil && planoStatus === "ativo") {
            return `Acesso até ${toPtBRDate(accessUntil)}`;
        }
        if (planoStatus === "ativo") return "Plano ativo";
        if (planoStatus === "pendente") return "Pagamento pendente";
        return "Plano inativo";
    })();

    useEffect(() => {
        let mounted = true;

        async function fetchUserAndPlan() {
            try {
                if (!mounted) return;

                setLoading(true);
                setLoadingPlano(true);
                setErrPlano(null);
                setErrPerfil(null);
                setMsgPerfil(null);

                const { data: authData, error: authErr } = await supabase.auth.getUser();
                const user = authData?.user;

                if (authErr || !user) {
                    if (!mounted) return;
                    setPlanoStatus("inativo");
                    setProximoPagamento(null);
                    setAccessUntil(null);
                    setValorPago(null);
                    return;
                }

                const nomeMeta =
                    (user.user_metadata?.nome as string | undefined) ??
                    (user.user_metadata?.full_name as string | undefined) ??
                    (user.user_metadata?.name as string | undefined) ??
                    "";

                const telefoneMeta =
                    (user.user_metadata?.telefone as string | undefined) ?? "";

                if (!mounted) return;

                setNome(nomeMeta);
                setNomeOriginal(nomeMeta);

                setEmail((user.email ?? "").toLowerCase());

                setTelefone(telefoneMeta);
                setTelefoneOriginal(telefoneMeta);

                setCriadoEm(
                    user.created_at
                        ? new Date(user.created_at).toLocaleDateString("pt-BR", {
                            month: "long",
                            year: "numeric",
                        })
                        : ""
                );

                setIsGoogleUser(user.app_metadata?.provider === "google");

                if (!user.email) {
                    setPlanoStatus("inativo");
                    setProximoPagamento(null);
                    setAccessUntil(null);
                    setValorPago(null);
                    return;
                }

                const normalizedEmail = user.email.trim().toLowerCase();

                const { data: plano, error } = await supabase
                    .from("planos")
                    .select("status, proximo_pagamento, access_until, valor_pago")
                    .eq("email", normalizedEmail)
                    .maybeSingle();

                if (error) {
                    console.error("Erro ao buscar plano:", error.message);
                    if (mounted) setErrPlano("Erro ao buscar seu plano.");
                    return;
                }

                const row = (plano || {}) as PlanoRow;

                if (!mounted) return;

                setPlanoStatus(row.status ?? "inativo");
                setProximoPagamento(row.proximo_pagamento ?? null);
                setAccessUntil(row.access_until ?? null);
                setValorPago(row.valor_pago ?? null);
            } catch (error) {
                console.error("Erro inesperado ao carregar conta/plano:", error);
                if (mounted) setErrPlano("Erro ao buscar seu plano.");
            } finally {
                if (mounted) {
                    setLoading(false);
                    setLoadingPlano(false);
                }
            }
        }

        fetchUserAndPlan();

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(() => {
            fetchUserAndPlan();
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();

            if (msgTimeoutRef.current) {
                window.clearTimeout(msgTimeoutRef.current);
            }
        };
    }, []);

    function cancelarEdicao() {
        setEditandoPerfil(false);
        setErrPerfil(null);
        setMsgPerfil(null);
        setNovaSenha("");
        setNome(nomeOriginal);
        setTelefone(telefoneOriginal);
    }

    async function handleSalvarPerfil(e: React.FormEvent) {
        e.preventDefault();

        try {
            setErrPerfil(null);
            setMsgPerfil(null);
            setSavingProfile(true);

            const payload: { data: { nome: string; telefone: string } } = {
                data: {
                    nome: nome.trim(),
                    telefone: telefone.trim(),
                },
            };

            const { error } = await supabase.auth.updateUser(payload);

            if (error) {
                setErrPerfil("Erro ao atualizar dados: " + error.message);
                return;
            }

            if (!isGoogleUser && novaSenha.trim()) {
                if (novaSenha.trim().length < 8) {
                    setErrPerfil("A nova senha deve ter pelo menos 8 caracteres.");
                    return;
                }

                const { error: errSenha } = await supabase.auth.updateUser({
                    password: novaSenha.trim(),
                });

                if (errSenha) {
                    setErrPerfil("Erro ao atualizar senha: " + errSenha.message);
                    return;
                }
            }

            setNomeOriginal(nome.trim());
            setTelefoneOriginal(telefone.trim());
            setMsgPerfil("Dados atualizados com sucesso!");
            setEditandoPerfil(false);
            setNovaSenha("");

            if (msgTimeoutRef.current) {
                window.clearTimeout(msgTimeoutRef.current);
            }

            msgTimeoutRef.current = window.setTimeout(() => {
                setMsgPerfil(null);
            }, 2500);
        } catch (error) {
            console.error("Erro ao salvar perfil:", error);
            setErrPerfil("Erro inesperado ao salvar perfil.");
        } finally {
            setSavingProfile(false);
        }
    }

    async function handleCheckout() {
        try {
            setLoadingCheckout(true);
            setErrPlano(null);

            const { data: authData, error: authErr } = await supabase.auth.getUser();
            const user = authData?.user;

            if (authErr || !user || !user.email) {
                setErrPlano("Faça login para assinar.");
                return;
            }

            const normalizedEmail = user.email.trim().toLowerCase();

            const { error: upsertErr } = await supabase.from("planos").upsert(
                [
                    {
                        email: normalizedEmail,
                        status: "pendente",
                        updated_at: new Date().toISOString(),
                    },
                ],
                { onConflict: "email" }
            );

            if (upsertErr) {
                console.warn("Falha ao registrar status pendente:", upsertErr.message);
            }

            window.location.assign(
                `${CHECKOUT_URL}?email=${encodeURIComponent(normalizedEmail)}`
            );
        } catch (error) {
            console.error("Erro ao iniciar checkout:", error);
            setErrPlano("Não foi possível abrir o checkout.");
            setLoadingCheckout(false);
        }
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
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="text-primary">⌂</span>
                    <span>/</span>
                    <span className="text-foreground">Conta</span>
                </div>

                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                        Minha Conta
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Gerencie seu perfil e seu plano em um só lugar.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                                        setNovaSenha("");

                                        if (editandoPerfil) {
                                            cancelarEdicao();
                                        } else {
                                            setEditandoPerfil(true);
                                        }
                                    }}
                                    disabled={savingProfile}
                                >
                                    {editandoPerfil ? "Cancelar" : "Editar"}
                                </button>
                            </div>

                            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                                    <p className="font-semibold text-foreground">Conta Google</p>
                                                    <p className="mt-1">
                                                        Usuários Google não alteram senha neste painel.
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
                                                placeholder={
                                                    editandoPerfil
                                                        ? "Digite a nova senha"
                                                        : "Clique em editar para alterar"
                                                }
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

                            {editandoPerfil && (
                                <div className="mt-6 flex items-center justify-end gap-3">
                                    <button
                                        type="button"
                                        className="rounded-lg border border-border bg-muted px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted/80 transition disabled:opacity-60"
                                        onClick={cancelarEdicao}
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

                            <div className="mt-4 flex items-center justify-between gap-4">
                                <div>
                                    <div className="text-xs text-muted-foreground">Próximo pagamento</div>
                                    <div className="text-lg font-bold text-foreground">
                                        {loadingPlano ? "—" : toPtBRDate(proximoPagamento)}
                                    </div>
                                </div>

                                <div className="text-right">
                                    <div className="text-xs text-muted-foreground">Valor pago</div>
                                    <div className="text-sm font-semibold text-foreground">
                                        {loadingPlano ? "—" : toPtBRMoney(valorPago)}
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
                                Alterações e cancelamentos devem ser feitos pelo painel do comprador da
                                Kiwify.
                            </div>
                        </div>

                        <div className="mt-5">
                            <div className="text-sm font-bold text-foreground mb-2">Ações</div>

                            {planoStatus === "ativo" && emDia ? (
                                <div className="rounded-xl border border-border bg-muted p-3 text-sm text-muted-foreground">
                                    Seu plano está ativo.
                                </div>
                            ) : planoStatus === "pendente" ? (
                                <div className="rounded-xl border border-border bg-muted p-3 text-sm text-muted-foreground">
                                    Pagamento pendente.
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
            </div>
        </main>
    );
}