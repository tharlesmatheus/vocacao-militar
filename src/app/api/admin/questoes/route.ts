import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { exigirAdmin, inteiro, respostaAdmin } from "@/lib/servidor/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Gestão do banco de questões (acervo) pelo administrador. Usa a service role,
 * por isso toda chamada passa por exigirAdmin.
 *
 * GET    ?busca=&disciplina=&situacao=visiveis|ocultas|todas&pagina=1
 * POST   cria questão no acervo (usado pela tela /landing)
 * PATCH  { id, oculta?, enunciado?, alternativas?, correta? }
 * DELETE ?id=   só questões criadas pelo painel (as importadas devem ser ocultadas)
 */

const POR_PAGINA = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CE = { C: "Certo", E: "Errado" };

let donoCache: string | null = null;
async function donoAcervo(): Promise<string> {
    if (donoCache) return donoCache;
    const { data, error } = await supabaseAdmin.rpc("acervo_owner_id");
    if (error || !data) throw new Error("Usuário do acervo não encontrado (acervo_owner_id).");
    donoCache = data as string;
    return donoCache;
}

const texto = (v: unknown, max = 20000) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Normaliza alternativas e gabarito; devolve erro em texto quando inválido. */
function validarConteudo(modalidade: string, alternativasEntrada: unknown, corretaEntrada: unknown) {
    const correta = texto(corretaEntrada, 20);
    if (/certo/i.test(modalidade)) {
        const mapa: Record<string, string> = { CERTO: "C", C: "C", ERRADO: "E", E: "E" };
        const g = mapa[correta.toUpperCase()];
        if (!g) return { erro: "Gabarito de Certo/Errado inválido." } as const;
        return { modalidade: "Certo ou Errado", alternativas: CE, correta: g } as const;
    }
    const alternativas: Record<string, string> = {};
    if (alternativasEntrada && typeof alternativasEntrada === "object") {
        for (const [letra, valor] of Object.entries(alternativasEntrada as Record<string, unknown>)) {
            const l = letra.trim().toUpperCase();
            const t = texto(valor, 5000);
            if (/^[A-E]$/.test(l) && t) alternativas[l] = t;
        }
    }
    const letras = Object.keys(alternativas).sort();
    if (letras.length < 2) return { erro: "Informe pelo menos duas alternativas preenchidas." } as const;
    const g = correta.toUpperCase();
    if (!alternativas[g]) return { erro: "O gabarito precisa ser uma das alternativas." } as const;
    const ordenadas = Object.fromEntries(letras.map((l) => [l, alternativas[l]]));
    return { modalidade: "Multipla Escolha", alternativas: ordenadas, correta: g } as const;
}

/** Garante o item no catálogo do acervo (pelo nome) e devolve o id. */
async function itemCatalogo(tabela: string, dono: string, nome: string, disciplinaId?: string | null) {
    if (!nome) return null;
    const linha: Record<string, unknown> = { user_id: dono, nome, ativo: true };
    if (disciplinaId) linha.disciplina_id = disciplinaId;
    const { data, error } = await supabaseAdmin
        .from(tabela)
        .upsert(linha, { onConflict: disciplinaId ? "user_id,disciplina_id,nome_normalizado" : "user_id,nome_normalizado" })
        .select("id")
        .single();
    if (error) throw new Error(`${tabela}: ${error.message}`);
    return (data as { id: string }).id;
}

export async function GET(req: Request) {
    const auth = await exigirAdmin(req);
    if ("resposta" in auth) return auth.resposta;

    const url = new URL(req.url);
    const busca = texto(url.searchParams.get("busca"), 200).replace(/[%,()]/g, " ");
    const disciplina = texto(url.searchParams.get("disciplina"), 200);
    const situacao = url.searchParams.get("situacao") || "todas";
    const pagina = inteiro(url.searchParams.get("pagina"), 1, 1, 10_000);
    const de = (pagina - 1) * POR_PAGINA;

    let q = supabaseAdmin
        .from("questoes")
        .select("id,origem_ref,instituicao,cargo,banca,disciplina,assunto,ano,modalidade,enunciado,alternativas,correta,oculta,created_at", { count: "exact" })
        .eq("origem", "ACERVO")
        .order("created_at", { ascending: false })
        .order("id")
        .range(de, de + POR_PAGINA - 1);

    if (UUID.test(busca)) q = q.eq("id", busca);
    else if (/^VM3:/i.test(busca)) q = q.eq("origem_ref", busca);
    else if (busca) q = q.ilike("enunciado", `%${busca}%`);
    if (disciplina) q = q.eq("disciplina", disciplina);
    if (situacao === "visiveis") q = q.eq("oculta", false);
    if (situacao === "ocultas") q = q.eq("oculta", true);

    const { data, count, error } = await q;
    if (error) return respostaAdmin({ error: error.message }, 500);
    return respostaAdmin({ itens: data ?? [], total: count ?? 0, porPagina: POR_PAGINA });
}

