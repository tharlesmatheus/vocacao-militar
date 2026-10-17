import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { exigirAdmin, respostaAdmin } from "@/lib/servidor/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Erros reportados pelos alunos nas questões (só admin).
 *
 * GET   ?status=aberto|resolvido|descartado -> avisos agrupados por questão (mais avisados primeiro)
 * PATCH { questaoId, acao: "resolvido" | "descartado" | "ocultar", resposta? }
 *        Fecha TODOS os avisos em aberto da questão. "ocultar" também esconde a questão dos alunos
 *        (oculta manual: nunca é reexibida sozinha pelo publicador).
 */

type Linha = {
    id: string;
    questao_id: string;
    tipo: string;
    motivo: string;
    status: string;
    resposta: string | null;
    created_at: string;
    questoes: {
        enunciado: string | null;
        alternativas: Record<string, string> | null;
        correta: string | null;
        instituicao: string | null;
        cargo: string | null;
        disciplina: string | null;
        assunto: string | null;
        banca: string | null;
        ano: number | null;
        oculta: boolean | null;
    } | null;
};

const STATUS = ["aberto", "resolvido", "descartado"];

export async function GET(req: Request) {
    const auth = await exigirAdmin(req);
    if ("resposta" in auth) return auth.resposta;

    const pedido = new URL(req.url).searchParams.get("status") ?? "aberto";
    const status = STATUS.includes(pedido) ? pedido : "aberto";
    const { data, error } = await supabaseAdmin
        .from("questao_reportes")
        .select("id,questao_id,tipo,motivo,status,resposta,created_at," +
            "questoes(enunciado,alternativas,correta,instituicao,cargo,disciplina,assunto,banca,ano,oculta)")
        .eq("status", status)
        .order("created_at", { ascending: false })
        .limit(500);
    if (error) return respostaAdmin({ error: error.message }, 500);

    const grupos = new Map<string, { questaoId: string; questao: Linha["questoes"]; avisos: Omit<Linha, "questoes">[] }>();
    for (const l of (data ?? []) as unknown as Linha[]) {
        const g = grupos.get(l.questao_id) ?? { questaoId: l.questao_id, questao: l.questoes, avisos: [] };
        const { questoes: _q, ...aviso } = l;
        g.avisos.push(aviso);
        grupos.set(l.questao_id, g);
    }
    const lista = [...grupos.values()].sort((a, b) => b.avisos.length - a.avisos.length);
    return respostaAdmin({ status, grupos: lista });
}

export async function PATCH(req: Request) {
    const auth = await exigirAdmin(req);
    if ("resposta" in auth) return auth.resposta;

    let corpo: { questaoId?: unknown; acao?: unknown; resposta?: unknown };
    try {
        corpo = await req.json();
    } catch {
        return respostaAdmin({ error: "JSON inválido." }, 400);
    }
    const questaoId = typeof corpo.questaoId === "string" ? corpo.questaoId : "";
    const acao = String(corpo.acao ?? "");
    const resposta = typeof corpo.resposta === "string" ? corpo.resposta.trim().slice(0, 1000) || null : null;
    if (!questaoId || !["resolvido", "descartado", "ocultar"].includes(acao)) {
        return respostaAdmin({ error: "Informe a questão e a ação." }, 400);
    }

    if (acao === "ocultar") {
        const { error } = await supabaseAdmin.from("questoes").update({ oculta: true, oculta_motivo: null }).eq("id", questaoId);
        if (error) return respostaAdmin({ error: error.message }, 500);
    }
    const { data, error } = await supabaseAdmin
        .from("questao_reportes")
        .update({
            status: acao === "descartado" ? "descartado" : "resolvido",
            resposta: resposta ?? (acao === "ocultar" ? "Questão retirada do acervo." : null),
            resolvido_por: auth.admin.id,
            resolvido_em: new Date().toISOString(),
        })
        .eq("questao_id", questaoId)
        .eq("status", "aberto")
        .select("id");
    if (error) return respostaAdmin({ error: error.message }, 500);
    return respostaAdmin({ fechados: data?.length ?? 0 });
}
