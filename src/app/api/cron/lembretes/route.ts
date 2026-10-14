import { NextResponse } from "next/server";
import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/*
 * GET /api/cron/lembretes — chamado 1x por dia pela Vercel (vercel.json → crons).
 *
 * Envia "Você tem N revisões para hoje" para cada aparelho inscrito de quem tem
 * revisão vencendo. A Vercel manda "Authorization: Bearer <CRON_SECRET>"; sem
 * esse segredo a rota recusa (ninguém de fora dispara notificação em massa).
 *
 * Variáveis: CRON_SECRET, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Inscricao = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

function json(corpo: unknown, status = 200) {
    return NextResponse.json(corpo, { status, headers: { "Cache-Control": "no-store" } });
}

function mensagem(revisoes: number) {
    return revisoes === 1
        ? "Você tem 1 revisão para hoje. Leva poucos minutos: bora manter a sequência!"
        : `Você tem ${revisoes} revisões para hoje. Comece pelas mais antigas e mantenha a sequência!`;
}

export async function GET(req: Request) {
    const segredo = process.env.CRON_SECRET;
    if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) {
        return json({ error: "Não autorizado." }, 401);
    }

    const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privada = process.env.VAPID_PRIVATE_KEY;
    if (!publica || !privada) return json({ error: "Chaves VAPID não configuradas." }, 500);
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:contato@vocacaomilitar.com.br", publica, privada);

    const { data: pendentes, error } = await supabaseAdmin.rpc("lembretes_do_dia");
    if (error) return json({ error: error.message }, 500);

    const porUsuario = new Map<string, number>();
    for (const l of (pendentes ?? []) as { user_id: string; revisoes: number }[]) {
        if (Number(l.revisoes) > 0) porUsuario.set(l.user_id, Number(l.revisoes));
    }
    if (!porUsuario.size) return json({ enviados: 0, removidos: 0, falhas: 0 });

    const { data: inscricoes, error: erroIns } = await supabaseAdmin
        .from("push_inscricoes")
        .select("id,user_id,endpoint,p256dh,auth")
        .in("user_id", [...porUsuario.keys()]);
    if (erroIns) return json({ error: erroIns.message }, 500);

    let enviados = 0;
    let falhas = 0;
    const remover: string[] = [];
    const enviadosIds: string[] = [];

    const lista = (inscricoes ?? []) as Inscricao[];
    // Lotes de 20 envios simultâneos.
    for (let i = 0; i < lista.length; i += 20) {
        await Promise.all(
            lista.slice(i, i + 20).map(async (s) => {
                const payload = JSON.stringify({
                    title: "Missão do dia",
                    body: mensagem(porUsuario.get(s.user_id) ?? 0),
                    url: "/revisao",
                    tag: "revisoes-do-dia",
                });
                try {
                    await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
                        TTL: 12 * 3600,
                        urgency: "normal",
                    });
                    enviados++;
                    enviadosIds.push(s.id);
                } catch (e: any) {
                    // 404/410: o aparelho cancelou a inscrição; apaga para não tentar de novo.
                    if (e?.statusCode === 404 || e?.statusCode === 410) remover.push(s.id);
                    else {
                        falhas++;
                        console.error("Push falhou:", e?.statusCode, e?.body ?? e?.message);
                    }
                }
            })
        );
    }

    if (remover.length) await supabaseAdmin.from("push_inscricoes").delete().in("id", remover);
    if (enviadosIds.length) {
        await supabaseAdmin.from("push_inscricoes").update({ ultimo_envio: new Date().toISOString() }).in("id", enviadosIds);
    }

    return json({ enviados, removidos: remover.length, falhas });
}
