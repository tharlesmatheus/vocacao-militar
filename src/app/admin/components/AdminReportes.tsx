"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi, botao, cartao, dataHora } from "./adminApi";
import { TIPOS_ERRO } from "@/components/questao/ReportarErro";

/*
 * Admin > Erros reportados. Avisos dos alunos agrupados por questão (as mais
 * avisadas primeiro). Resolver/descartar fecha todos os avisos em aberto da
 * questão; "Ocultar questão" também a tira do acervo para os alunos.
 * Corrigir o texto da questão: Admin > Questões (ou no VM3 e republicar).
 */

type Aviso = { id: string; tipo: string; motivo: string; status: string; resposta: string | null; created_at: string };
type Grupo = {
    questaoId: string;
    questao: {
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
    avisos: Aviso[];
};

const NOME_TIPO = Object.fromEntries(TIPOS_ERRO.map((t) => [t.id, t.nome]));
const FILTROS = [
    { id: "aberto", rotulo: "Em aberto" },
    { id: "resolvido", rotulo: "Resolvidos" },
    { id: "descartado", rotulo: "Descartados" },
];

export default function AdminReportes() {
    const [status, setStatus] = useState("aberto");
    const [grupos, setGrupos] = useState<Grupo[] | null>(null);
    const [erro, setErro] = useState("");
    const [ocupado, setOcupado] = useState<string | null>(null);
    const [respostas, setRespostas] = useState<Record<string, string>>({});

    const carregar = useCallback(() => {
        setGrupos(null);
        setErro("");
        adminApi<{ grupos: Grupo[] }>(`/api/admin/reportes?status=${status}`)
            .then((r) => setGrupos(r.grupos))
            .catch((e) => setErro(e.message));
    }, [status]);
    useEffect(carregar, [carregar]);

    async function agir(questaoId: string, acao: "resolvido" | "descartado" | "ocultar") {
        if (acao === "ocultar" && !confirm("Ocultar esta questão para todos os alunos?")) return;
        setOcupado(questaoId);
        try {
            await adminApi("/api/admin/reportes", {
                method: "PATCH",
                body: JSON.stringify({ questaoId, acao, resposta: respostas[questaoId] ?? "" }),
            });
            setGrupos((g) => (g ?? []).filter((x) => x.questaoId !== questaoId));
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setOcupado(null);
        }
    }

    return (
        <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
                {FILTROS.map((f) => (
                    <button
                        key={f.id}
                        className={`${botao} ${status === f.id ? "bg-primary text-primary-foreground" : "border border-border"}`}
                        onClick={() => setStatus(f.id)}
                    >
                        {f.rotulo}
                    </button>
                ))}
                <button className={`${botao} ml-auto border border-border`} onClick={carregar}>Atualizar</button>
            </div>

            {erro && <div className="text-sm text-red-600 dark:text-red-400">{erro}</div>}
            {!grupos && !erro && <div className="animate-pulse text-sm text-muted-foreground">Carregando avisos…</div>}
            {grupos && grupos.length === 0 && <div className="text-sm text-muted-foreground">Nenhum aviso aqui.</div>}

            {grupos?.map((g) => {
                const q = g.questao;
                return (
                    <article key={g.questaoId} className={cartao}>
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-700">
                                {g.avisos.length} {g.avisos.length === 1 ? "aviso" : "avisos"}
                            </span>
                            {[q?.instituicao, q?.cargo, q?.banca, q?.ano, q?.disciplina, q?.assunto].filter(Boolean).join(" · ")}
                            {q?.oculta && <span className="font-semibold text-amber-700">· oculta</span>}
                        </div>
                        <p className="whitespace-pre-line text-sm text-foreground">{q?.enunciado ?? "(questão removida)"}</p>
                        {q?.alternativas && Object.keys(q.alternativas).length > 0 && (
                            <ul className="mt-2 space-y-1 text-sm">
                                {Object.entries(q.alternativas).map(([letra, texto]) => (
                                    <li key={letra} className={letra === q.correta ? "font-semibold text-emerald-700" : "text-foreground"}>
                                        {letra}) {texto}
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="mt-1 text-xs text-muted-foreground">Gabarito: {q?.correta ?? "—"}</div>

                        <ul className="mt-3 space-y-2 border-t border-border pt-3">
                            {g.avisos.map((a) => (
                                <li key={a.id} className="text-sm">
                                    <span className="font-semibold text-foreground">{NOME_TIPO[a.tipo] ?? a.tipo}</span>
                                    <span className="text-muted-foreground"> · {dataHora(a.created_at)}</span>
                                    <p className="whitespace-pre-line text-foreground">{a.motivo}</p>
                                    {a.resposta && <p className="text-xs text-muted-foreground">Resposta: {a.resposta}</p>}
                                </li>
                            ))}
                        </ul>

                        {status === "aberto" && (
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <input
                                    className="min-w-[220px] flex-1 rounded-lg border border-border bg-white px-3 py-1.5 text-sm"
                                    placeholder="Anotação interna (opcional): o que foi feito"
                                    value={respostas[g.questaoId] ?? ""}
                                    onChange={(e) => setRespostas((r) => ({ ...r, [g.questaoId]: e.target.value }))}
                                />
                                <button className={`${botao} bg-emerald-600 text-white`} disabled={ocupado === g.questaoId}
                                    onClick={() => agir(g.questaoId, "resolvido")}>Resolvido</button>
                                <button className={`${botao} border border-border`} disabled={ocupado === g.questaoId}
                                    onClick={() => agir(g.questaoId, "descartado")}>Descartar</button>
                                <button className={`${botao} bg-red-600 text-white`} disabled={ocupado === g.questaoId || !!q?.oculta}
                                    onClick={() => agir(g.questaoId, "ocultar")}>Ocultar questão</button>
                            </div>
                        )}
                    </article>
                );
            })}
        </section>
    );
}
