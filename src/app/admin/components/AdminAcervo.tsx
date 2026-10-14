"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminApi, botao, cartao, entrada } from "./adminApi";

type Questao = {
    id: string;
    origem_ref: string | null;
    instituicao: string | null;
    cargo: string | null;
    banca: string | null;
    disciplina: string | null;
    assunto: string | null;
    ano: number | null;
    modalidade: string | null;
    enunciado: string;
    alternativas: Record<string, string>;
    correta: string;
    oculta: boolean;
};

type Resposta = { itens: Questao[]; total: number; porPagina: number };

function LinhaQuestao({ q, aoMudar }: { q: Questao; aoMudar: () => void }) {
    const [aberta, setAberta] = useState(false);
    const [editando, setEditando] = useState(false);
    const [enunciado, setEnunciado] = useState(q.enunciado);
    const [alternativas, setAlternativas] = useState<Record<string, string>>(q.alternativas ?? {});
    const [correta, setCorreta] = useState(q.correta);
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState("");
    const certoErrado = /certo/i.test(q.modalidade ?? "");
    const manual = String(q.origem_ref ?? "").startsWith("MANUAL:");

    async function salvar(mudancas: Record<string, unknown>) {
        setOcupado(true);
        setErro("");
        try {
            await adminApi("/api/admin/questoes", { method: "PATCH", body: JSON.stringify({ id: q.id, ...mudancas }) });
            setEditando(false);
            aoMudar();
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setOcupado(false);
        }
    }

    async function apagar() {
        if (!confirm("Apagar esta questão definitivamente?")) return;
        setOcupado(true);
        try {
            await adminApi(`/api/admin/questoes?id=${q.id}`, { method: "DELETE" });
            aoMudar();
        } catch (e: any) {
            setErro(e.message);
            setOcupado(false);
        }
    }

    return (
        <div className={`${cartao} ${q.oculta ? "opacity-70" : ""}`}>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {q.oculta && <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold text-foreground">oculta</span>}
                {manual && <span className="rounded-full bg-primary/15 px-2 py-0.5 font-semibold text-primary">cadastrada no painel</span>}
                <span>{[q.disciplina, q.assunto, q.banca, q.instituicao, q.cargo, q.ano].filter(Boolean).join(" • ")}</span>
            </div>

            {editando ? (
                <div className="mt-3 flex flex-col gap-2">
                    <textarea className={`${entrada} h-40`} value={enunciado} onChange={(e) => setEnunciado(e.target.value)} />
                    {!certoErrado && Object.keys(alternativas).sort().map((l) => (
                        <div key={l} className="flex items-start gap-2">
                            <label className="flex items-center gap-1 pt-2 text-sm font-bold">
                                <input type="radio" name={`gab-${q.id}`} checked={correta === l} onChange={() => setCorreta(l)} /> {l}
                            </label>
                            <textarea
                                className={`${entrada} flex-1`}
                                rows={2}
                                value={alternativas[l]}
                                onChange={(e) => setAlternativas({ ...alternativas, [l]: e.target.value })}
                            />
                        </div>
                    ))}
                    {certoErrado && (
                        <div className="flex gap-4 text-sm">
                            {["C", "E"].map((g) => (
                                <label key={g} className="flex items-center gap-1">
                                    <input type="radio" name={`gab-${q.id}`} checked={correta === g} onChange={() => setCorreta(g)} />
                                    {g === "C" ? "Certo" : "Errado"}
                                </label>
                            ))}
                        </div>
                    )}
                    <div className="flex gap-2">
                        <button disabled={ocupado} className={`${botao} bg-primary text-primary-foreground`} onClick={() => salvar({ enunciado, alternativas, correta })}>Salvar</button>
                        <button disabled={ocupado} className={`${botao} bg-muted`} onClick={() => setEditando(false)}>Cancelar</button>
                    </div>
                </div>
            ) : (
                <>
                    <p className={`mt-2 whitespace-pre-line text-sm text-foreground ${aberta ? "" : "line-clamp-3"}`}>{q.enunciado}</p>
                    {aberta && (
                        <ul className="mt-2 text-sm">
                            {certoErrado ? (
                                <li className="font-bold text-green-700 dark:text-green-300">Gabarito: {q.correta === "C" ? "Certo" : "Errado"}</li>
                            ) : (
                                Object.entries(q.alternativas ?? {}).map(([l, t]) => (
                                    <li key={l} className={l === q.correta ? "font-bold text-green-700 dark:text-green-300" : ""}>{l}) {t}</li>
                                ))
                            )}
                        </ul>
                    )}
                </>
            )}

            {erro && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{erro}</p>}

            {!editando && (
                <div className="mt-3 flex flex-wrap gap-2">
                    <button className={`${botao} bg-muted`} onClick={() => setAberta((v) => !v)}>{aberta ? "Recolher" : "Ver alternativas"}</button>
                    <button className={`${botao} bg-muted`} onClick={() => { setEditando(true); setAberta(true); }}>Editar</button>
                    <button disabled={ocupado} className={`${botao} ${q.oculta ? "bg-green-600 text-white" : "bg-amber-500 text-white"}`} onClick={() => salvar({ oculta: !q.oculta })}>
                        {q.oculta ? "Mostrar aos alunos" : "Ocultar dos alunos"}
                    </button>
                    {manual && <button disabled={ocupado} className={`${botao} bg-red-600 text-white`} onClick={apagar}>Apagar</button>}
                    <span className="ml-auto self-center font-mono text-[10px] text-muted-foreground">{q.id}</span>
                </div>
            )}
        </div>
    );
}

