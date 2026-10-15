import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { exigirAdmin, respostaAdmin } from "@/lib/servidor/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Admin > Nomes: nome que veio da fonte -> nome oficial (instituições e cargos).
 *
 * GET   /api/admin/nomes?tipo=cargo|instituicao&situacao=pendente|regra|confirmado&busca=
 *         -> { itens: [...], pendentes: n, oficiais: { cargo: [...], instituicao: [...] } }
 * PATCH /api/admin/nomes  { id, nome_oficial, area?, todas? }
 *         Grava a decisão (situação "confirmado": o publicador do VM3 nunca a desfaz)
 *         e já atualiza as questões do acervo.
 */
const TIPOS = new Set(["cargo", "instituicao"]);
const SITUACOES = new Set(["pendente", "regra", "confirmado"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const semTabela = (msg?: string) =>
    /nomes_equivalencia|admin_nomes_listar|admin_nome_definir/.test(msg ?? "")
        ? "Rode antes no Supabase a migração 20261021_nomes_oficiais.sql."
        : msg ?? "Erro no banco.";

export async function GET(req: Request) {
    const auth = await exigirAdmin(req);
    if ("resposta" in auth) return auth.resposta;

    const url = new URL(req.url);
    const tipo = url.searchParams.get("tipo");
    const situacao = url.searchParams.get("situacao");
    const busca = (url.searchParams.get("busca") ?? "").trim().slice(0, 100);

    const [lista, pend, oficiais] = await Promise.all([
        supabaseAdmin.rpc("admin_nomes_listar", {
            p_tipo: tipo && TIPOS.has(tipo) ? tipo : null,
            p_situacao: situacao && SITUACOES.has(situacao) ? situacao : null,
            p_busca: busca || null,
        }),
        supabaseAdmin.from("nomes_equivalencia").select("id", { count: "exact", head: true }).eq("situacao", "pendente"),
        // Nomes oficiais já em uso: sugestões no campo de edição.
        supabaseAdmin.from("nomes_equivalencia").select("tipo,nome_oficial").limit(5000),
    ]);
    if (lista.error) return respostaAdmin({ error: semTabela(lista.error.message) }, 500);
    if (pend.error) return respostaAdmin({ error: semTabela(pend.error.message) }, 500);
    if (oficiais.error) return respostaAdmin({ error: semTabela(oficiais.error.message) }, 500);

    const porTipo: Record<string, Set<string>> = { cargo: new Set(), instituicao: new Set() };
    for (const o of oficiais.data ?? []) porTipo[o.tipo]?.add(o.nome_oficial);
    const ordenar = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));

    return respostaAdmin({
        itens: lista.data ?? [],
        pendentes: pend.count ?? 0,
        oficiais: { cargo: ordenar(porTipo.cargo), instituicao: ordenar(porTipo.instituicao) },
    });
}

export async function PATCH(req: Request) {
    const auth = await exigirAdmin(req);
    if ("resposta" in auth) return auth.resposta;

    const corpo = await req.json().catch(() => null);
    const id = typeof corpo?.id === "string" ? corpo.id : "";
    const nome = typeof corpo?.nome_oficial === "string" ? corpo.nome_oficial.trim().slice(0, 200) : "";
    const area = typeof corpo?.area === "string" ? corpo.area.trim().slice(0, 200) : "";
    if (!UUID.test(id)) return respostaAdmin({ error: "Item inválido." }, 400);
    if (!nome) return respostaAdmin({ error: "Informe o nome oficial." }, 400);

    const { data, error } = await supabaseAdmin.rpc("admin_nome_definir", {
        p_id: id,
        p_nome_oficial: nome,
        p_area: area || null,
        p_todas: corpo?.todas === true,
        p_admin: auth.admin.id,
    });
    if (error) return respostaAdmin({ error: semTabela(error.message) }, 500);
    return respostaAdmin({ ok: true, ...(data as object) });
}
