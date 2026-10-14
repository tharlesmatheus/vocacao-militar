import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { temAssinaturaAtiva, usuarioDaRequisicao } from "@/lib/servidor/usuario";
import { KiwifyIndisponivel, STATUS_PAGO, kiwifyConfigurada, listarVendasRecentes, type VendaKiwify } from "@/lib/servidor/kiwify";

/*
 * "Já paguei": o aluno logado pede para conferir o pagamento.
 *
 * Serve para quando o webhook da Kiwify falhou ou atrasou. Consultamos as vendas
 * recentes na API da Kiwify e procuramos uma venda PAGA que seja deste aluno:
 *   - mesmo e-mail da conta (a API não filtra por e-mail, por isso listamos), ou
 *   - cadastro feito em /assinar (o id do lead volta em tracking.sck).
 *
 * Achou: libera o plano até a data da aprovação + 35 dias (a API de vendas não
 * informa o próximo pagamento; o webhook corrige a data quando chegar).
 * Nunca reduz um acesso que já existe e não passa por cima de reembolso/chargeback
 * mais recente.
 *
 * Proteções: só o próprio aluno, e-mail confirmado, até 4 conferências a cada 15 min.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DIAS_BUSCA = 40;
const DIAS_PERIODO = 35;
const LIMITE_JANELA = 4;
const JANELA_MIN = 15;
const EVENTOS_CORTE = new Set(["compra_reembolsada", "chargeback", "order_refunded", "refunded", "order_chargeback"]);

type Plano = {
    email: string;
    status: string | null;
    access_until: string | null;
    ultimo_evento: string | null;
    ultimo_evento_em: string | null;
};

function resposta(corpo: unknown, status = 200) {
    return NextResponse.json(corpo, { status, headers: { "Cache-Control": "no-store" } });
}

function quando(v: VendaKiwify): number {
    const t = Date.parse(v.approved_date || v.updated_at || v.created_at || "");
    return Number.isFinite(t) ? t : 0;
}

function maior(a: string | null | undefined, b: string): string {
    if (!a) return b;
    return Date.parse(a) > Date.parse(b) ? a : b;
}

export async function POST(req: Request) {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario?.email) return resposta({ error: "Faça login novamente." }, 401);
    if (!usuario.email_confirmed_at) {
        return resposta({ error: "Confirme seu e-mail antes (veja a mensagem que enviamos) e tente de novo." }, 403);
    }
    const email = usuario.email.trim().toLowerCase();

    const registrar = (resultado: string, pedidoId: string | null = null) =>
        supabaseAdmin.from("verificacoes_pagamento").insert({ user_id: usuario.id, email, resultado, pedido_id: pedidoId });

    if (await temAssinaturaAtiva(usuario.id)) {
        return resposta({ liberado: true, jaAtivo: true, mensagem: "Sua assinatura já está ativa." });
    }

    // Limite por aluno (protege a cota de 100 chamadas/min da Kiwify).
    const desde = new Date(Date.now() - JANELA_MIN * 60_000).toISOString();
    const { count } = await supabaseAdmin
        .from("verificacoes_pagamento")
        .select("id", { count: "exact", head: true })
        .eq("user_id", usuario.id)
        .gte("criado_em", desde);
    if ((count ?? 0) >= LIMITE_JANELA) {
        return resposta({ error: `Você já conferiu algumas vezes agora. Aguarde ${JANELA_MIN} minutos e tente de novo.` }, 429);
    }

    if (!kiwifyConfigurada()) {
        console.error("Já paguei: KIWIFY_CLIENT_ID/KIWIFY_CLIENT_SECRET/KIWIFY_ACCOUNT_ID não configurados.");
        return resposta({ error: "A conferência automática está indisponível agora. Fale com o suporte." }, 503);
    }

    // Cadastros feitos em /assinar por este aluno (o id volta em tracking.sck).
    const { data: leads } = await supabaseAdmin
        .from("leads")
        .select("id")
        .or(`user_id.eq.${usuario.id},email.eq."${email}"`)
        .limit(20);
    const idsLead = new Set((leads ?? []).map((l: { id: string }) => l.id));

    let vendas: VendaKiwify[];
    try {
        vendas = await listarVendasRecentes(DIAS_BUSCA);
    } catch (e) {
        console.error("Já paguei: falha na API da Kiwify:", e instanceof KiwifyIndisponivel ? e.message : e);
        await registrar("erro");
        return resposta({ error: "Não conseguimos falar com a Kiwify agora. Tente de novo em alguns minutos." }, 502);
    }

    const doAluno = vendas
        .filter((v) => STATUS_PAGO.has(String(v.status ?? "").toLowerCase()))
        .filter((v) =>
            String(v.customer?.email ?? "").trim().toLowerCase() === email ||
            (!!v.tracking?.sck && idsLead.has(String(v.tracking.sck)))
        )
        .sort((a, b) => quando(b) - quando(a));

    const venda = doAluno[0];
    const aprovadoEm = venda ? quando(venda) : 0;
    const ate = new Date(aprovadoEm + DIAS_PERIODO * 86_400_000);

    if (!venda || !aprovadoEm || ate.getTime() <= Date.now()) {
        await registrar("nao_encontrado");
        return resposta({
            liberado: false,
            email,
            mensagem:
                "Ainda não encontramos um pagamento aprovado com este e-mail. Pix costuma aparecer em poucos minutos e boleto em até 3 dias úteis. " +
                "Se você pagou com outro e-mail, fale com o suporte informando os dois e-mails.",
        });
    }

    const aprovadoIso = new Date(aprovadoEm).toISOString();
    const { data: atual } = await supabaseAdmin
        .from("planos")
        .select("email,status,access_until,ultimo_evento,ultimo_evento_em")
        .eq("email", email)
        .maybeSingle<Plano>();

    // Um reembolso/chargeback registrado depois desta venda vale mais que ela.
    if (atual?.ultimo_evento && EVENTOS_CORTE.has(atual.ultimo_evento) && atual.ultimo_evento_em
        && Date.parse(atual.ultimo_evento_em) >= aprovadoEm) {
        await registrar("nao_encontrado", venda.id);
        return resposta({
            liberado: false,
            email,
            mensagem: "Encontramos este pagamento, mas ele foi estornado. Fale com o suporte se isso estiver errado.",
        });
    }

    const accessUntil = maior(atual?.access_until, ate.toISOString());
    const valor = Number(venda.payment?.charge_amount);
    const campos = {
        user_id: usuario.id,
        status: "ativo",
        access_until: accessUntil,
        ultimo_evento: "verificacao_manual",
        ultimo_evento_em: maior(atual?.ultimo_evento_em, aprovadoIso),
        updated_at: new Date().toISOString(),
        ...(Number.isFinite(valor) && valor > 0 ? { valor_pago: Math.round(valor) / 100 } : {}),
    };

    const { error: erroPlano } = atual
        ? await supabaseAdmin.from("planos").update(campos).eq("email", email)
        : await supabaseAdmin.from("planos").insert({ email, ...campos });
    if (erroPlano) {
        console.error("Já paguei: erro ao gravar o plano:", erroPlano.message);
        await registrar("erro", venda.id);
        return resposta({ error: "Encontramos o pagamento, mas houve um erro ao liberar. Tente de novo." }, 500);
    }

    // Auditoria no mesmo lugar dos eventos da Kiwify (aparece em Admin → Vendas → Eventos).
    const { error: erroEvento } = await supabaseAdmin.from("kiwify_events").insert({
        event_key: `api:${venda.id}`,
        order_id: venda.id,
        event: "verificacao_manual",
        email,
        payload: {
            id: venda.id,
            status: venda.status,
            approved_date: venda.approved_date ?? null,
            product: venda.product ?? null,
            sck: venda.tracking?.sck ?? null,
            charge_amount: venda.payment?.charge_amount ?? null,
        },
        aplicado: true,
        motivo: "Liberado pelo botão Já paguei",
    });
    if (erroEvento && erroEvento.code !== "23505") console.error("Já paguei: auditoria não gravada:", erroEvento.message);

    const sck = venda.tracking?.sck ? String(venda.tracking.sck) : "";
    if (sck && idsLead.has(sck)) {
        await supabaseAdmin
            .from("leads")
            .update({ status: "convertido", convertido_em: new Date().toISOString(), user_id: usuario.id })
            .eq("id", sck)
            .neq("status", "convertido");
    }

    await registrar("liberado", venda.id);
    return resposta({ liberado: true, ate: accessUntil, mensagem: "Pagamento encontrado. Seu acesso foi liberado!" });
}

export async function GET() {
    return resposta({ error: "Método não permitido" }, 405);
}
