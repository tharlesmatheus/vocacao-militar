"use client";

import { useEffect, type ReactNode } from "react";
import { CHECKOUT_URL } from "@/lib/plano";
import { VALOR_PLANO, eventoPixel, eventoPixelEIr } from "@/lib/pixel";

/*
 * Botão "Obter acesso" da página de venda: vai direto para o checkout da Kiwify,
 * sem formulário. Leva junto os UTMs do anúncio (utm_*, src) para a venda aparecer
 * com a origem certa na Kiwify, e dispara o InitiateCheckout no Pixel.
 * A conta é criada depois do pagamento, pelo e-mail informado no checkout.
 */

const REPASSAR = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "src", "sck"];

function urlCheckout(): string {
    const destino = new URL(CHECKOUT_URL);
    if (typeof window !== "undefined") {
        const aqui = new URLSearchParams(window.location.search);
        for (const k of REPASSAR) {
            const v = aqui.get(k);
            if (v) destino.searchParams.set(k, v.slice(0, 200));
        }
    }
    return destino.toString();
}

export function BotaoCheckout({ children, className = "" }: { children: ReactNode; className?: string }) {
    return (
        <a
            href={CHECKOUT_URL}
            className={className}
            onClick={(e) => {
                e.preventDefault();
                eventoPixelEIr(urlCheckout(), [["InitiateCheckout", VALOR_PLANO]]);
            }}
        >
            {children}
        </a>
    );
}

/** Registra no Pixel que a pessoa viu a página de venda (uma vez por visita). */
export function PixelPaginaVenda() {
    useEffect(() => {
        eventoPixel("ViewContent", { content_name: "Assinatura mensal", ...VALOR_PLANO });
    }, []);
    return null;
}
