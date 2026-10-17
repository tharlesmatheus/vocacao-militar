import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { exigirAdmin, respostaAdmin } from "@/lib/servidor/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/resumo — números da visão geral do painel. */
export async function GET(req: Request) {
    const auth = await exigirAdmin(req);
    if ("resposta" in auth) return auth.resposta;

    const agora = new Date();
    const iso = (d: Date) => d.toISOString();
    const dias = (n: number) => new Date(agora.getTime() - n * 86400_000);
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const contar = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);

    const [
        assinantesAtivos,
        leads7,
        convertidos7,
        eventosFalhos7,
        comentariosRevisar,
        denunciasPendentes,
        questoesAcervo,
        questoesOcultas,
        errosReportados,
        vendasMes,
    ] = await Promise.all([
        // Mesma regra de assinatura_ativa_de(): ativo/atrasado até access_until + 7 dias, ou período pago.
        contar(supabaseAdmin.from("planos").select("email", { count: "exact", head: true })
            .or(`access_until.gt.${iso(agora)},and(status.in.(ativo,pendente),access_until.gt.${iso(dias(7))})`)),
        contar(supabaseAdmin.from("leads").select("id", { count: "exact", head: true }).gte("created_at", iso(dias(7)))),
        contar(supabaseAdmin.from("leads").select("id", { count: "exact", head: true })
            .eq("status", "convertido").gte("created_at", iso(dias(7)))),
        contar(supabaseAdmin.from("kiwify_events").select("id", { count: "exact", head: true })
            .eq("aplicado", false).not("motivo", "in", '("Evento ignorado","Evento já processado")')
            .gte("created_at", iso(dias(7)))),
        contar(supabaseAdmin.from("questao_comentarios").select("id", { count: "exact", head: true })
            .eq("revisar", true).neq("status", "oculto")),
        contar(supabaseAdmin.from("questao_comentario_denuncias").select("id", { count: "exact", head: true })
            .eq("resolvida", false)),
        contar(supabaseAdmin.from("questoes").select("id", { count: "exact", head: true })
            .eq("origem", "ACERVO").eq("oculta", false)),
        contar(supabaseAdmin.from("questoes").select("id", { count: "exact", head: true })
            .eq("origem", "ACERVO").eq("oculta", true)),
        // Sem a migração 20261025 a contagem falha e fica 0.
        contar(supabaseAdmin.from("questao_reportes").select("id", { count: "exact", head: true }).eq("status", "aberto")),
        supabaseAdmin.from("kiwify_events")
            .select("event, valor:payload->Commissions->charge_amount")
            .eq("aplicado", true)
            .in("event", ["order_approved", "subscription_renewed", "compra_aprovada"])
            .gte("created_at", iso(inicioMes))
            .limit(5000),
    ]);

    const linhas = (vendasMes.data ?? []) as { event: string; valor: number | string | null }[];
    const brutoCentavos = linhas.reduce((soma, l) => soma + (Number(l.valor) || 0), 0);

    return respostaAdmin({
        assinantesAtivos,
        leads7,
        convertidos7,
        conversao7: leads7 ? Math.round((convertidos7 / leads7) * 1000) / 10 : 0,
        eventosFalhos7,
        comentariosRevisar,
        denunciasPendentes,
        questoesAcervo,
        questoesOcultas,
        errosReportados,
        vendasMes: linhas.length,
        faturamentoMes: brutoCentavos / 100,
    });
}
