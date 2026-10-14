"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, ReceiptText } from "lucide-react";
import { apiAluno } from "@/lib/apiAluno";

type Resposta = { liberado: boolean; jaAtivo?: boolean; ate?: string; email?: string; mensagem?: string };

/**
 * "Já paguei": confere o pagamento direto na Kiwify e libera o acesso na hora
 * (para quando o aviso automático da Kiwify falhou ou atrasou).
 * Ao liberar, recarrega a página para o app inteiro enxergar a assinatura.
 */
export function BotaoJaPaguei({ variante = "bloco" }: { variante?: "bloco" | "link" }) {
    const [estado, setEstado] = useState<"parado" | "conferindo" | "liberado" | "nao" | "erro">("parado");
    const [mensagem, setMensagem] = useState("");

    async function conferir() {
        setEstado("conferindo");
        setMensagem("");
        try {
            const r = await apiAluno<Resposta>("/api/assinatura/verificar", { method: "POST" });
            if (r.liberado) {
                setEstado("liberado");
                setMensagem(
                    r.jaAtivo
                        ? "Sua assinatura já está ativa."
                        : `Pagamento encontrado! Acesso liberado${r.ate ? ` até ${new Date(r.ate).toLocaleDateString("pt-BR")}` : ""}.`
                );
                window.setTimeout(() => window.location.reload(), 1800);
            } else {
                setEstado("nao");
                setMensagem(`${r.mensagem ?? "Pagamento ainda não encontrado."}${r.email ? ` (e-mail conferido: ${r.email})` : ""}`);
            }
        } catch (e: any) {
            setEstado("erro");
            setMensagem(e?.message || "Não foi possível conferir agora.");
        }
    }

    const caixa =
        estado === "liberado"
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
            : estado === "erro"
                ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
                : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200";

    const aviso = mensagem && (
        <p className={`rounded-lg border px-3 py-2 text-sm ${caixa}`} role="status" aria-live="polite">
            {estado === "liberado" && <CheckCircle2 className="mr-1.5 inline h-4 w-4 align-[-3px]" aria-hidden />}
            {mensagem}
        </p>
    );

    if (variante === "link") {
        return (
            <span className="inline-flex flex-col gap-2">
                <button
                    type="button"
                    onClick={conferir}
                    disabled={estado === "conferindo" || estado === "liberado"}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline disabled:opacity-60"
                >
                    {estado === "conferindo" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ReceiptText className="h-4 w-4" aria-hidden />}
                    {estado === "conferindo" ? "Conferindo pagamento…" : "Já paguei"}
                </button>
                {aviso}
            </span>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            <button
                type="button"
                onClick={conferir}
                disabled={estado === "conferindo" || estado === "liberado"}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted/70 disabled:opacity-60"
            >
                {estado === "conferindo" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ReceiptText className="h-4 w-4" aria-hidden />}
                {estado === "conferindo" ? "Conferindo pagamento…" : "Já paguei, liberar meu acesso"}
            </button>
            {aviso}
        </div>
    );
}
