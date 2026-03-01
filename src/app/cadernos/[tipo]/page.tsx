// app/cadernos/[tipo]/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type CadernoTipo = "ERROS" | "ACERTOS";
type ViewMode = "grid" | "list";

function BookBadge({ tipo }: { tipo: CadernoTipo }) {
    const isErros = tipo === "ERROS";
    return (
        <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white ${isErros ? "bg-red-500" : "bg-emerald-500"
                }`}
        >
            {isErros ? (
                <span className="text-xl font-extrabold">×</span>
            ) : (
                <span className="text-xl font-extrabold">✓</span>
            )}
        </div>
    );
}

function GridIcon({ active }: { active: boolean }) {
    return (
        <div
            className={`w-10 h-10 rounded-xl border flex items-center justify-center ${active ? "bg-white border-border" : "bg-muted border-border"
                }`}
            title="Grade"
        >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                <path
                    d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z"
                    stroke="currentColor"
                    strokeWidth="2"
                />
            </svg>
        </div>
    );
}

function ListIcon({ active }: { active: boolean }) {
    return (
        <div
            className={`w-10 h-10 rounded-xl border flex items-center justify-center ${active ? "bg-white border-border" : "bg-muted border-border"
                }`}
            title="Lista"
        >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                <path
                    d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                />
            </svg>
        </div>
    );
}

type DisciplinaRow = {
    disciplina: string;
    questoes: number;
    anotadas: number;
};

function pct(anotadas: number, questoes: number) {
    if (!questoes) return 0;
    return Math.round((anotadas / questoes) * 100);
}

export default function CadernosTipoPage() {
    const params = useParams<{ tipo: string }>();
    const router = useRouter();

    const tipoParam = (params?.tipo || "").toString().toLowerCase();
    const tipo: CadernoTipo | null =
        tipoParam === "erros" ? "ERROS" : tipoParam === "acertos" ? "ACERTOS" : null;

    const [mode, setMode] = useState<ViewMode>("grid");
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState("");
    const [userId, setUserId] = useState<string | null>(null);
    const [disciplinas, setDisciplinas] = useState<DisciplinaRow[]>([]);

    useEffect(() => {
        if (!tipo) return;
        let mounted = true;

        (async () => {
            setLoading(true);
            setErro("");

            const { data: auth, error: authErr } = await supabase.auth.getUser();
            const uid = auth?.user?.id ?? null;

            if (!mounted) return;

            if (authErr || !uid) {
                setUserId(null);
                setLoading(false);
                return;
            }

            setUserId(uid);

            try {
                const { data, error } = await supabase
                    .from("caderno_itens")
                    .select("tipo, anotacao, questao:questoes(disciplina)")
                    .eq("user_id", uid)
                    .eq("tipo", tipo);

                if (error) throw error;

                const rows = (data ?? []) as any[];

                const map = new Map<string, { questoes: number; anotadas: number }>();

                for (const r of rows) {
                    const disciplina = (r?.questao?.disciplina as string) || "Sem disciplina";
                    const anotada = !!(r.anotacao && String(r.anotacao).trim().length > 0);

                    const cur = map.get(disciplina) ?? { questoes: 0, anotadas: 0 };
                    cur.questoes += 1;
                    if (anotada) cur.anotadas += 1;
                    map.set(disciplina, cur);
                }

                const list: DisciplinaRow[] = Array.from(map.entries())
                    .map(([disciplina, v]) => ({
                        disciplina,
                        questoes: v.questoes,
                        anotadas: v.anotadas,
                    }))
                    .sort((a, b) => b.questoes - a.questoes);

                setDisciplinas(list);
            } catch (e: any) {
                setErro(e?.message || "Erro ao carregar disciplinas.");
            } finally {
                setLoading(false);
            }
        })();

        return () => {
            mounted = false;
        };
    }, [tipo]);

    const titulo = tipo === "ERROS" ? "Erros" : "Acertos";

    const totalDisciplinas = disciplinas.length;

    if (!tipo) {
        return (
            <div className="max-w-6xl mx-auto px-4 py-10">
                <div className="bg-card border border-border rounded-2xl p-6">
                    <div className="text-sm text-muted-foreground">
                        Tipo inválido. Use <b>/cadernos/erros</b> ou <b>/cadernos/acertos</b>.
                    </div>
                    <button
                        className="mt-4 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold"
                        onClick={() => router.push("/cadernos")}
                    >
                        Voltar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto px-4 py-10">
            <div className="flex items-start justify-between gap-4 mb-8">
                <div className="flex items-start gap-3">
                    <BookBadge tipo={tipo} />
                    <div>
                        <h1 className="text-2xl font-extrabold text-foreground">{titulo}</h1>
                        <p className="text-sm text-muted-foreground">
                            {loading ? "Carregando..." : `${totalDisciplinas} disciplinas encontradas`}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 bg-muted rounded-2xl p-2 border border-border">
                    <button onClick={() => setMode("grid")} className="outline-none">
                        <GridIcon active={mode === "grid"} />
                    </button>
                    <button onClick={() => setMode("list")} className="outline-none">
                        <ListIcon active={mode === "list"} />
                    </button>
                </div>
            </div>

            {!userId && !loading && (
                <div className="bg-card border border-border rounded-2xl p-6">
                    <p className="text-sm text-muted-foreground">
                        Você precisa estar logado para acessar seus cadernos.
                    </p>
                </div>
            )}

            {erro && <div className="mb-6 text-sm text-red-600">{erro}</div>}

            {/* GRID */}
            {userId && mode === "grid" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {loading ? (
                        Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="bg-card border border-border rounded-2xl p-6 animate-pulse">
                                <div className="w-12 h-12 rounded-2xl bg-muted mb-6" />
                                <div className="h-4 bg-muted rounded w-2/3 mb-3" />
                                <div className="h-3 bg-muted rounded w-1/2 mb-6" />
                                <div className="h-3 bg-muted rounded w-full" />
                            </div>
                        ))
                    ) : disciplinas.length === 0 ? (
                        <div className="col-span-full bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
                            Nenhuma disciplina encontrada.
                        </div>
                    ) : (
                        disciplinas.map((d) => {
                            const href = `/cadernos/${tipoParam}/${encodeURIComponent(d.disciplina)}`;
                            const progress = pct(d.anotadas, d.questoes);

                            return (
                                <Link
                                    key={d.disciplina}
                                    href={href}
                                    className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition block"
                                >
                                    <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-600 flex items-center justify-center mb-6">
                                        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
                                            <path
                                                d="M6 4h10a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2V6a2 2 0 0 1 2-2Z"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                            />
                                        </svg>
                                    </div>

                                    <div className="text-base font-bold text-foreground">{d.disciplina}</div>

                                    <div className="grid grid-cols-2 gap-3 mt-5">
                                        <div>
                                            <div className="text-lg font-extrabold text-primary">{d.questoes}</div>
                                            <div className="text-xs text-muted-foreground">Questões</div>
                                        </div>
                                        <div>
                                            <div className="text-lg font-extrabold text-emerald-600">{d.anotadas}</div>
                                            <div className="text-xs text-muted-foreground">Anotadas</div>
                                        </div>
                                    </div>

                                    <div className="mt-5">
                                        <div className="flex justify-between text-xs text-muted-foreground mb-2">
                                            <span>Progresso</span>
                                            <span className="text-primary font-semibold">{progress}%</span>
                                        </div>
                                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${tipo === "ERROS" ? "bg-red-500" : "bg-emerald-500"
                                                    }`}
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                    </div>
                                </Link>
                            );
                        })
                    )}
                </div>
            )}

            {/* LISTA */}
            {userId && mode === "list" && (
                <div className="flex flex-col gap-4">
                    {loading ? (
                        Array.from({ length: 6 }).map((_, i) => (
                            <div
                                key={i}
                                className="bg-card border border-border rounded-2xl p-6 animate-pulse"
                            >
                                <div className="h-4 bg-muted rounded w-1/3 mb-3" />
                                <div className="h-3 bg-muted rounded w-1/4" />
                            </div>
                        ))
                    ) : disciplinas.length === 0 ? (
                        <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
                            Nenhuma disciplina encontrada.
                        </div>
                    ) : (
                        disciplinas.map((d) => {
                            const href = `/cadernos/${tipoParam}/${encodeURIComponent(d.disciplina)}`;
                            return (
                                <Link
                                    key={d.disciplina}
                                    href={href}
                                    className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-4">
                                        <div
                                            className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white ${tipo === "ERROS" ? "bg-red-500" : "bg-emerald-500"
                                                }`}
                                        >
                                            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
                                                <path
                                                    d="M6 4h10a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2V6a2 2 0 0 1 2-2Z"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                />
                                            </svg>
                                        </div>

                                        <div>
                                            <div className="text-base font-bold text-foreground">{d.disciplina}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {pct(d.anotadas, d.questoes)}% anotadas
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-8">
                                        <div className="text-right">
                                            <div className="text-lg font-extrabold text-primary">{d.questoes}</div>
                                            <div className="text-xs text-muted-foreground">Questões</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-lg font-extrabold text-emerald-600">{d.anotadas}</div>
                                            <div className="text-xs text-muted-foreground">Anotadas</div>
                                        </div>

                                        <div className="text-muted-foreground">
                                            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
                                                <path
                                                    d="M9 18l6-6-6-6"
                                                    stroke="currentColor"
                                                    strokeWidth="2.5"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                />
                                            </svg>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}