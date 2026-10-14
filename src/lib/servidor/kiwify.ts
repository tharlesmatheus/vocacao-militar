/**
 * Cliente mínimo da API pública da Kiwify (só servidor).
 *
 * Documentação: https://docs.kiwify.com.br/api-reference/general
 *   - Token: POST https://public-api.kiwify.com/v1/oauth/token (form: client_id, client_secret),
 *     válido por 24 h.
 *   - Chamadas: Authorization: Bearer <token> + x-kiwify-account-id.
 *   - GET /v1/sales: start_date e end_date obrigatórios (intervalo máximo de 90 dias).
 *   - Limite: 100 chamadas por minuto.
 *
 * Variáveis (Vercel, nunca no front): KIWIFY_CLIENT_ID, KIWIFY_CLIENT_SECRET,
 * KIWIFY_ACCOUNT_ID e, opcional, KIWIFY_PRODUCT_ID (só vendas deste produto).
 */

const BASE = "https://public-api.kiwify.com/v1";
const TIMEOUT_MS = 10_000;

export type VendaKiwify = {
    id: string;
    status: string;
    created_at?: string;
    updated_at?: string;
    approved_date?: string | null;
    refunded_at?: string | null;
    product?: { id?: string; name?: string };
    customer?: { email?: string; name?: string };
    payment?: { charge_amount?: number | string | null };
    tracking?: { sck?: string | null };
};

export class KiwifyIndisponivel extends Error {}

let tokenCache: { valor: string; expiraEm: number } | null = null;

export function kiwifyConfigurada(): boolean {
    return !!(process.env.KIWIFY_CLIENT_ID && process.env.KIWIFY_CLIENT_SECRET && process.env.KIWIFY_ACCOUNT_ID);
}

async function token(): Promise<string> {
    if (tokenCache && tokenCache.expiraEm > Date.now() + 60_000) return tokenCache.valor;

    const r = await fetch(`${BASE}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: process.env.KIWIFY_CLIENT_ID ?? "",
            client_secret: process.env.KIWIFY_CLIENT_SECRET ?? "",
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok || !dados?.access_token) {
        throw new KiwifyIndisponivel(`token HTTP ${r.status}: ${String(dados?.message ?? dados?.error ?? "").slice(0, 200)}`);
    }
    const segundos = Number(dados.expires_in) || 3600;
    tokenCache = { valor: dados.access_token, expiraEm: Date.now() + segundos * 1000 };
    return tokenCache.valor;
}

function ymd(d: Date) {
    return d.toISOString().slice(0, 10);
}

/**
 * Vendas dos últimos `dias` (detalhes completos), percorrendo as páginas.
 * `maxPaginas` limita o custo de uma conferência (100 vendas por página).
 */
export async function listarVendasRecentes(dias: number, maxPaginas = 10): Promise<VendaKiwify[]> {
    const fim = new Date(Date.now() + 86_400_000); // amanhã: cobre o fuso de Brasília
    const inicio = new Date(Date.now() - dias * 86_400_000);
    const tamanho = 100;
    const vendas: VendaKiwify[] = [];

    for (let pagina = 1; pagina <= maxPaginas; pagina++) {
        const params = new URLSearchParams({
            start_date: ymd(inicio),
            end_date: ymd(fim),
            view_full_sale_details: "true",
            page_size: String(tamanho),
            page_number: String(pagina),
        });
        if (process.env.KIWIFY_PRODUCT_ID) params.set("product_id", process.env.KIWIFY_PRODUCT_ID);

        const fazer = async () =>
            fetch(`${BASE}/sales?${params}`, {
                headers: {
                    Authorization: `Bearer ${await token()}`,
                    "x-kiwify-account-id": process.env.KIWIFY_ACCOUNT_ID ?? "",
                },
                signal: AbortSignal.timeout(TIMEOUT_MS),
                cache: "no-store",
            });

        let r = await fazer();
        if (r.status === 401) {
            tokenCache = null; // token revogado/expirado antes da hora: tenta uma vez com um novo
            r = await fazer();
        }
        const dados = await r.json().catch(() => ({}));
        if (!r.ok) {
            throw new KiwifyIndisponivel(`sales HTTP ${r.status}: ${String(dados?.message ?? dados?.error ?? "").slice(0, 200)}`);
        }

        const lote = (Array.isArray(dados?.data) ? dados.data : []) as VendaKiwify[];
        vendas.push(...lote);
        const total = Number(dados?.pagination?.count);
        if (lote.length < tamanho || (Number.isFinite(total) && vendas.length >= total)) break;
    }
    return vendas;
}

/** Status que significam "pagamento aprovado" na API de vendas. */
export const STATUS_PAGO = new Set(["paid", "approved"]);