export default function AdminAcervo() {
    const [busca, setBusca] = useState("");
    const [filtros, setFiltros] = useState({ busca: "", situacao: "todas" });
    const [pagina, setPagina] = useState(1);
    const [dados, setDados] = useState<Resposta | null>(null);
    const [erro, setErro] = useState("");
    const [versao, setVersao] = useState(0);

    useEffect(() => {
        setErro("");
        const qs = new URLSearchParams({ busca: filtros.busca, situacao: filtros.situacao, pagina: String(pagina) });
        adminApi<Resposta>(`/api/admin/questoes?${qs}`).then(setDados).catch((e) => setErro(e.message));
    }, [filtros, pagina, versao]);

    const paginas = dados ? Math.max(1, Math.ceil(dados.total / dados.porPagina)) : 1;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
                <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setPagina(1); setFiltros({ ...filtros, busca: busca.trim() }); }}>
                    <input
                        className={`${entrada} flex-1 min-w-[220px]`}
                        placeholder="Trecho do enunciado, id da questão ou VM3:GRAN:123"
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                    />
                    <button className={`${botao} bg-foreground text-background`}>Buscar</button>
                </form>
                <select
                    className={entrada}
                    value={filtros.situacao}
                    onChange={(e) => { setPagina(1); setFiltros({ ...filtros, situacao: e.target.value }); }}
                >
                    <option value="todas">Todas</option>
                    <option value="visiveis">Visíveis</option>
                    <option value="ocultas">Ocultas</option>
                </select>
                <Link href="/landing" className={`${botao} bg-primary text-primary-foreground`}>+ Cadastrar questões</Link>
            </div>

            <p className="text-xs text-muted-foreground">
                Questões importadas do VM3 são atualizadas quando o acervo é publicado de novo: para tirar uma do ar, use
                "Ocultar" (isso é mantido). Correções de texto nelas devem ser feitas também no banco do VM3.
            </p>

            {erro && <div className="text-red-600 dark:text-red-400">{erro}</div>}
            {!dados && !erro && <div className="animate-pulse text-muted-foreground">Carregando...</div>}
            {dados && (
                <>
                    <div className="text-sm text-muted-foreground">{dados.total.toLocaleString("pt-BR")} questões</div>
                    <div className="flex flex-col gap-3">
                        {dados.itens.map((q) => <LinhaQuestao key={`${q.id}-${versao}`} q={q} aoMudar={() => setVersao((v) => v + 1)} />)}
                    </div>
                    {paginas > 1 && (
                        <div className="flex items-center justify-end gap-2 text-sm">
                            <button className={`${botao} bg-muted`} disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</button>
                            <span>Página {pagina} de {paginas.toLocaleString("pt-BR")}</span>
                            <button className={`${botao} bg-muted`} disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>Próxima</button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
