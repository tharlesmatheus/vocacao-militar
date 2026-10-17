"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi, botao, cartao, dataHora, entrada } from "./adminApi";

type Resumo = { instituicao: string; total: number; com_comentario: number };
type Lote = {
    id: string;
    modelo: string;
    instituicoes: string[];
    total: number;
    status: string;
    importados: number;
    ignorados: number;
    falhas: number;
    erro: string | null;
    created_at: string;
};

const PADRAO = "PM PE, PC PE";
const LIMITES = [100, 500, 1000, 2000, 5000];

const NOME_STATUS: Record<string, string> = {
    enviado: "Enviado",
    validating: "Validando",
    in_progress: "Processando",
    finalizing: "Finalizando",
    completed: "Pronto para importar",
    importado: "Importado",
    failed: "Falhou",
    expired: "Expirou",
    cancelling: "Cancelando",
    cancelled: "Cancelado",
};
const IMPORTAVEL = ["completed", "expired", "cancelled"];

/**
 * Comentários em lote pela OpenAI Batch API: metade do preço, sem precisar deixar a aba aberta.
 * Envia as questões sem comentário das instituições escolhidas; quando a OpenAI terminar
 * (minutos a 24 h), clique em "Importar".
 */
export default function AdminComentariosOpenAI() {
    const [instituicoes, setInstituicoes] = useState(PADRAO);
    const [limite, setLimite] = useState(1000);
    const [modelo, setModelo] = useState("");
    const [resumo, setResumo] = useState<Resumo[]>([]);
    const [lotes, setLotes] = useState<Lote[] | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const [mensagem, setMensagem] = useState("");

    const carregar = useCallback((lista = instituicoes) => {
        adminApi<{ modelo: string; resumo: Resumo[]; lotes: Lote[] }>(
            `/api/admin/comentarios/openai?instituicoes=${encodeURIComponent(lista)}`
        )
            .then((r) => {
                setModelo(r.modelo);
                setResumo(r.resumo.map((l) => ({ ...l, total: Number(l.total), com_comentario: Number(l.com_comentario) })));
                setLotes(r.lotes);
            })
            .catch((e) => setMensagem(e.message));
    }, [instituicoes]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => carregar(), []);

    const faltam = resumo.reduce((s, l) => s + l.total - l.com_comentario, 0);
    const temAberto = (lotes ?? []).some((l) => !["importado", "failed", ...IMPORTAVEL].includes(l.status));

    async function acao(corpo: object, sucesso: (r: any) => string) {
        setOcupado(true);
        setMensagem("");
        try {
            const r = await adminApi("/api/admin/comentarios/openai", { method: "POST", body: JSON.stringify(corpo) });
            setMensagem(sucesso(r));
        } catch (e: any) {
            setMensagem(e.message);
        } finally {
            setOcupado(false);
            carregar();
        }
    }

    const enviar = () => {
        const n = Math.min(limite, faltam);
        if (!confirm(`Enviar ${n} questões para a OpenAI (${modelo})? O custo é cobrado na sua conta da OpenAI.`)) return;
        acao(
            { acao: "criar", instituicoes: instituicoes.split(","), limite },
            (r) => `Lote enviado com ${r.lote.total} questões. Volte aqui mais tarde e clique em "Atualizar".`
        );
    };
    const importar = (id: string) =>
        acao({ acao: "importar", id }, (r) =>
            `${r.importados} comentários gravados • ${r.revisar} para revisar • ${r.ignorados} já tinham • ${r.falhas} falhas`);

    return (
        <section className={cartao}>
            <h2 className="mb-1 text-lg font-bold text-foreground">Gerar em lote pela OpenAI (mais barato)</h2>
            <p className="mb-4 text-sm text-muted-foreground">
                Mesmo formato dos comentários do app, pela metade do preço. A OpenAI devolve em minutos ou em até 24 h;
                não precisa deixar a aba aberta. As que falharem são geradas na hora, quando o aluno abrir a questão.
            </p>

            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                <input
                    className={`${entrada} min-w-[220px] flex-1`}
                    value={instituicoes}
                    onChange={(e) => setInstituicoes(e.target.value)}
                    placeholder="Instituições, separadas por vírgula"
                />
                <button className={`${botao} border border-border`} onClick={() => carregar()} disabled={ocupado}>
                    Atualizar
                </button>
            </div>

            {resumo.length > 0 && (
                <div className="mb-3 text-sm text-muted-foreground">
                    {resumo.map((l) => (
                        <div key={l.instituicao}>
                            <span className="font-medium text-foreground">{l.instituicao}</span>: {l.com_comentario.toLocaleString("pt-BR")} de{" "}
                            {l.total.toLocaleString("pt-BR")} com comentário
                        </div>
                    ))}
                </div>
            )}

            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Enviar até</span>
                <select className={entrada} value={limite} onChange={(e) => setLimite(Number(e.target.value))} disabled={ocupado}>
                    {LIMITES.map((m) => <option key={m} value={m}>{m} questões</option>)}
                </select>
                <button
                    className={`${botao} bg-primary text-primary-foreground`}
                    onClick={enviar}
                    disabled={ocupado || faltam === 0 || temAberto}
                    title={temAberto ? "Já existe um lote na fila" : undefined}
                >
                    {faltam === 0 && resumo.length ? "Completo" : `Enviar lote${modelo ? ` (${modelo})` : ""}`}
                </button>
            </div>

            {mensagem && (
                <div className="mb-4 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-foreground">{mensagem}</div>
            )}

            {lotes && lotes.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                            <tr><th className="p-3">Enviado</th><th className="p-3">Instituições</th><th className="p-3">Questões</th><th className="p-3">Status</th><th className="p-3" /></tr>
                        </thead>
                        <tbody>
                            {lotes.map((l) => (
                                <tr key={l.id} className="border-t border-border align-top">
                                    <td className="p-3 whitespace-nowrap">{dataHora(l.created_at)}</td>
                                    <td className="p-3">{l.instituicoes.join(", ")}</td>
                                    <td className="p-3">
                                        {l.total}
                                        {l.status === "importado" && (
                                            <div className="text-xs text-muted-foreground">
                                                {l.importados} gravados • {l.ignorados} já tinham • {l.falhas} falhas
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-3">
                                        {NOME_STATUS[l.status] ?? l.status}
                                        {l.erro && <div className="text-xs text-red-600 dark:text-red-400">{l.erro}</div>}
                                    </td>
                                    <td className="p-3 text-right">
                                        {IMPORTAVEL.includes(l.status) && (
                                            <button className={`${botao} bg-primary text-primary-foreground`} disabled={ocupado} onClick={() => importar(l.id)}>
                                                Importar
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
