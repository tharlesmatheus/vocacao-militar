"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Play, Timer, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { rotuloMeta, usePerfilAluno } from "@/lib/perfilAluno";
import { useAssinatura } from "@/lib/useAssinatura";
import { ChamadaAssinatura } from "@/components/app/ChamadaAssinatura";

type Par = { instituicao: string; cargo: string; total: number };
type Linha = {
    id: string;
    titulo: string;
    total: number;
    nota: number | null;
    nota_liquida: number | null;
    acertos: number | null;
    created_at: string;
    expira_em: string;
    finalizado_em: string | null;
};

const QUANTIDADES = [10, 20, 30, 40, 60];
const TIPOS = [
    { id: "", nome: "Misto" },
    { id: "MULTIPLA", nome: "Múltipla escolha" },
    { id: "CERTO_ERRADO", nome: "Certo ou errado (estilo Cebraspe)" },
];

const campo = "w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary";

export default function SimuladosPage() {
    const router = useRouter();
    const assinaturaAtiva = useAssinatura();
    const { perfil, carregando } = usePerfilAluno();

    const [pares, setPares] = useState<Par[]>([]);
    const [lista, setLista] = useState<Linha[] | null>(null);
    const [instituicao, setInstituicao] = useState("");
    const [cargo, setCargo] = useState("");
    const [tipo, setTipo] = useState("");
    const [quantidade, setQuantidade] = useState(20);
    const [minutos, setMinutos] = useState<number | null>(null);
    const [criando, setCriando] = useState(false);
    const [erro, setErro] = useState("");

    useEffect(() => {
        supabase.rpc("metas_disponiveis").then(({ data }) => setPares(((data ?? []) as Par[]).map((p) => ({ ...p, total: Number(p.total) }))));
        supabase
            .from("simulados")
            .select("id,titulo,total,nota,nota_liquida,acertos,created_at,expira_em,finalizado_em")
            .order("created_at", { ascending: false })
            .limit(30)
            .then(({ data, error }) => {
                if (error) setErro("Não foi possível carregar seus simulados agora. Atualize a página em instantes.");
                setLista((data ?? []) as Linha[]);
            });
    }, []);

    // Começa com a meta do aluno.
    useEffect(() => {
        if (!carregando && perfil?.meta_instituicao) {
            setInstituicao(perfil.meta_instituicao);
            setCargo(perfil.meta_cargo ?? "");
        }
    }, [carregando, perfil]);

    const instituicoes = useMemo(() => {
        const m = new Map<string, number>();
        for (const p of pares) m.set(p.instituicao, (m.get(p.instituicao) ?? 0) + p.total);
        return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([nome]) => nome);
    }, [pares]);
    const cargos = useMemo(() => pares.filter((p) => p.instituicao === instituicao), [pares, instituicao]);

    const minutosPadrao = Math.ceil(quantidade * (tipo === "CERTO_ERRADO" ? 1.5 : 3));
    const minutosFinal = minutos ?? minutosPadrao;

    async function comecar() {
        setCriando(true);
        setErro("");
        const { data, error } = await supabase.rpc("criar_simulado", {
            p_instituicao: instituicao || null,
            p_cargo: cargo || null,
            p_modalidade: tipo || null,
            p_quantidade: quantidade,
            p_duracao_min: minutosFinal,
        });
        if (error || !data) {
            setErro(error?.message || "Não foi possível montar o simulado.");
            setCriando(false);
            return;
        }
        router.push(`/simulados/${data}`);
    }

    const emAndamento = (lista ?? []).filter((s) => !s.finalizado_em);
    const feitos = (lista ?? []).filter((s) => s.finalizado_em);

    return (
        <div className="w-full">
            <div className="flex w-full flex-col gap-6">
                <header className="border-b border-border pb-5">
                    <h1 className="text-3xl font-extrabold text-foreground">Simulados</h1>
                    <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
                        Prova cronometrada, sem gabarito durante a prova. No fim você vê a nota, os erros por disciplina e
                        como foi em relação aos outros alunos que fizeram o mesmo tipo de simulado.
                    </p>
                </header>

                {assinaturaAtiva === false && (
                    <ChamadaAssinatura titulo="Assine para fazer simulados" />
                )}

                {emAndamento.length > 0 && (
                    <section className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
                        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">Em andamento</h2>
                        <ul className="flex flex-col gap-2">
                            {emAndamento.map((s) => (
                                <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-foreground">{s.titulo}</span>
                                    <Link href={`/simulados/${s.id}`} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                                        {new Date(s.expira_em) > new Date() ? "Continuar" : "Ver resultado"}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {assinaturaAtiva !== false && (
                    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
                        <h2 className="mb-4 flex items-center gap-2 font-titulo text-xl font-bold uppercase tracking-wide text-foreground">
                            <Timer className="h-5 w-5 text-primary" aria-hidden /> Novo simulado
                        </h2>
                        {perfil?.meta_instituicao && (
                            <p className="mb-4 text-sm text-muted-foreground">
                                Sugerido pela sua meta: <strong className="text-foreground">{rotuloMeta(perfil.meta_instituicao, perfil.meta_cargo)}</strong>
                            </p>
                        )}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="flex flex-col gap-1 text-sm">
                                <span className="text-muted-foreground">Instituição</span>
                                <select className={campo} value={instituicao} onChange={(e) => { setInstituicao(e.target.value); setCargo(""); }}>
                                    <option value="">Todas (simulado geral)</option>
                                    {instituicoes.map((i) => <option key={i} value={i}>{i}</option>)}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1 text-sm">
                                <span className="text-muted-foreground">Cargo</span>
                                <select className={campo} value={cargo} onChange={(e) => setCargo(e.target.value)} disabled={!instituicao}>
                                    <option value="">Todos os cargos</option>
                                    {cargos.map((c) => <option key={c.cargo} value={c.cargo}>{c.cargo} ({c.total})</option>)}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1 text-sm">
                                <span className="text-muted-foreground">Tipo de questão</span>
                                <select className={campo} value={tipo} onChange={(e) => { setTipo(e.target.value); setMinutos(null); }}>
                                    {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                                </select>
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="flex flex-col gap-1 text-sm">
                                    <span className="text-muted-foreground">Questões</span>
                                    <select className={campo} value={quantidade} onChange={(e) => { setQuantidade(Number(e.target.value)); setMinutos(null); }}>
                                        {QUANTIDADES.map((q) => <option key={q} value={q}>{q}</option>)}
                                    </select>
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    <span className="text-muted-foreground">Tempo (min)</span>
                                    <input
                                        type="number"
                                        min={5}
                                        max={360}
                                        className={campo}
                                        value={minutosFinal}
                                        onChange={(e) => setMinutos(Math.min(360, Math.max(5, Number(e.target.value) || 5)))}
                                    />
                                </label>
                            </div>
                        </div>
                        {cargo && (
                            <p className="mt-3 text-xs text-muted-foreground">Se o cargo não tiver questões suficientes, completamos com outras da mesma instituição.</p>
                        )}
                        {erro && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{erro}</p>}
                        <button
                            type="button"
                            onClick={comecar}
                            disabled={criando || assinaturaAtiva !== true}
                            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                        >
                            <Play className="h-4 w-4" aria-hidden /> {criando ? "Montando a prova…" : "Começar agora"}
                        </button>
                    </section>
                )}

                <section>
                    <h2 className="mb-3 flex items-center gap-2 font-titulo text-xl font-bold uppercase tracking-wide text-foreground">
                        <Trophy className="h-5 w-5 text-primary" aria-hidden /> Histórico
                    </h2>
                    {lista === null && <div className="animate-pulse text-sm text-muted-foreground">Carregando…</div>}
                    {lista && feitos.length === 0 && <p className="text-sm text-muted-foreground">Você ainda não fez nenhum simulado.</p>}
                    <ul className="flex flex-col gap-2">
                        {feitos.map((s) => (
                            <li key={s.id}>
                                <Link href={`/simulados/${s.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 transition hover:border-primary/60">
                                    <div className="min-w-0">
                                        <div className="truncate font-medium text-foreground">{s.titulo}</div>
                                        <div className="text-xs text-muted-foreground">{new Date(s.finalizado_em!).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</div>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <div className={`text-xl font-extrabold ${Number(s.nota) >= 70 ? "text-emerald-600 dark:text-emerald-400" : Number(s.nota) >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                                            {Number(s.nota ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                                        </div>
                                        <div className="text-xs text-muted-foreground">{s.acertos}/{s.total} acertos</div>
                                    </div>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </section>
            </div>
        </div>
    );
}
