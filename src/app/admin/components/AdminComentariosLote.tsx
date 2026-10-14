"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminApi, botao, cartao, entrada } from "./adminApi";

type Linha = { disciplina: string; total: number; com_comentario: number };
type Lote = { gerados: number; revisar: number; falhas: number };

const METAS = [50, 200, 1000, 100000];

/**
 * Gera com antecedência os comentários "Por Vocação Militar" de uma disciplina.
 * Roda em lotes de 4 enquanto esta aba estiver aberta; dá para parar a qualquer momento.
 */
export default function AdminComentariosLote() {
    const [linhas, setLinhas] = useState<Linha[] | null>(null);
    const [erro, setErro] = useState("");
    const [alvo, setAlvo] = useState<string | null>(null);
    const [meta, setMeta] = useState(200);
    const [progresso, setProgresso] = useState({ gerados: 0, revisar: 0, falhas: 0 });
    const [mensagem, setMensagem] = useState("");
    const parar = useRef(false);

    const carregar = useCallback(() => {
        adminApi<{ disciplinas: Linha[] }>("/api/admin/comentarios/lote")
            .then((r) => setLinhas(r.disciplinas.map((l) => ({ ...l, total: Number(l.total), com_comentario: Number(l.com_comentario) }))))
            .catch((e) => setErro(e.message));
    }, []);
    useEffect(carregar, [carregar]);

    async function gerar(disciplina: string) {
        parar.current = false;
        setAlvo(disciplina);
        setMensagem("");
        const soma = { gerados: 0, revisar: 0, falhas: 0 };
        setProgresso({ ...soma });
        let falhasSeguidas = 0;
        try {
            while (!parar.current && soma.gerados < meta) {
                const r = await adminApi<Lote>("/api/admin/comentarios/lote", {
                    method: "POST",
                    body: JSON.stringify({ disciplina, quantidade: 4 }),
                });
                soma.gerados += r.gerados;
                soma.revisar += r.revisar;
                soma.falhas += r.falhas;
                setProgresso({ ...soma });
                if (r.gerados === 0 && r.falhas === 0) {
                    setMensagem("Todas as questões desta disciplina já têm comentário.");
                    break;
                }
                falhasSeguidas = r.gerados === 0 ? falhasSeguidas + 1 : 0;
                if (falhasSeguidas >= 3) {
                    setMensagem("A IA falhou 3 vezes seguidas (limite de uso do Gemini?). Tente de novo mais tarde.");
                    break;
                }
            }
            if (parar.current) setMensagem("Parado.");
            else if (soma.gerados >= meta) setMensagem("Meta do lote atingida.");
        } catch (e: any) {
            setMensagem(e.message);
        } finally {
            setAlvo(null);
            carregar();
        }
    }

    return (
        <section className={cartao}>
            <h2 className="mb-1 text-lg font-bold text-foreground">Gerar comentários com antecedência</h2>
            <p className="mb-4 text-sm text-muted-foreground">
                Deixa o "Ver comentários" instantâneo para os alunos e permite revisar antes. Mantenha esta aba aberta
                enquanto gera. Comentários em que a IA desconfiar do gabarito aparecem em "Para revisar".
            </p>

            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Gerar até</span>
                <select className={entrada} value={meta} onChange={(e) => setMeta(Number(e.target.value))} disabled={!!alvo}>
                    {METAS.map((m) => (
                        <option key={m} value={m}>{m >= 100000 ? "todas" : `${m} questões`}</option>
                    ))}
                </select>
                <span className="text-muted-foreground">por vez.</span>
                {alvo && (
                    <button className={`${botao} ml-auto bg-red-600 text-white`} onClick={() => { parar.current = true; }}>
                        Parar
                    </button>
                )}
            </div>

            {(alvo || mensagem) && (
                <div className="mb-4 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-foreground">
                    {alvo && <div className="font-semibold">Gerando: {alvo}…</div>}
                    <div>
                        {progresso.gerados} gerados • {progresso.revisar} para revisar • {progresso.falhas} falhas
                    </div>
                    {mensagem && <div className="mt-1 text-muted-foreground">{mensagem}</div>}
                </div>
            )}

            {erro && <div className="text-sm text-red-600 dark:text-red-400">{erro}</div>}
            {!linhas && !erro && <div className="animate-pulse text-sm text-muted-foreground">Carregando disciplinas…</div>}
            {linhas && (
                <div className="max-h-[420px] overflow-y-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-muted text-left text-xs uppercase text-muted-foreground">
                            <tr><th className="p-3">Disciplina</th><th className="p-3">Com comentário</th><th className="p-3" /></tr>
                        </thead>
                        <tbody>
                            {linhas.map((l) => {
                                const pct = l.total ? Math.round((100 * l.com_comentario) / l.total) : 0;
                                const faltam = l.total - l.com_comentario;
                                return (
                                    <tr key={l.disciplina} className="border-t border-border">
                                        <td className="p-3 font-medium text-foreground">{l.disciplina}</td>
                                        <td className="p-3">
                                            <div className="flex items-center gap-2">
                                                <div className="h-2 w-24 rounded-full bg-muted">
                                                    <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                                                </div>
                                                <span className="text-muted-foreground">
                                                    {l.com_comentario.toLocaleString("pt-BR")} / {l.total.toLocaleString("pt-BR")}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-3 text-right">
                                            <button
                                                className={`${botao} bg-primary text-primary-foreground`}
                                                disabled={!!alvo || faltam === 0}
                                                onClick={() => gerar(l.disciplina)}
                                            >
                                                {faltam === 0 ? "Completo" : "Gerar"}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
