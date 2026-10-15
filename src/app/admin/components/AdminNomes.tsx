"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminApi, botao, cartao, dataHora, entrada } from "./adminApi";

/*
 * Admin > Nomes. Cada linha é um nome como veio da fonte (Gran) e o nome
 * oficial que o aluno vê nos filtros. As regras do publicador do VM3
 * preenchem sozinhas; o que elas não reconhecem aparece em "Para revisar".
 * Uma decisão salva aqui vale para sempre (o VM3 não desfaz) e já atualiza
 * as questões do acervo.
 */

type Item = {
    id: string;
    tipo: "cargo" | "instituicao";
    contexto: string;
    nome_fonte: string;
    nome_oficial: string;
    area: string | null;
    instituicao_oficial: string | null;
    situacao: "pendente" | "regra" | "confirmado";
    motivo: string | null;
    atualizado_em: string;
    questoes: number;
};

type Resposta = {
    itens: Item[];
    pendentes: number;
    oficiais: { cargo: string[]; instituicao: string[] };
};

const FORA = "Fora do escopo";
const POR_PAGINA = 60;

const ABAS = [
    { id: "pendente", rotulo: "Para revisar" },
    { id: "cargo", rotulo: "Cargos" },
    { id: "instituicao", rotulo: "Instituições" },
] as const;
type Aba = (typeof ABAS)[number]["id"];

const SELO: Record<Item["situacao"], { texto: string; classe: string }> = {
    pendente: { texto: "Para revisar", classe: "bg-amber-100 text-amber-800" },
    regra: { texto: "Regra automática", classe: "bg-[#eef2fb] text-[#526b88]" },
    confirmado: { texto: "Decidido por você", classe: "bg-green-100 text-green-800" },
};

