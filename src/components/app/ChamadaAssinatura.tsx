"use client";

import { useState } from "react";
import { CheckCircle2, Lock } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { PRECO_PLANO, linkCheckout } from "@/lib/plano";
import { VALOR_PLANO, eventoPixelEIr } from "@/lib/pixel";
import { BotaoJaPaguei } from "@/components/BotaoJaPaguei";

const BENEFICIOS = [
    "Questões de provas de PM, PC, PRF, PF, Bombeiros e Guarda",
    "Comentário em cada questão",
    "Simulados cronometrados",
    "Caderno de erros e revisão automática",
];

/** Tela de quem ainda não assina: o que libera, preço, assinar e "Já paguei". */
export function ChamadaAssinatura({ titulo = "Assine para liberar o banco de questões" }: { titulo?: string }) {
    const [abrindo, setAbrindo] = useState(false);

    async function assinar() {
        setAbrindo(true);
        const { data } = await supabase.auth.getUser();
        eventoPixelEIr(linkCheckout(data.user?.email), [["InitiateCheckout", VALOR_PLANO]]);
    }

    return (
        <section className="flex flex-col gap-6 rounded-xl border border-primary/30 bg-card p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="flex flex-col gap-4">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Lock className="h-5 w-5" aria-hidden />
                </span>
                <h2 className="font-titulo text-2xl font-bold uppercase text-foreground">{titulo}</h2>
                <ul className="flex flex-col gap-2 text-sm text-foreground">
                    {BENEFICIOS.map((b) => (
                        <li key={b} className="flex items-start gap-2">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                            {b}
                        </li>
                    ))}
                </ul>
            </div>

            <div className="flex w-full flex-col gap-3 sm:w-72">
                <div className="text-center">
                    <span className="font-titulo text-4xl font-extrabold text-primary">{PRECO_PLANO}</span>
                    <span className="text-sm text-muted-foreground">/mês</span>
                    <p className="text-xs text-muted-foreground">Cancele quando quiser.</p>
                </div>
                <button
                    type="button"
                    onClick={assinar}
                    disabled={abrindo}
                    className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                >
                    {abrindo ? "Abrindo pagamento…" : "Assinar agora"}
                </button>
                <BotaoJaPaguei />
            </div>
        </section>
    );
}
