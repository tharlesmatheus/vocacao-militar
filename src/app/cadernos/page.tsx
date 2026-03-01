// app/cadernos/page.tsx
// ✅ Página "Meus Cadernos" (Erros / Acertos) no estilo das imagens
// Requisitos:
// - Supabase Auth configurado (usuário logado)
// - Tabela: caderno_itens (user_id, questao_id, tipo, anotacao, created_at)
// - Tabela: questoes (id, disciplina, ...)
// Observação: este arquivo é CLIENT COMPONENT para poder ler auth e consultar supabase direto.

"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

/* ===================== Icons ===================== */
function BookIcon({ className = "" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
            <path
                d="M6 4h10a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2V6a2 2 0 0 1 2-2Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
            />
            <path
                d="M8 7h8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}

function XIcon({ className = "" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
            <path
                d="M15 9 9 15M9 9l6 6"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
            />
        </svg>
    );
}

function CheckIcon({ className = "" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
            <path
                d="M20 7 10 17l-4-4"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function ArrowRightIcon({ className = "" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
            <path
                d="M5 12h12"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
            />
            <path
                d="m13 6 6 6-6 6"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/* ===================== Types ===================== */
type CadernoTipo = "ERROS" | "ACERTOS";

type ResumoTipo = {
    tipo: CadernoTipo;
    disciplinas: number;
    questoes: number;
    anotadas: number;
};

type DisciplinaResumo = {
    tipo: CadernoTipo;
    disciplina: string;
    questoes: number;
    anotadas: number;
};

/* ===================== Helpers ===================== */
function pct(anotadas: number, questoes: number) {
    if (!questoes) return 0;
    return Math.round((anotadas / questoes) * 100);
}

/* ===================== Page ===================== */
export default function CadernosPage() {
    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState<string | null>(null);
    const [erro, setErro] = useState<string>("");

    // Dados agregados
    const [resumos, setResumos] = useState<Record<CadernoTipo, ResumoTipo>>({
        ERROS: { tipo: "ERROS", disciplinas: 0, questoes: 0, anotadas: 0 },
        ACERTOS: { tipo: "ACERTOS", disciplinas: 0, questoes: 0, anotadas: 0 },
    });

    // (Opcional) Top disciplinas para mostrar um preview (se quiser)
    const [topErros, setTopErros] = useState<DisciplinaResumo[]>([]);
    const [topAcertos, setTopAcertos] = useState<DisciplinaResumo[]>([]);

    useEffect(() => {
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
                // Puxamos os itens do caderno e juntamos com a questão para obter disciplina
                // Isso permite calcular:
                // - total por tipo
                // - disciplinas distintas por tipo
                // - anotadas por tipo
                const { data, error } = await supabase
                    .from("caderno_itens")
                    .select("tipo, anotacao, questao:questoes(disciplina)")
                    .eq("user_id", uid);

                if (error) throw error;

                const rows = (data ?? []) as any[];

                const byTipo: Record<CadernoTipo, { questoes: number; anotadas: number; disciplinasSet: Set<string> }> = {
                    ERROS: { questoes: 0, anotadas: 0, disciplinasSet: new Set() },
                    ACERTOS: { questoes: 0, anotadas: 0, disciplinasSet: new Set() },
                };

                const byTipoDisciplina: Record<CadernoTipo, Record<string, { questoes: number; anotadas: number }>> = {
                    ERROS: {},
                    ACERTOS: {},
                };

                for (const r of rows) {
                    const tipo = (r.tipo as CadernoTipo) || "ERROS";
                    const disciplina = (r?.questao?.disciplina as string) || "Sem disciplina";
                    const anotada = !!(r.anotacao && String(r.anotacao).trim().length > 0);

                    byTipo[tipo].questoes += 1;
                    if (anotada) byTipo[tipo].anotadas += 1;
                    byTipo[tipo].disciplinasSet.add(disciplina);

                    if (!byTipoDisciplina[tipo][disciplina]) {
                        byTipoDisciplina[tipo][disciplina] = { questoes: 0, anotadas: 0 };
                    }
                    byTipoDisciplina[tipo][disciplina].questoes += 1;
                    if (anotada) byTipoDisciplina[tipo][disciplina].anotadas += 1;
                }

                const nextResumos: Record<CadernoTipo, ResumoTipo> = {
                    ERROS: {
                        tipo: "ERROS",
                        questoes: byTipo.ERROS.questoes,
                        anotadas: byTipo.ERROS.anotadas,
                        disciplinas: byTipo.ERROS.disciplinasSet.size,
                    },
                    ACERTOS: {
                        tipo: "ACERTOS",
                        questoes: byTipo.ACERTOS.questoes,
                        anotadas: byTipo.ACERTOS.anotadas,
                        disciplinas: byTipo.ACERTOS.disciplinasSet.size,
                    },
                };

                // Top disciplinas (ordenado por mais questões)
                const buildTop = (tipo: CadernoTipo) =>
                    Object.entries(byTipoDisciplina[tipo])
                        .map(([disciplina, v]) => ({
                            tipo,
                            disciplina,
                            questoes: v.questoes,
                            anotadas: v.anotadas,
                        }))
                        .sort((a, b) => b.questoes - a.questoes)
                        .slice(0, 4);

                setResumos(nextResumos);
                setTopErros(buildTop("ERROS"));
                setTopAcertos(buildTop("ACERTOS"));
            } catch (e: any) {
                setErro(e?.message || "Erro ao carregar cadernos.");
            } finally {
                setLoading(false);
            }
        })();

        return () => {
            mounted = false;
        };
    }, []);

    const errosPct = useMemo(
        () => pct(resumos.ERROS.anotadas, resumos.ERROS.questoes),
        [resumos.ERROS.anotadas, resumos.ERROS.questoes]
    );
    const acertosPct = useMemo(
        () => pct(resumos.ACERTOS.anotadas, resumos.ACERTOS.questoes),
        [resumos.ACERTOS.anotadas, resumos.ACERTOS.questoes]
    );

    return (
        <div className="max-w-6xl mx-auto px-4 py-10">
            <div className="flex items-start gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <BookIcon className="w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-extrabold text-foreground">Meus Cadernos</h1>
                    <p className="text-sm text-muted-foreground">
                        Organize e revise suas questões de forma eficiente
                    </p>
                </div>
            </div>

            {!userId && !loading && (
                <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                    <p className="text-sm text-muted-foreground">
                        Você precisa estar logado para acessar seus cadernos.
                    </p>
                </div>
            )}

            {erro && (
                <div className="mb-6 text-sm text-red-600">{erro}</div>
            )}

            {/* ===================== CARDS PRINCIPAIS ===================== */}
            {userId && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* ERROS */}
                    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-red-500 flex items-center justify-center text-white">
                                <XIcon className="w-7 h-7" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-foreground">Erros</h2>
                                <p className="text-sm text-muted-foreground">Questões que você errou para revisar</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mt-5">
                            <div className="bg-muted rounded-xl p-4 text-center">
                                <div className="text-xl font-extrabold text-primary">{loading ? "—" : resumos.ERROS.disciplinas}</div>
                                <div className="text-xs text-muted-foreground mt-1">Disciplinas</div>
                            </div>
                            <div className="bg-muted rounded-xl p-4 text-center">
                                <div className="text-xl font-extrabold text-red-500">{loading ? "—" : resumos.ERROS.questoes}</div>
                                <div className="text-xs text-muted-foreground mt-1">Questões</div>
                            </div>
                            <div className="bg-muted rounded-xl p-4 text-center">
                                <div className="text-xl font-extrabold text-emerald-600">{loading ? "—" : resumos.ERROS.anotadas}</div>
                                <div className="text-xs text-muted-foreground mt-1">Anotadas</div>
                            </div>
                        </div>

                        <div className="mt-5">
                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                                <span>Progresso de anotações</span>
                                <span className="text-primary font-semibold">{loading ? "—" : `${errosPct}%`}</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-red-500 rounded-full transition-all"
                                    style={{ width: `${loading ? 0 : errosPct}%` }}
                                />
                            </div>
                        </div>

                        <div className="mt-6">
                            <Link
                                href="/cadernos/erros"
                                className="w-full inline-flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 rounded-xl transition"
                            >
                                Ver Disciplinas <ArrowRightIcon className="w-5 h-5" />
                            </Link>
                        </div>

                        {/* Preview opcional */}
                        {topErros.length > 0 && (
                            <div className="mt-6 pt-5 border-t border-border">
                                <div className="text-xs font-semibold text-muted-foreground mb-3">
                                    Principais disciplinas
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {topErros.map((d) => (
                                        <div key={d.disciplina} className="bg-muted rounded-xl p-3">
                                            <div className="text-sm font-semibold text-foreground">{d.disciplina}</div>
                                            <div className="text-xs text-muted-foreground mt-1">
                                                {d.questoes} questões • {d.anotadas} anotadas
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ACERTOS */}
                    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center text-white">
                                <CheckIcon className="w-7 h-7" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-foreground">Acertos</h2>
                                <p className="text-sm text-muted-foreground">Questões que você acertou para revisar</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mt-5">
                            <div className="bg-muted rounded-xl p-4 text-center">
                                <div className="text-xl font-extrabold text-primary">{loading ? "—" : resumos.ACERTOS.disciplinas}</div>
                                <div className="text-xs text-muted-foreground mt-1">Disciplinas</div>
                            </div>
                            <div className="bg-muted rounded-xl p-4 text-center">
                                <div className="text-xl font-extrabold text-emerald-600">{loading ? "—" : resumos.ACERTOS.questoes}</div>
                                <div className="text-xs text-muted-foreground mt-1">Questões</div>
                            </div>
                            <div className="bg-muted rounded-xl p-4 text-center">
                                <div className="text-xl font-extrabold text-emerald-600">{loading ? "—" : resumos.ACERTOS.anotadas}</div>
                                <div className="text-xs text-muted-foreground mt-1">Anotadas</div>
                            </div>
                        </div>

                        <div className="mt-5">
                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                                <span>Progresso de anotações</span>
                                <span className="text-primary font-semibold">{loading ? "—" : `${acertosPct}%`}</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-emerald-500 rounded-full transition-all"
                                    style={{ width: `${loading ? 0 : acertosPct}%` }}
                                />
                            </div>
                        </div>

                        <div className="mt-6">
                            <Link
                                href="/cadernos/acertos"
                                className="w-full inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 rounded-xl transition"
                            >
                                Ver Disciplinas <ArrowRightIcon className="w-5 h-5" />
                            </Link>
                        </div>

                        {/* Preview opcional */}
                        {topAcertos.length > 0 && (
                            <div className="mt-6 pt-5 border-t border-border">
                                <div className="text-xs font-semibold text-muted-foreground mb-3">
                                    Principais disciplinas
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {topAcertos.map((d) => (
                                        <div key={d.disciplina} className="bg-muted rounded-xl p-3">
                                            <div className="text-sm font-semibold text-foreground">{d.disciplina}</div>
                                            <div className="text-xs text-muted-foreground mt-1">
                                                {d.questoes} questões • {d.anotadas} anotadas
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}