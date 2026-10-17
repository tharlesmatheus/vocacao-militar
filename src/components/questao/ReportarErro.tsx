"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

/*
 * "Reportar erro" da questão: o aluno escolhe o tipo e descreve o problema.
 * Envia pela função reportar_erro_questao (migração 20261025), que confere o
 * acesso à questão, limita 20 avisos por dia e não duplica um aviso em aberto.
 */

export const TIPOS_ERRO: { id: string; nome: string }[] = [
    { id: "gabarito", nome: "Gabarito errado" },
    { id: "enunciado", nome: "Enunciado com erro" },
    { id: "alternativas", nome: "Alternativas com erro" },
    { id: "desatualizada", nome: "Questão desatualizada" },
    { id: "comentario", nome: "Comentário errado" },
    { id: "classificacao", nome: "Disciplina/assunto errado" },
    { id: "outro", nome: "Outro" },
];

const MIN = 5;
const MAX = 1000;

export function ReportarErro({ questaoId, aberto, aoFechar }: { questaoId: string; aberto: boolean; aoFechar: () => void }) {
    const [tipo, setTipo] = useState("");
    const [motivo, setMotivo] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState("");
    const [enviado, setEnviado] = useState(false);
    const texto = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!aberto) return;
        setErro("");
        setEnviado(false);
        const esc = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
        window.addEventListener("keydown", esc);
        return () => window.removeEventListener("keydown", esc);
    }, [aberto, aoFechar]);

    if (!aberto) return null;

    const valido = !!tipo && motivo.trim().length >= MIN;

    async function enviar(e: React.FormEvent) {
        e.preventDefault();
        if (!valido || enviando) return;
        setEnviando(true);
        setErro("");
        const { error } = await supabase.rpc("reportar_erro_questao", {
            p_questao: questaoId,
            p_tipo: tipo,
            p_motivo: motivo.trim(),
        });
        setEnviando(false);
        if (error) {
            // Mensagens da função já vêm em português; o resto vira uma mensagem genérica.
            const conhecida = ["28000", "22023", "P0002", "54000"].includes(error.code ?? "");
            setErro(conhecida ? error.message : "Não foi possível enviar agora. Tente de novo em instantes.");
            return;
        }
        setEnviado(true);
        setTipo("");
        setMotivo("");
    }

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Reportar erro na questão">
            <div className="absolute inset-0 backdrop-blur-[2px]" style={{ backgroundColor: "rgba(0,0,0,0.6)" }} onClick={aoFechar} aria-hidden />
            <section className="relative w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
                <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
                    <h2 className="text-base font-bold text-foreground">Reportar erro na questão</h2>
                    <button type="button" onClick={aoFechar} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Fechar">
                        <X className="h-5 w-5" aria-hidden />
                    </button>
                </header>

                {enviado ? (
                    <div className="space-y-4 px-5 py-6 text-sm text-foreground">
                        <p className="font-semibold">Obrigado! Recebemos o seu aviso.</p>
                        <p className="text-muted-foreground">A equipe vai conferir a questão e corrigir se for o caso.</p>
                        <div className="flex justify-end">
                            <button type="button" onClick={aoFechar} className="rounded-lg bg-primary px-5 py-2 text-sm font-bold text-primary-foreground">
                                Fechar
                            </button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={enviar} className="space-y-4 px-5 py-5">
                        <fieldset>
                            <legend className="mb-2 text-sm font-medium text-muted-foreground">Qual é o problema?</legend>
                            <div className="flex flex-wrap gap-2">
                                {TIPOS_ERRO.map((t) => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        aria-pressed={tipo === t.id}
                                        onClick={() => {
                                            setTipo(t.id);
                                            texto.current?.focus();
                                        }}
                                        className={`rounded-full border px-3 py-1.5 text-sm transition ${
                                            tipo === t.id
                                                ? "border-primary bg-primary/15 font-semibold text-primary"
                                                : "border-border text-foreground hover:bg-muted"
                                        }`}
                                    >
                                        {t.nome}
                                    </button>
                                ))}
                            </div>
                        </fieldset>

                        <div>
                            <label htmlFor={`motivo-${questaoId}`} className="mb-2 block text-sm font-medium text-muted-foreground">
                                Descreva o erro
                            </label>
                            <textarea
                                id={`motivo-${questaoId}`}
                                ref={texto}
                                value={motivo}
                                maxLength={MAX}
                                rows={5}
                                onChange={(e) => setMotivo(e.target.value)}
                                placeholder="Ex.: o gabarito diz B, mas a lei citada foi alterada em 2023 e a correta passou a ser C."
                                className="w-full resize-y rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
                            />
                            <div className="mt-1 text-right text-xs text-muted-foreground">
                                {motivo.length}/{MAX}
                            </div>
                        </div>

                        {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={aoFechar} className="rounded-lg border border-border px-5 py-2 text-sm font-semibold text-foreground hover:bg-muted">
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={!valido || enviando}
                                className="rounded-lg bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
                            >
                                {enviando ? "Enviando…" : "Enviar"}
                            </button>
                        </div>
                    </form>
                )}
            </section>
        </div>
    );
}
