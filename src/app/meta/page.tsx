"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Crosshair, Search, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { rotuloMeta, salvarMeta, usePerfilAluno } from "@/lib/perfilAluno";

type Par = { instituicao: string; cargo: string; total: number };

/** Abaixo disso o cargo tem pouca questão sozinho; sugerimos a instituição inteira. */
const POUCAS = 150;

function normalizar(s: string) {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function EscolherMeta() {
    const router = useRouter();
    const params = useSearchParams();
    const primeiroAcesso = params.get("primeiro") === "1";
    const { perfil, carregando } = usePerfilAluno();

    const [pares, setPares] = useState<Par[] | null>(null);
    const [erro, setErro] = useState("");
    const [busca, setBusca] = useState("");
    const [instituicao, setInstituicao] = useState<string | null>(null);
    const [cargo, setCargo] = useState<string | null>(null);
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        supabase.rpc("metas_disponiveis").then(({ data, error }) => {
            if (error) setErro("Não foi possível carregar as instituições. Tente de novo em instantes.");
            else setPares(((data ?? []) as Par[]).map((p) => ({ ...p, total: Number(p.total) })));
        });
    }, []);

    // Já tem meta: começa com ela selecionada.
    useEffect(() => {
        if (perfil?.meta_instituicao) {
            setInstituicao(perfil.meta_instituicao);
            setCargo(perfil.meta_cargo);
        }
    }, [perfil]);

    const instituicoes = useMemo(() => {
        const mapa = new Map<string, number>();
        for (const p of pares ?? []) mapa.set(p.instituicao, (mapa.get(p.instituicao) ?? 0) + p.total);
        const termo = normalizar(busca.trim());
        return [...mapa.entries()]
            .map(([nome, total]) => ({ nome, total }))
            .filter((i) => !termo || normalizar(i.nome).includes(termo))
            .sort((a, b) => b.total - a.total);
    }, [pares, busca]);

    const cargos = useMemo(
        () => (pares ?? []).filter((p) => p.instituicao === instituicao).sort((a, b) => b.total - a.total),
        [pares, instituicao]
    );
    const totalInstituicao = cargos.reduce((s, c) => s + c.total, 0);
    const totalCargo = cargo ? cargos.find((c) => c.cargo === cargo)?.total ?? 0 : totalInstituicao;

    async function confirmar(inst: string | null, carg: string | null) {
        setSalvando(true);
        setErro("");
        try {
            await salvarMeta(inst, carg);
            router.replace(primeiroAcesso ? "/?bemvindo=1" : "/");
        } catch (e: any) {
            setErro(e.message);
            setSalvando(false);
        }
    }

    if (carregando) return <div className="animate-pulse text-muted-foreground">Carregando…</div>;

    return (
        <div className="flex w-full flex-col gap-6">
            <header className="flex flex-col gap-2 border-b border-border pb-5">
                <span className="inline-flex w-fit items-center gap-2 rounded-md bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
                    <Crosshair className="h-4 w-4" aria-hidden /> {primeiroAcesso ? "Primeiro passo" : "Minha meta"}
                </span>
                <h1 className="text-3xl font-extrabold text-foreground">Qual concurso você vai fazer?</h1>
                <p className="text-muted-foreground">
                    As questões, a Missão do dia, os simulados e as estatísticas passam a priorizar a sua meta. Você pode
                    trocar quando quiser.
                </p>
                {perfil?.meta_instituicao && (
                    <p className="text-sm text-foreground">
                        Meta atual: <strong>{rotuloMeta(perfil.meta_instituicao, perfil.meta_cargo)}</strong>
                    </p>
                )}
            </header>

            {erro && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">{erro}</div>}

            <div className="grid gap-4 md:grid-cols-2">
                {/* 1. Instituição */}
                <section className="flex flex-col rounded-lg border border-border bg-card p-4">
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">1. Instituição</h2>
                    <label className="relative mb-3 block">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <input
                            className="w-full rounded-lg border border-border bg-muted py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Buscar: PM BA, PRF, PC SP…"
                            value={busca}
                            onChange={(e) => setBusca(e.target.value)}
                            aria-label="Buscar instituição"
                        />
                    </label>
                    <div className="max-h-[360px] overflow-y-auto pr-1">
                        {!pares && !erro && <div className="animate-pulse p-2 text-sm text-muted-foreground">Carregando…</div>}
                        {pares && instituicoes.length === 0 && <div className="p-2 text-sm text-muted-foreground">Nada encontrado.</div>}
                        <ul className="flex flex-col gap-1">
                            {instituicoes.map((i) => (
                                <li key={i.nome}>
                                    <button
                                        type="button"
                                        onClick={() => { setInstituicao(i.nome); setCargo(null); }}
                                        className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${instituicao === i.nome ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                                    >
                                        <span className="font-medium">{i.nome}</span>
                                        <span className={instituicao === i.nome ? "opacity-80" : "text-muted-foreground"}>
                                            {i.total.toLocaleString("pt-BR")} questões
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                {/* 2. Cargo */}
                <section className="flex flex-col rounded-lg border border-border bg-card p-4">
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">2. Cargo</h2>
                    {!instituicao ? (
                        <p className="text-sm text-muted-foreground">Escolha a instituição ao lado.</p>
                    ) : (
                        <div className="max-h-[408px] overflow-y-auto pr-1">
                            <ul className="flex flex-col gap-1">
                                <li>
                                    <button
                                        type="button"
                                        onClick={() => setCargo(null)}
                                        className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${cargo === null ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                                    >
                                        <span className="font-medium">Todos os cargos</span>
                                        <span className={cargo === null ? "opacity-80" : "text-muted-foreground"}>
                                            {totalInstituicao.toLocaleString("pt-BR")}
                                        </span>
                                    </button>
                                </li>
                                {cargos.map((c) => (
                                    <li key={c.cargo}>
                                        <button
                                            type="button"
                                            onClick={() => setCargo(c.cargo)}
                                            className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition ${cargo === c.cargo ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                                        >
                                            <span>{c.cargo}</span>
                                            <span className={`shrink-0 ${cargo === c.cargo ? "opacity-80" : "text-muted-foreground"}`}>
                                                {c.total.toLocaleString("pt-BR")}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </section>
            </div>

            {instituicao && cargo && totalCargo < POUCAS && (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                    Esse cargo tem só {totalCargo} questões no acervo. Para ter mais treino, considere "Todos os cargos" de{" "}
                    {instituicao}. Nos simulados, completamos com questões da instituição quando faltar.
                </p>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                {primeiroAcesso ? (
                    <button type="button" className="text-sm text-muted-foreground underline" onClick={() => confirmar(null, null)} disabled={salvando}>
                        Ainda não sei, escolher depois
                    </button>
                ) : perfil?.meta_instituicao ? (
                    <button type="button" className="text-sm text-muted-foreground underline" onClick={() => confirmar(null, null)} disabled={salvando}>
                        Remover meta e ver tudo
                    </button>
                ) : <span />}
                <button
                    type="button"
                    disabled={!instituicao || salvando}
                    onClick={() => confirmar(instituicao, cargo)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                >
                    <ShieldCheck className="h-5 w-5" aria-hidden />
                    {salvando ? "Salvando…" : instituicao ? `Definir meta: ${rotuloMeta(instituicao, cargo)}` : "Escolha a instituição"}
                </button>
            </div>
        </div>
    );
}

export default function MetaPage() {
    return (
        <div className="w-full">
            <Suspense fallback={<div className="animate-pulse text-muted-foreground">Carregando…</div>}>
                <EscolherMeta />
            </Suspense>
        </div>
    );
}
