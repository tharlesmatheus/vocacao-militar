"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Eraser, Loader2, RefreshCw, X } from "lucide-react";
import { apiAluno } from "@/lib/apiAluno";

export type TipoMaterial = "FLASHCARD" | "RESUMO";

type Rascunho = { frente?: string; verso?: string; titulo?: string; conteudo?: string };

const campo =
    "w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm leading-relaxed text-foreground outline-none focus:ring-2 focus:ring-primary";

/**
 * Modal central para criar flashcard/resumo a partir de uma questão.
 * Abre já com uma sugestão gerada; o aluno pode editar, gerar de novo, escrever do zero e salvar.
 * Decisão de produto: a interface não menciona IA (o material é da plataforma/do aluno).
 */
export function PainelMaterial({
    questaoId,
    tipo,
    aberto,
    aoFechar,
    aoSalvar,
}: {
    questaoId: string;
    tipo: TipoMaterial;
    aberto: boolean;
    aoFechar: () => void;
    aoSalvar?: (id: string) => void;
}) {
    const [rascunho, setRascunho] = useState<Rascunho>({});
    const [gerando, setGerando] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState("");
    const [restantes, setRestantes] = useState<number | null>(null);
    const [salvoId, setSalvoId] = useState<string | null>(null);
    const [manual, setManual] = useState(false);

    const flash = tipo === "FLASHCARD";
    const nome = flash ? "flashcard" : "resumo";

    const gerar = useCallback(async () => {
        setGerando(true);
        setErro("");
        setManual(false);
        try {
            const r = await apiAluno<{ rascunho: Rascunho; restantes: number }>(`/api/questoes/${questaoId}/material`, {
                method: "POST",
                body: JSON.stringify({ acao: "gerar", tipo }),
            });
            setRascunho(r.rascunho);
            setRestantes(r.restantes);
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setGerando(false);
        }
    }, [questaoId, tipo]);

    // Abriu: começa no automático.
    useEffect(() => {
        if (!aberto) return;
        setSalvoId(null);
        setRascunho({});
        gerar();
    }, [aberto, gerar]);

    // Esc fecha; trava a rolagem da página enquanto o modal está aberto.
    useEffect(() => {
        if (!aberto) return;
        const h = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
        window.addEventListener("keydown", h);
        const overflowAntes = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            window.removeEventListener("keydown", h);
            document.body.style.overflow = overflowAntes;
        };
    }, [aberto, aoFechar]);

    async function salvar() {
        setSalvando(true);
        setErro("");
        try {
            const r = await apiAluno<{ id: string }>(`/api/questoes/${questaoId}/material`, {
                method: "POST",
                body: JSON.stringify({ acao: "salvar", tipo, ...rascunho }),
            });
            setSalvoId(r.id);
            aoSalvar?.(r.id);
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setSalvando(false);
        }
    }

    function escreverDoZero() {
        setRascunho(flash ? { frente: "", verso: "" } : { titulo: "", conteudo: "" });
        setManual(true);
        setErro("");
    }

    if (!aberto) return null;

    const podeSalvar = flash
        ? !!rascunho.frente?.trim() && !!rascunho.verso?.trim()
        : !!rascunho.titulo?.trim() && !!rascunho.conteudo?.trim();

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Criar ${nome}`}>
            <div className="absolute inset-0 backdrop-blur-[2px]" style={{ backgroundColor: "rgba(0,0,0,0.6)" }} onClick={aoFechar} aria-hidden />
            <section className="relative flex max-h-[min(640px,calc(100dvh-2rem))] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
                <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-wider text-primary">A partir desta questão</div>
                        <h2 className="text-lg font-bold text-foreground">Criar {nome}</h2>
                    </div>
                    <button type="button" onClick={aoFechar} className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="Fechar">
                        <X className="h-5 w-5" />
                    </button>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    {salvoId ? (
                        <div className="flex flex-col items-center gap-3 py-6 text-center">
                            <CheckCircle2 className="h-12 w-12 text-emerald-500" aria-hidden />
                            <div className="text-lg font-bold text-foreground">{flash ? "Flashcard salvo!" : "Resumo salvo!"}</div>
                            <p className="max-w-sm text-sm text-muted-foreground">
                                Ele foi para a disciplina e o assunto desta questão e já entra no seu Centro de Revisões.
                            </p>
                            <Link href={flash ? "/flashcards" : "/resumos"} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                                Ver meus {flash ? "flashcards" : "resumos"}
                            </Link>
                        </div>
                    ) : gerando ? (
                        <div className="flex flex-col gap-3" aria-live="polite">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Preparando o {nome}…
                            </div>
                            <div className="h-20 animate-pulse rounded-lg bg-muted" />
                            <div className="h-32 animate-pulse rounded-lg bg-muted" />
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {erro && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{erro}</p>}

                            {flash ? (
                                <>
                                    <label className="flex flex-col gap-1">
                                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Frente (pergunta)</span>
                                        <textarea className={`${campo} min-h-[80px]`} value={rascunho.frente ?? ""} onChange={(e) => setRascunho({ ...rascunho, frente: e.target.value })} placeholder="Ex.: O que caracteriza a legítima defesa?" />
                                    </label>
                                    <label className="flex flex-col gap-1">
                                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Verso (resposta)</span>
                                        <textarea className={`${campo} min-h-[130px]`} value={rascunho.verso ?? ""} onChange={(e) => setRascunho({ ...rascunho, verso: e.target.value })} placeholder="A resposta, com o porquê." />
                                    </label>
                                </>
                            ) : (
                                <>
                                    <label className="flex flex-col gap-1">
                                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Título</span>
                                        <input className={campo} value={rascunho.titulo ?? ""} onChange={(e) => setRascunho({ ...rascunho, titulo: e.target.value })} placeholder="Ex.: Superveniência de causa independente" />
                                    </label>
                                    <label className="flex flex-col gap-1">
                                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conteúdo</span>
                                        <textarea className={`${campo} min-h-[220px]`} value={rascunho.conteudo ?? ""} onChange={(e) => setRascunho({ ...rascunho, conteudo: e.target.value })} placeholder="O que a banca cobra, pontos-chave e a pegadinha." />
                                    </label>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {!salvoId && (
                    <footer className="flex flex-col gap-2 border-t border-border px-5 py-3.5">
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={gerar} disabled={gerando || salvando || restantes === 0} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted/70 disabled:opacity-50">
                                <RefreshCw className="h-4 w-4" aria-hidden /> {manual ? "Gerar sugestão" : "Gerar de novo"}
                            </button>
                            <button type="button" onClick={escreverDoZero} disabled={gerando || salvando} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted/70 disabled:opacity-50">
                                <Eraser className="h-4 w-4" aria-hidden /> Escrever do zero
                            </button>
                            <button type="button" onClick={salvar} disabled={!podeSalvar || gerando || salvando} className="ml-auto rounded-lg bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                                {salvando ? "Salvando…" : "Salvar"}
                            </button>
                        </div>
                        {restantes !== null && (
                            <span className="text-xs text-muted-foreground">
                                {restantes > 0 ? `${restantes} gerações automáticas restantes hoje.` : "Gerações automáticas de hoje esgotadas — você ainda pode escrever manualmente."}
                            </span>
                        )}
                    </footer>
                )}
            </section>
        </div>
    );
}