function Linha({ item, aoSalvar }: { item: Item; aoSalvar: () => void }) {
    const [nome, setNome] = useState(item.nome_oficial);
    const [area, setArea] = useState(item.area ?? "");
    const [todas, setTodas] = useState(false);
    const [ocupado, setOcupado] = useState(false);
    const [msg, setMsg] = useState("");

    useEffect(() => {
        setNome(item.nome_oficial);
        setArea(item.area ?? "");
    }, [item.nome_oficial, item.area]);

    const mudou = nome.trim() !== item.nome_oficial || (item.tipo === "cargo" && area.trim() !== (item.area ?? ""));
    const listaId = `oficiais-${item.tipo}`;

    async function salvar(nomeFinal = nome) {
        setOcupado(true);
        setMsg("");
        try {
            const r = await adminApi<{ questoes: number; nomes: number }>("/api/admin/nomes", {
                method: "PATCH",
                body: JSON.stringify({ id: item.id, nome_oficial: nomeFinal.trim(), area: area.trim(), todas }),
            });
            setMsg(`Salvo: ${r.questoes.toLocaleString("pt-BR")} questão(ões) atualizada(s)${r.nomes > 1 ? ` em ${r.nomes} instituições` : ""}.`);
            aoSalvar();
        } catch (e: any) {
            setMsg(e.message);
        } finally {
            setOcupado(false);
        }
    }

    const selo = SELO[item.situacao];

    return (
        <div className={`${cartao} !p-4`}>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-semibold ${selo.classe}`}>{selo.texto}</span>
                <span className="font-semibold text-[#232939]">{item.questoes.toLocaleString("pt-BR")} questões</span>
                {item.tipo === "cargo" && item.contexto && <span className="text-[#526b88]">Prova de: {item.contexto}</span>}
                {item.instituicao_oficial && <span className="text-[#526b88]">→ vai para {item.instituicao_oficial}</span>}
                <span className="text-[#8a96b0]">{dataHora(item.atualizado_em)}</span>
            </div>

            <p className="mb-1 text-xs uppercase tracking-wide text-[#8a96b0]">Como veio da fonte</p>
            <p className="mb-3 text-sm font-semibold text-[#232939]">{item.nome_fonte}</p>
            {item.motivo && <p className="-mt-2 mb-3 text-xs text-[#526b88]">{item.motivo}</p>}

            <div className={`grid gap-3 ${item.tipo === "cargo" ? "md:grid-cols-[1fr_1fr_auto]" : "md:grid-cols-[1fr_auto]"}`}>
                <label className="flex flex-col gap-1 text-xs font-semibold text-[#526b88]">
                    Nome oficial
                    <input className={entrada} list={listaId} value={nome} maxLength={200} onChange={(e) => setNome(e.target.value)} />
                </label>
                {item.tipo === "cargo" && (
                    <label className="flex flex-col gap-1 text-xs font-semibold text-[#526b88]">
                        Área / especialidade (opcional)
                        <input className={entrada} value={area} maxLength={200} onChange={(e) => setArea(e.target.value)} placeholder="Ex.: Psiquiatria" />
                    </label>
                )}
                <div className="flex items-end gap-2">
                    <button
                        className={`${botao} bg-primary text-primary-foreground`}
                        disabled={ocupado || !nome.trim() || (!mudou && item.situacao === "confirmado")}
                        onClick={() => salvar()}
                    >
                        {mudou ? "Salvar" : "Confirmar"}
                    </button>
                    {nome !== FORA && (
                        <button className={`${botao} bg-muted`} disabled={ocupado} title="Esconde estas questões dos alunos" onClick={() => salvar(FORA)}>
                            Fora do escopo
                        </button>
                    )}
                </div>
            </div>

            {item.tipo === "cargo" && (
                <label className="mt-3 flex items-center gap-2 text-xs text-[#526b88]">
                    <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} />
                    Aplicar a todas as instituições onde aparece &quot;{item.nome_fonte}&quot;
                </label>
            )}
            {nome === FORA && <p className="mt-2 text-xs text-amber-700">Fora do escopo: as questões ficam ocultas para os alunos.</p>}
            {msg && <p className="mt-2 text-xs text-[#232939]">{msg}</p>}

        </div>
    );
}

export default function AdminNomes() {
    const [aba, setAba] = useState<Aba>("pendente");
    const [busca, setBusca] = useState("");
    const [termo, setTermo] = useState("");
    const [dados, setDados] = useState<Resposta | null>(null);
    const [erro, setErro] = useState("");
    const [pagina, setPagina] = useState(1);

    const carregar = useCallback(() => {
        const p = new URLSearchParams();
        if (aba === "pendente") p.set("situacao", "pendente");
        else p.set("tipo", aba);
        if (termo) p.set("busca", termo);
        setErro("");
        adminApi<Resposta>(`/api/admin/nomes?${p}`).then(setDados).catch((e) => setErro(e.message));
    }, [aba, termo]);

    useEffect(() => {
        setDados(null);
        setPagina(1);
        carregar();
    }, [carregar]);

    // Busca só depois de parar de digitar.
    useEffect(() => {
        const t = setTimeout(() => setTermo(busca.trim()), 350);
        return () => clearTimeout(t);
    }, [busca]);

    const itens = dados?.itens ?? [];
    const totalPaginas = Math.max(1, Math.ceil(itens.length / POR_PAGINA));
    const visiveis = useMemo(() => itens.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA), [itens, pagina]);
    const resumo = useMemo(() => {
        const oficiais = new Set(itens.filter((i) => i.nome_oficial !== FORA).map((i) => i.nome_oficial));
        return { nomes: itens.length, oficiais: oficiais.size };
    }, [itens]);

    return (
        <div className="flex flex-col gap-5">
            <p className="max-w-3xl text-sm text-[#526b88]">
                A fonte escreve o mesmo cargo de vários jeitos. Aqui cada nome da fonte aponta para o nome oficial que o aluno vê nos
                filtros. As regras do publicador preenchem sozinhas; você só precisa olhar <b>Para revisar</b> depois de subir questões
                novas. O que você salvar vale para sempre e já atualiza as questões.
            </p>

            <div className="flex flex-wrap items-center gap-2">
                {ABAS.map((a) => (
                    <button
                        key={a.id}
                        className={`${botao} ${aba === a.id ? "bg-primary text-primary-foreground" : "bg-white text-[#232939] border border-[#d6dcec]"}`}
                        onClick={() => setAba(a.id)}
                    >
                        {a.rotulo}
                        {a.id === "pendente" && dados ? ` (${dados.pendentes})` : ""}
                    </button>
                ))}
                <input
                    className={`${entrada} ml-auto w-full sm:w-72`}
                    placeholder="Buscar nome da fonte ou oficial"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                />
            </div>

            {erro && <div className="text-sm text-red-600">{erro}</div>}
            {!dados && !erro && <div className="animate-pulse text-muted-foreground">Carregando nomes...</div>}

            {dados && (
                <>
                    <p className="text-xs text-[#526b88]">
                        {resumo.nomes.toLocaleString("pt-BR")} nome(s) da fonte
                        {aba !== "pendente" && ` → ${resumo.oficiais.toLocaleString("pt-BR")} nome(s) oficial(is)`}
                    </p>
                    {itens.length === 0 && (
                        <div className={cartao}>
                            <p className="text-sm text-[#232939]">
                                {aba === "pendente" ? "Nada para revisar. Todos os nomes foram reconhecidos." : "Nenhum nome encontrado."}
                            </p>
                        </div>
                    )}
                    <div className="flex flex-col gap-3">
                        {visiveis.map((i) => (
                            <Linha key={i.id} item={i} aoSalvar={carregar} />
                        ))}
                    </div>
                    {/* Sugestões do campo "Nome oficial" (uma lista por tipo) */}
                    <datalist id="oficiais-cargo">{dados.oficiais.cargo.map((o) => <option key={o} value={o} />)}</datalist>
                    <datalist id="oficiais-instituicao">{dados.oficiais.instituicao.map((o) => <option key={o} value={o} />)}</datalist>
                    {totalPaginas > 1 && (
                        <div className="flex items-center justify-center gap-3 text-sm">
                            <button className={`${botao} bg-muted`} disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
                            <span className="text-[#526b88]">Página {pagina} de {totalPaginas}</span>
                            <button className={`${botao} bg-muted`} disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>Próxima</button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
