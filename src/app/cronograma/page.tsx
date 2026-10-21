"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Check, CircleDot, Pencil, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { CabecalhoPagina, Pagina, Painel, Vazio } from "@/components/app/Pagina";
import {
    adicionar,
    concluir,
    definirAtual,
    lerCiclo,
    linkEstudar,
    montarPeloEdital,
    mover,
    ordemAPartirDaAtual,
    remover,
    type Ciclo,
} from "@/lib/cicloEstudo";

/*
 * Cronograma = ciclo de estudos. Uma fila de disciplinas sem data: a da vez fica
 * no topo com "Estudar" (abre Questões filtradas) e "Concluir" (passa para a
 * próxima). Depois da última volta para a primeira e conta uma volta.
 * Montado pelo edital (ordem do que mais cai no cargo) e ajustável à mão.
 * Fica em cronograma.blocos (formato version 5, ver lib/cicloEstudo.ts).
 */

type Edital = { id: string; instituicao: string; cargo: string };
type DadosEdital = { assuntos: { disciplina: string; n_cargo: number }[] };

const botao = "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50";

export default function CronogramaPage() {
    const [userId, setUserId] = useState<string | null>(null);
    const [linhaId, setLinhaId] = useState<string | null>(null);
    const [ciclo, setCiclo] = useState<Ciclo | null>(null);
    const [editais, setEditais] = useState<Edital[]>([]);
    const [editando, setEditando] = useState(false);
    const [montando, setMontando] = useState(false);
    const [editalEscolhido, setEditalEscolhido] = useState("");
    const [novaMateria, setNovaMateria] = useState("");
    const [opcoesMateria, setOpcoesMateria] = useState<string[]>([]);
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState("");

    // Carrega o ciclo (cria a linha se ainda não existir) e os editais do aluno.
    useEffect(() => {
        (async () => {
            const { data: auth } = await supabase.auth.getUser();
            const uid = auth.user?.id;
            if (!uid) return;
            setUserId(uid);
            const [crono, eds] = await Promise.all([
                supabase.from("cronograma").select("id,blocos").eq("user_id", uid).maybeSingle(),
                supabase.from("editais_alvo").select("id,instituicao,cargo").order("created_at"),
            ]);
            if (crono.error) {
                setErro("Não foi possível carregar o cronograma.");
                return;
            }
            setEditais((eds.data ?? []) as Edital[]);
            setEditalEscolhido(((eds.data ?? []) as Edital[])[0]?.id ?? "");
            if (crono.data) {
                setLinhaId(crono.data.id as string);
                setCiclo(lerCiclo(crono.data.blocos));
            } else {
                const vazio = lerCiclo(null);
                const { data: criado, error } = await supabase
                    .from("cronograma")
                    .insert({ user_id: uid, blocos: vazio })
                    .select("id")
                    .single();
                if (error || !criado) {
                    setErro("Não foi possível criar o cronograma.");
                    return;
                }
                setLinhaId(criado.id as string);
                setCiclo(vazio);
            }
        })();
    }, []);

    const salvar = useCallback(
        async (novo: Ciclo) => {
            const anterior = ciclo;
            setCiclo(novo);
            if (!linhaId || !userId) return;
            const { error } = await supabase
                .from("cronograma")
                .update({ blocos: novo, atualizado_em: new Date().toISOString() })
                .eq("id", linhaId)
                .eq("user_id", userId);
            if (error) {
                setCiclo(anterior);
                setErro("Não foi possível salvar. Tente de novo.");
            } else {
                setErro("");
            }
        },
        [ciclo, linhaId, userId]
    );

    // Disciplinas do edital do ciclo: sugestões para "Adicionar matéria".
    const editalDoCiclo = useMemo(
        () => editais.find((e) => e.instituicao === ciclo?.instituicao && e.cargo === ciclo?.cargo) ?? null,
        [editais, ciclo?.instituicao, ciclo?.cargo]
    );
    useEffect(() => {
        if (!editando || !editalDoCiclo) return;
        supabase.rpc("edital_progresso", { p_edital: editalDoCiclo.id }).then(({ data }) => {
            const nomes = [...new Set(((data as DadosEdital | null)?.assuntos ?? []).map((a) => a.disciplina))];
            setOpcoesMateria(nomes.sort((a, b) => a.localeCompare(b, "pt-BR")));
        });
    }, [editando, editalDoCiclo]);

    async function montar() {
        const ed = editais.find((e) => e.id === editalEscolhido);
        if (!ed) return;
        if (ciclo?.materias.length && !confirm("Remontar o ciclo pelo edital? A ordem atual e as voltas são zeradas.")) return;
        setOcupado(true);
        const { data, error } = await supabase.rpc("edital_progresso", { p_edital: ed.id });
        setOcupado(false);
        if (error || !data) {
            setErro("Não foi possível ler as disciplinas desse edital.");
            return;
        }
        const pesos: Record<string, number> = {};
        for (const a of (data as DadosEdital).assuntos) pesos[a.disciplina] = (pesos[a.disciplina] ?? 0) + a.n_cargo;
        await salvar(montarPeloEdital(ed.instituicao, ed.cargo, pesos));
        setMontando(false);
        setEditando(false);
    }

    if (!ciclo) {
        return (
            <Pagina>
                <CabecalhoPagina titulo="Ciclo de estudos" />
                {erro ? <Vazio titulo={erro} /> : <div className="animate-pulse py-10 text-center text-muted-foreground">Carregando…</div>}
            </Pagina>
        );
    }

    const vazio = ciclo.materias.length === 0;
    const fila = ordemAPartirDaAtual(ciclo);
    const proxima = fila[1]?.materia;

    const blocoMontar = (
        <Painel titulo={vazio ? "Montar o ciclo" : "Remontar pelo edital"} descricao="As disciplinas entram na ordem do que mais cai no cargo. Depois você ajusta.">
            {editais.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    Primeiro adicione um edital em{" "}
                    <Link href="/edital" className="font-semibold text-primary underline">
                        Meu edital
                    </Link>
                    .
                </p>
            ) : (
                <div className="flex flex-col gap-3 sm:flex-row">
                    <select
                        value={editalEscolhido}
                        onChange={(e) => setEditalEscolhido(e.target.value)}
                        className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-base text-foreground outline-none focus:ring-2 focus:ring-primary sm:flex-1"
                        aria-label="Edital"
                    >
                        {editais.map((e) => (
                            <option key={e.id} value={e.id}>
                                {e.instituicao} · {e.cargo}
                            </option>
                        ))}
                    </select>
                    <button type="button" onClick={() => void montar()} disabled={ocupado || !editalEscolhido} className={`${botao} bg-primary text-primary-foreground`}>
                        {ocupado ? "Montando…" : "Montar pelo edital"}
                    </button>
                </div>
            )}
        </Painel>
    );

    return (
        <Pagina>
            <CabecalhoPagina
                titulo="Ciclo de estudos"
                descricao="Estude a matéria da vez e conclua para passar à próxima. Sem dia marcado: se parar, continua de onde estava."
                acoes={
                    !vazio ? (
                        <button
                            type="button"
                            onClick={() => setEditando((v) => !v)}
                            className={`${botao} border border-border bg-card text-foreground hover:bg-muted`}
                        >
                            {editando ? <Check className="h-4 w-4" aria-hidden /> : <Pencil className="h-4 w-4" aria-hidden />}
                            {editando ? "Pronto" : "Editar ciclo"}
                        </button>
                    ) : undefined
                }
            />

            {erro && (
                <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                    {erro}
                </div>
            )}

            {vazio && blocoMontar}

            {!vazio && !editando && (
                <>
                    <ol className="flex flex-col gap-2">
                        {fila.map(({ materia, indice }, k) =>
                            k === 0 ? (
                                <li key={indice} className="rounded-xl border-2 border-primary bg-primary/10 p-4 shadow-sm">
                                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                                        <CircleDot className="h-4 w-4" aria-hidden /> Matéria da vez · volta {ciclo.voltas + 1}
                                    </div>
                                    <div className="mt-1 break-words text-xl font-extrabold text-foreground">{materia}</div>
                                    <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
                                        <Link href={linkEstudar(ciclo, materia)} className={`${botao} bg-primary py-3 text-primary-foreground sm:py-2`}>
                                            <Play className="h-4 w-4" aria-hidden /> Estudar
                                        </Link>
                                        <button
                                            type="button"
                                            onClick={() => void salvar(concluir(ciclo))}
                                            className={`${botao} border border-border bg-card py-3 text-foreground hover:bg-muted sm:py-2`}
                                        >
                                            <Check className="h-4 w-4" aria-hidden /> Concluir
                                        </button>
                                    </div>
                                    {proxima && <div className="mt-2 text-xs text-muted-foreground">Próxima: {proxima}</div>}
                                </li>
                            ) : (
                                <li key={indice} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
                                    <span className="w-6 shrink-0 text-right text-sm font-bold text-muted-foreground">{k + 1}</span>
                                    <span className="min-w-0 break-words text-foreground">{materia}</span>
                                    {indice < ciclo.atual && <span className="ml-auto shrink-0 text-xs text-muted-foreground">próxima volta</span>}
                                </li>
                            )
                        )}
                    </ol>
                    <div className="text-sm text-muted-foreground">
                        Voltas completas: <strong className="text-foreground">{ciclo.voltas}</strong>
                        {ciclo.instituicao && (
                            <>
                                {" "}
                                · Questões de {ciclo.instituicao} · {ciclo.cargo}
                            </>
                        )}
                    </div>
                </>
            )}

            {!vazio && editando && (
                <>
                    <ol className="flex flex-col gap-2">
                        {ciclo.materias.map((materia, i) => (
                            <li
                                key={`${materia}-${i}`}
                                className={`flex flex-col gap-2 rounded-lg border px-4 py-3 sm:flex-row sm:items-center ${
                                    i === ciclo.atual ? "border-primary bg-primary/5" : "border-border bg-card"
                                }`}
                            >
                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                    <span className="w-6 shrink-0 text-right text-sm font-bold text-muted-foreground">{i + 1}</span>
                                    <span className="min-w-0 break-words text-foreground">{materia}</span>
                                    {i === ciclo.atual && <span className="shrink-0 text-xs font-semibold text-primary">da vez</span>}
                                </div>
                                <div className="flex flex-wrap gap-1.5 pl-9 sm:pl-0">
                                    <button type="button" aria-label={`Subir ${materia}`} onClick={() => void salvar(mover(ciclo, i, -1))} disabled={i === 0}
                                        className="rounded-md border border-border p-2 hover:bg-muted disabled:opacity-40">
                                        <ArrowUp className="h-4 w-4" aria-hidden />
                                    </button>
                                    <button type="button" aria-label={`Descer ${materia}`} onClick={() => void salvar(mover(ciclo, i, 1))} disabled={i === ciclo.materias.length - 1}
                                        className="rounded-md border border-border p-2 hover:bg-muted disabled:opacity-40">
                                        <ArrowDown className="h-4 w-4" aria-hidden />
                                    </button>
                                    {i !== ciclo.atual && (
                                        <button type="button" onClick={() => void salvar(definirAtual(ciclo, i))}
                                            className="rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted">
                                            Tornar a da vez
                                        </button>
                                    )}
                                    <button type="button" aria-label={`Remover ${materia}`} onClick={() => void salvar(remover(ciclo, i))}
                                        className="rounded-md border border-border p-2 text-red-600 hover:bg-red-500/10 dark:text-red-400">
                                        <Trash2 className="h-4 w-4" aria-hidden />
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ol>

                    <Painel titulo="Adicionar matéria" descricao="Pode repetir uma matéria no ciclo (ex.: Português duas vezes).">
                        <form
                            className="flex flex-col gap-2 sm:flex-row"
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (!novaMateria.trim()) return;
                                void salvar(adicionar(ciclo, novaMateria));
                                setNovaMateria("");
                            }}
                        >
                            <input
                                list="materias-edital"
                                value={novaMateria}
                                onChange={(e) => setNovaMateria(e.target.value)}
                                placeholder="Nome da disciplina"
                                className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-base text-foreground outline-none focus:ring-2 focus:ring-primary sm:flex-1"
                            />
                            <datalist id="materias-edital">
                                {opcoesMateria.map((m) => (
                                    <option key={m} value={m} />
                                ))}
                            </datalist>
                            <button type="submit" className={`${botao} bg-primary text-primary-foreground`}>
                                <Plus className="h-4 w-4" aria-hidden /> Adicionar
                            </button>
                        </form>
                    </Painel>

                    {montando ? (
                        blocoMontar
                    ) : (
                        <button type="button" onClick={() => setMontando(true)} className={`${botao} self-start border border-border bg-card text-foreground hover:bg-muted`}>
                            <RefreshCw className="h-4 w-4" aria-hidden /> Remontar pelo edital
                        </button>
                    )}
                </>
            )}
        </Pagina>
    );
}
