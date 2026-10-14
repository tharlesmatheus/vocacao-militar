"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi, botao, cartao, dataHora } from "./adminApi";
import AdminComentariosLote from "./AdminComentariosLote";

type Comentario = {
    id: string;
    questao_id: string;
    autor_tipo: "PLATAFORMA" | "ALUNO";
    autor_nome: string;
    texto: string;
    status: string;
    revisar: boolean;
    created_at: string;
    questoes?: {
        enunciado: string;
        alternativas: Record<string, string> | null;
        correta: string;
        disciplina: string | null;
        assunto: string | null;
        banca: string | null;
        modalidade: string | null;
    } | null;
    denuncias?: { total: number; motivos: string[] };
};

function CartaoComentario({ c, aoMudar }: { c: Comentario; aoMudar: () => void }) {
    const [editando, setEditando] = useState(false);
    const [texto, setTexto] = useState(c.texto);
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState("");
    const [abrirQuestao, setAbrirQuestao] = useState(false);

    async function agir(acao: string, extra: Record<string, unknown> = {}) {
        if (acao === "regenerar" && !confirm("Apagar este comentário? Um novo será gerado quando um aluno abrir os comentários.")) return;
        setOcupado(true);
        setErro("");
        try {
            await adminApi("/api/admin/comentarios", { method: "PATCH", body: JSON.stringify({ id: c.id, acao, ...extra }) });
            aoMudar();
        } catch (e: any) {
            setErro(e.message);
            setOcupado(false);
        }
    }

    const q = c.questoes;
    const oficial = c.autor_tipo === "PLATAFORMA";

    return (
        <div className={cartao}>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-semibold ${oficial ? "bg-primary/15 text-primary" : "bg-muted text-foreground"}`}>
                    {oficial ? "Por Vocação Militar" : `Aluno: ${c.autor_nome}`}
                </span>
                {c.revisar && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-800 dark:text-amber-300">IA suspeitou do gabarito</span>}
                {c.denuncias && <span className="rounded-full bg-red-500/10 px-2 py-0.5 font-semibold text-red-700 dark:text-red-300">{c.denuncias.total} denúncia(s)</span>}
                <span className="text-muted-foreground">{q?.disciplina ?? "—"} • {q?.banca ?? "—"} • {dataHora(c.created_at)}</span>
            </div>

            {q && (
                <button type="button" className="mb-2 text-left text-sm text-[#526b88] underline" onClick={() => setAbrirQuestao((v) => !v)}>
                    {abrirQuestao ? "Ocultar questão" : "Ver questão e gabarito"}
                </button>
            )}
            {abrirQuestao && q && (
                <div className="mb-3 rounded-lg bg-muted p-3 text-sm">
                    <p className="whitespace-pre-line">{q.enunciado}</p>
                    {q.alternativas && !/certo/i.test(q.modalidade ?? "") && (
                        <ul className="mt-2">
                            {Object.entries(q.alternativas).map(([l, t]) => (
                                <li key={l} className={l === q.correta ? "font-bold text-green-700 dark:text-green-300" : ""}>{l}) {t}</li>
                            ))}
                        </ul>
                    )}
                    <p className="mt-2 font-semibold">Gabarito: {/certo/i.test(q.modalidade ?? "") ? (q.correta === "C" ? "Certo" : "Errado") : q.correta}</p>
                </div>
            )}

            {editando ? (
                <textarea className="h-48 w-full rounded-lg border border-border p-3 text-sm" value={texto} onChange={(e) => setTexto(e.target.value)} />
            ) : (
                <p className="whitespace-pre-line text-sm text-foreground">{c.texto}</p>
            )}
            {c.denuncias?.motivos.length ? <p className="mt-2 text-xs text-red-700 dark:text-red-300">Motivos: {c.denuncias.motivos.join(" • ")}</p> : null}
            {erro && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{erro}</p>}

            <div className="mt-3 flex flex-wrap gap-2">
                {editando ? (
                    <>
                        <button disabled={ocupado} className={`${botao} bg-primary text-primary-foreground`} onClick={() => agir("editar", { texto })}>Salvar texto</button>
                        <button disabled={ocupado} className={`${botao} bg-muted`} onClick={() => { setEditando(false); setTexto(c.texto); }}>Cancelar</button>
                    </>
                ) : (
                    <>
                        <button disabled={ocupado} className={`${botao} bg-green-600 text-white`} onClick={() => agir("aprovar")}>Está correto</button>
                        <button disabled={ocupado} className={`${botao} bg-muted`} onClick={() => setEditando(true)}>Editar</button>
                        {oficial && <button disabled={ocupado} className={`${botao} bg-muted`} onClick={() => agir("regenerar")}>Gerar de novo</button>}
                        <button disabled={ocupado} className={`${botao} bg-red-600 text-white`} onClick={() => agir("ocultar")}>Ocultar</button>
                    </>
                )}
            </div>
        </div>
    );
}

export default function AdminModeracao() {
    const [dados, setDados] = useState<{ revisar: Comentario[]; denunciados: Comentario[] } | null>(null);
    const [erro, setErro] = useState("");

    const carregar = useCallback(() => {
        adminApi("/api/admin/comentarios").then(setDados).catch((e) => setErro(e.message));
    }, []);

    useEffect(carregar, [carregar]);

    if (erro) return <div className="text-red-600 dark:text-red-400">{erro}</div>;
    if (!dados) return <div className="animate-pulse text-muted-foreground">Carregando fila de moderação...</div>;

    return (
        <div className="flex flex-col gap-8">
            <AdminComentariosLote />

            <section>
                <h2 className="mb-1 text-lg font-bold text-foreground">Denunciados ({dados.denunciados.length})</h2>
                <p className="mb-3 text-sm text-muted-foreground">Comentários que alunos marcaram como errados ou ofensivos.</p>
                <div className="flex flex-col gap-3">
                    {dados.denunciados.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma denúncia pendente.</p>}
                    {dados.denunciados.map((c) => <CartaoComentario key={c.id} c={c} aoMudar={carregar} />)}
                </div>
            </section>

            <section>
                <h2 className="mb-1 text-lg font-bold text-foreground">Para revisar ({dados.revisar.length})</h2>
                <p className="mb-3 text-sm text-muted-foreground">
                    Comentários "Por Vocação Militar" em que a IA desconfiou do gabarito. Confira a questão antes de aprovar.
                </p>
                <div className="flex flex-col gap-3">
                    {dados.revisar.length === 0 && <p className="text-sm text-muted-foreground">Nada para revisar.</p>}
                    {dados.revisar.map((c) => <CartaoComentario key={c.id} c={c} aoMudar={carregar} />)}
                </div>
            </section>
        </div>
    );
}