export async function POST(req: Request) {
    const auth = await exigirAdmin(req);
    if ("resposta" in auth) return auth.resposta;

    const p = await req.json().catch(() => null);
    if (!p || typeof p !== "object") return respostaAdmin({ error: "Dados inválidos." }, 400);

    const enunciado = texto(p.enunciado);
    if (enunciado.length < 15) return respostaAdmin({ error: "Enunciado vazio ou curto demais." }, 400);
    const disciplina = texto(p.disciplina, 300);
    if (!disciplina) return respostaAdmin({ error: "Informe a disciplina." }, 400);

    const conteudo = validarConteudo(texto(p.modalidade, 40), p.alternativas, p.correta);
    if ("erro" in conteudo) return respostaAdmin({ error: conteudo.erro }, 400);

    try {
        const dono = await donoAcervo();
        const instituicao = texto(p.instituicao, 300);
        const cargo = texto(p.cargo, 300);
        const banca = texto(p.banca, 300);
        const assunto = texto(p.assunto, 300);

        const disciplinaId = await itemCatalogo("questao_disciplinas", dono, disciplina);
        const [instituicaoId, cargoId, bancaId, assuntoId] = await Promise.all([
            itemCatalogo("questao_instituicoes", dono, instituicao),
            itemCatalogo("questao_cargos", dono, cargo),
            itemCatalogo("questao_bancas", dono, banca),
            assunto ? itemCatalogo("questao_assuntos", dono, assunto, disciplinaId) : Promise.resolve(null),
        ]);

        const ano = /^\d{4}$/.test(String(p.ano ?? "")) ? Number(p.ano) : null;

        const { data: criada, error } = await supabaseAdmin
            .from("questoes")
            .insert({
                user_id: dono,
                origem: "ACERVO",
                origem_ref: `MANUAL:${crypto.randomUUID()}`,
                questao_instituicao_id: instituicaoId,
                questao_cargo_id: cargoId,
                questao_banca_id: bancaId,
                questao_disciplina_id: disciplinaId,
                questao_assunto_id: assuntoId,
                instituicao: instituicao || null,
                cargo: cargo || null,
                banca: banca || null,
                disciplina,
                assunto: assunto || null,
                ano,
                modalidade: conteudo.modalidade,
                enunciado,
                alternativas: conteudo.alternativas,
                correta: conteudo.correta,
                explicacao: texto(p.explicacao) || null,
            })
            .select("id")
            .single();
        if (error || !criada) throw new Error(error?.message || "Falha ao inserir.");

        // A explicação informada vira o comentário "Por Vocação Militar" da questão.
        const explicacao = texto(p.explicacao, 6000);
        if (explicacao.length >= 20) {
            await supabaseAdmin.from("questao_comentarios").insert({
                questao_id: criada.id,
                autor_tipo: "PLATAFORMA",
                texto: explicacao,
                status: "publicado",
                modelo: "cadastro-admin",
            });
        }

        return respostaAdmin({ id: criada.id }, 201);
    } catch (e: any) {
        console.error("Cadastro de questão no acervo:", e);
        return respostaAdmin({ error: e?.message || "Falha ao salvar a questão." }, 500);
    }
}

export async function PATCH(req: Request) {
    const auth = await exigirAdmin(req);
    if ("resposta" in auth) return auth.resposta;

    const p = await req.json().catch(() => null);
    const id = texto(p?.id, 60);
    if (!UUID.test(id)) return respostaAdmin({ error: "Questão inválida." }, 400);

    const { data: atual } = await supabaseAdmin
        .from("questoes")
        .select("id,modalidade,origem")
        .eq("id", id)
        .maybeSingle<{ id: string; modalidade: string | null; origem: string }>();
    if (!atual || atual.origem !== "ACERVO") return respostaAdmin({ error: "Questão do acervo não encontrada." }, 404);

    const mudancas: Record<string, unknown> = {};
    if (typeof p.oculta === "boolean") mudancas.oculta = p.oculta;
    if (typeof p.enunciado === "string") {
        const e = texto(p.enunciado);
        if (e.length < 15) return respostaAdmin({ error: "Enunciado curto demais." }, 400);
        mudancas.enunciado = e;
    }
    if (p.alternativas !== undefined || p.correta !== undefined) {
        const conteudo = validarConteudo(atual.modalidade ?? "", p.alternativas, p.correta);
        if ("erro" in conteudo) return respostaAdmin({ error: conteudo.erro }, 400);
        mudancas.alternativas = conteudo.alternativas;
        mudancas.correta = conteudo.correta;
    }
    if (!Object.keys(mudancas).length) return respostaAdmin({ error: "Nada para alterar." }, 400);

    const { error } = await supabaseAdmin.from("questoes").update(mudancas).eq("id", id);
    if (error) return respostaAdmin({ error: error.message }, 500);
    return respostaAdmin({ ok: true });
}

export async function DELETE(req: Request) {
    const auth = await exigirAdmin(req);
    if ("resposta" in auth) return auth.resposta;

    const id = new URL(req.url).searchParams.get("id") || "";
    if (!UUID.test(id)) return respostaAdmin({ error: "Questão inválida." }, 400);

    const { data: atual } = await supabaseAdmin
        .from("questoes")
        .select("origem,origem_ref")
        .eq("id", id)
        .maybeSingle<{ origem: string; origem_ref: string | null }>();
    if (!atual || atual.origem !== "ACERVO") return respostaAdmin({ error: "Questão do acervo não encontrada." }, 404);
    if (!String(atual.origem_ref ?? "").startsWith("MANUAL:")) {
        return respostaAdmin({ error: "Questões importadas não são apagadas: use Ocultar." }, 400);
    }

    const { error } = await supabaseAdmin.from("questoes").delete().eq("id", id);
    if (error) return respostaAdmin({ error: `Não foi possível apagar (${error.message}). Use Ocultar.` }, 409);
    return respostaAdmin({ ok: true });
}
