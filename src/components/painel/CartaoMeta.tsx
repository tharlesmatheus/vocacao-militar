"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Crosshair, Timer } from "lucide-react";
import { carregarPainelMeta, rotuloMeta, type PainelMeta } from "@/lib/perfilAluno";

/** Cartão "Sua meta" do painel: progresso no concurso alvo e pontos fracos. */
export function CartaoMeta({ temMeta }: { temMeta: boolean }) {
    const [painel, setPainel] = useState<PainelMeta | null | undefined>(undefined);

    useEffect(() => {
        if (!temMeta) return setPainel(null);
        carregarPainelMeta().then(setPainel);
    }, [temMeta]);

    if (!temMeta) {
        return (
            <section className="flex flex-col gap-3 rounded-lg border border-dashed border-primary/50 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <Crosshair className="h-6 w-6 shrink-0 text-primary" aria-hidden />
                    <div>
                        <div className="font-titulo text-lg font-bold uppercase tracking-wide text-foreground">Defina sua meta</div>
                        <div className="text-sm text-muted-foreground">Escolha o concurso e a plataforma passa a girar em torno dele.</div>
                    </div>
                </div>
                <Link href="/meta" className="rounded-lg bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground">
                    Escolher concurso
                </Link>
            </section>
        );
    }

    if (painel === undefined) return <section className="h-36 animate-pulse rounded-lg border border-border bg-card" />;
    if (!painel) return null;

    const pctFeito = painel.total ? Math.round((100 * painel.respondidas) / painel.total) : 0;
    const acerto = painel.respondidas ? Math.round((100 * painel.acertos) / painel.respondidas) : null;
    // Pontos fracos: abaixo de 70% de acerto, com pelo menos 5 respondidas.
    const fracas = painel.disciplinas
        .filter((d) => d.respondidas >= 5)
        .map((d) => ({ ...d, pct: Math.round((100 * d.acertos) / d.respondidas) }))
        .filter((d) => d.pct < 70)
        .sort((a, b) => a.pct - b.pct)
        .slice(0, 3);

    return (
        <section className="relative overflow-hidden rounded-lg border border-border bg-card p-4 shadow-sm">
            <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-primary" />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                        <Crosshair className="h-4 w-4" aria-hidden /> Sua meta
                    </div>
                    <div className="mt-1 font-titulo text-2xl font-bold uppercase tracking-wide text-foreground">
                        {rotuloMeta(painel.instituicao, painel.cargo)}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                        {painel.respondidas.toLocaleString("pt-BR")} de {painel.total.toLocaleString("pt-BR")} questões resolvidas
                        {acerto !== null && <> • <strong className="text-foreground">{acerto}% de acerto</strong></>}
                    </div>
                </div>
                <div className="flex shrink-0 gap-2">
                    <Link href="/questoes" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Treinar</Link>
                    <Link href="/simulados" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted/70">
                        <Timer className="h-4 w-4" aria-hidden /> Simulado
                    </Link>
                </div>
            </div>

            <div className="mt-4 h-2 w-full rounded-full bg-muted">
                <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${pctFeito}%` }} />
            </div>

            {fracas.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold uppercase tracking-wider text-muted-foreground">Reforce:</span>
                    {fracas.map((d) => (
                        <span key={d.disciplina} className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-red-700 dark:text-red-300">
                            {d.disciplina} • {d.pct}%
                        </span>
                    ))}
                </div>
            )}
            <div className="mt-3 text-right">
                <Link href="/meta" className="text-xs text-muted-foreground underline">Trocar meta</Link>
            </div>
        </section>
    );
}
