/*
 * Pixel da Meta (anúncios no Facebook/Instagram).
 *
 * Eventos enviados pelo site:
 *   PageView              toda página (exceto admin)
 *   ViewContent           abriu a página de venda (/assinar)
 *   Lead + InitiateCheckout  preencheu o formulário e foi para o checkout
 *   InitiateCheckout      clicou em assinar dentro do app
 *   CompleteRegistration  criou conta em /auth
 * A COMPRA (Purchase) é enviada pela Kiwify (pixel + API de Conversões
 * configurados no produto). O site não envia Purchase, para não contar em dobro.
 *
 * O ID do pixel não é segredo (aparece no código de qualquer site com pixel).
 */
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "3591563237683700";

type Fbq = (acao: string, ...args: unknown[]) => void;

export function eventoPixel(evento: string, dados?: Record<string, unknown>) {
    if (typeof window === "undefined") return;
    const w = window as unknown as { fbq?: Fbq; __fbqPendentes?: unknown[][] };
    try {
        if (w.fbq) w.fbq("track", evento, dados);
        // Pixel ainda não carregou (primeira página): guarda e o MetaPixel envia depois do init.
        else (w.__fbqPendentes ??= []).push(["track", evento, dados]);
    } catch {
        /* pixel bloqueado (adblock): nunca atrapalha o site */
    }
}

/** Dispara o evento e só então troca de página (dá tempo do envio sair). */
export function eventoPixelEIr(url: string, eventos: Array<[string, Record<string, unknown>?]>) {
    eventos.forEach(([e, d]) => eventoPixel(e, d));
    window.setTimeout(() => window.location.assign(url), 350);
}

export const VALOR_PLANO = { value: 14.9, currency: "BRL" };
