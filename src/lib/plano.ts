/** Dados do plano exibidos no app (um lugar só para trocar preço ou link). */
export const PRECO_PLANO = "R$ 14,90";
export const CHECKOUT_URL = "https://pay.kiwify.com.br/tRPgeye";

/** Link do checkout já com o e-mail da conta (a assinatura é ligada pelo e-mail). */
export function linkCheckout(email?: string | null): string {
    const e = (email ?? "").trim().toLowerCase();
    return e ? `${CHECKOUT_URL}?email=${encodeURIComponent(e)}` : CHECKOUT_URL;
}
