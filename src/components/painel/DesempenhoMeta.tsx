"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Crosshair } from "lucide-react";
import { carregarPainelMeta, rotuloMeta, type PainelMeta } from "@/lib/perfilAluno";

/** Estatísticas da meta: acerto e cobertura por disciplina (última tentativa de cada questão). */
export function DesempenhoMeta() {
    const [painel, setPainel] = useState<PainelMeta | null | undefined>(undefined);
    useEffect(() => {
        carregarPainelMeta().then(setPainel);
    }, []);

    if (painel === undefined) return null;
    if (painel === null) {
        return (
            <section className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="text-muted-foreground">Defina sua meta para ver o desempenho no concurso que você vai fazer.</span>
                <Link href="/meta" className="font-semibold text-primary underline">Escolher meta</Link>
            </section>
        );
    }

    const acertoGeral = painel.respondidas ? Math.round((100 * painel.acertos) / painel.respondidas) : null;

    return (
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <div>
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                        <Crosshair className="h-4 w-4" aria-hidden /> Na sua meta
                    </div>
                    <div className="font-titulo text-xl font-bold uppercase tracking-wide text-foreground">
                        {rotuloMeta(painel.instituicao, painel.cargo)}
                    </div>
                </div>
                <div className="text-sm text-muted-foreground">
                    {painel.respondidas.toLocaleString("pt-BR")}/{painel.total.toLocaleString("pt-BR")} resolvidas
                    {acertoGeral !== null && <> • <strong className="text-foreground">{acertoGeral}% de acerto</strong></>}
                </div>
            </div>

            <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
                {painel.disciplinas.slice(0, 12).map((d) => {
                    const pct = d.respondidas ? Math.round((100 * d.acertos) / d.respondidas) : null;
                    const cor = pct === null ? "bg-muted-foreground/30" : pct >= 70 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
                    return (
                        <div key={d.disciplina}>
                            <div className="mb-1 flex justify-between gap-3 text-sm">
                                <span className="truncate text-foreground">{d.disciplina}</span>
                                <span className="shrink-0 text-muted-foreground">
                                    {pct === null ? "não iniciada" : `${pct}%`} • {d.respondidas}/{d.total}
                                </span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-muted">
                                <div className={`h-2 rounded-full ${cor}`} style={{ width: `${pct ?? 0}%` }} />
                            </div>
                        </div>
                    );
                })}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
                Acerto pela última tentativa de cada questão. Verde a partir de 70%, amarelo de 50% a 69%, vermelho abaixo de 50%.
            </p>
        </section>
    );
}
