// app/cadernos/[tipo]/[disciplina]/[assunto]/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { QuestionCard } from "@/components/QuestionCard"; // ajuste se necessário
import { Pagination } from "@/components/Pagination";     // ajuste se necessário

type CadernoTipo = "ERROS" | "ACERTOS";

type Questao = {
    id: string;
    instituicao: string;
    cargo: string;
    disciplina: string;
    assunto: string;
    modalidade: string;
    banca: string;
    enunciado: string;
    alternativas: { [key: string]: string };
    correta: string;
    explicacao: string;
    comentarios?: any[];
    erros?: any[];
    created_at?: string;
};

type ItemCaderno = {
    id: string;
    questao_id: string;
    tipo: CadernoTipo;
    anotacao: string | null;
    created_at?: string;
    // ✅ Supabase frequentemente retorna como array em join "questao:questoes(...)"
    questao: Questao[];
};

function ArrowLeftIcon() {
    return (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
            <path d="M19 12H7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <path
                d="m11 6-6 6 6 6"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function BadgeTipo({ tipo }: { tipo: CadernoTipo }) {
    const isErros = tipo === "ERROS";
    return (
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white ${isErros ? "bg-red-500" : "bg-emerald-500"}`}>
            <span className="text-xl font-extrabold">{isErros ? "×" : "✓"}</span>
        </div>
    );
}

function safeDecode(v: string) {
    try {
        return decodeURIComponent(v);
    } catch {
        return v;
    }
}

export default function CadernosQuestoesPage() {
    const params = useParams<{ tipo: string; disciplina: string; assunto: string }>();
    const router = useRouter();

    const tipoParam = (params?.tipo || "").toString().toLowerCase();
    const tipo: CadernoTipo | null =
        tipoParam === "erros" ? "ERROS" : tipoParam === "acertos" ? "ACERTOS" : null;

    const disciplina = useMemo(() => safeDecode((params?.disciplina || "").toString()), [params?.disciplina]);
    const assunto = useMemo(() => safeDecode((params?.assunto || "").toString()), [params?.assunto]);

    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState("");
    const [userId, setUserId] = useState<string | null>(null);

    const [itens, setItens] = useState<ItemCaderno[]>([]);

    // paginação
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(3);

    const paginated = useMemo(() => {
        const start = (page - 1) * perPage;
        const end = start + perPage;
        return itens.slice(start, end);
    }, [itens, page, perPage]);

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
                    .select(
                        `
            id,
            questao_id,
            tipo,
            anotacao,
            created_at,
            questao:questoes (
              id,
              instituicao,
              cargo,
              disciplina,
              assunto,
              modalidade,
              banca,
              enunciado,
              alternativas,
              correta,
              explicacao,
              comentarios,
              erros,
              created_at
            )
          `
                    )
                    .eq("user_id", uid)
                    .eq("tipo", tipo)
                    .order("created_at", { ascending: false });

                if (error) throw error;

                // ✅ Tipagem segura: converte pra unknown e depois ItemCaderno[]
                const rows = (data ?? []) as unknown as ItemCaderno[];

                // Filtra por disciplina/assunto (lembrando que questao vem como array)
                const filtrado = rows.filter((r) => {
                    const q = r.questao?.[0];
                    if (!q) return false;
                    return q.disciplina === disciplina && q.assunto === assunto;
                });

                setItens(filtrado);
                setPage(1);
            } catch (e: any) {
                setErro(e?.message || "Erro ao carregar questões.");
            } finally {
                setLoading(false);
            }
        })();

        return () => {
            mounted = false;
        };
    }, [tipo, disciplina, assunto]);

    const tituloTipo = tipo === "ERROS" ? "Erros" : "Acertos";

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

    const backToAssuntosHref = `/cadernos/${tipoParam}/${encodeURIComponent(disciplina)}`;

    return (
        <div className="max-w-6xl mx-auto px-4 py-10">
            <div className="flex items-start justify-between gap-4 mb-8">
                <div className="flex items-start gap-3">
                    <BadgeTipo tipo={tipo} />
                    <div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-2xl font-extrabold text-foreground">{assunto}</h1>
                            <span className="text-xs font-semibold text-muted-foreground bg-muted px-3 py-1 rounded-full border border-border">
                                {disciplina}
                            </span>
                            <span className="text-xs font-semibold text-muted-foreground bg-muted px-3 py-1 rounded-full border border-border">
                                {tituloTipo}
                            </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {loading ? "Carregando..." : `${itens.length} questão(ões) encontradas`}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Link
                        href={backToAssuntosHref}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-card hover:bg-muted transition text-sm font-semibold"
                        title="Voltar para assuntos"
                    >
                        <ArrowLeftIcon /> Assuntos
                    </Link>

                    <Link
                        href={`/cadernos/${tipoParam}`}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-card hover:bg-muted transition text-sm font-semibold"
                        title="Voltar para disciplinas"
                    >
                        <ArrowLeftIcon /> Disciplinas
                    </Link>
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

            {userId && (
                <div className="bg-card rounded-2xl p-6 sm:p-8 shadow-sm border border-border">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border pb-3 mb-6">
                        <span className="text-sm font-medium text-muted-foreground tracking-tight">
                            Questões do caderno
                        </span>

                        <div className="flex items-center gap-4">
                            <span className="text-muted-foreground text-xs">
                                Mostrando {paginated.length} de {itens.length} questões
                            </span>

                            <select
                                className="bg-muted border border-border rounded px-3 py-1 text-xs text-foreground"
                                value={perPage}
                                onChange={(e) => {
                                    setPerPage(Number(e.target.value));
                                    setPage(1);
                                }}
                            >
                                <option value={3}>3 por página</option>
                                <option value={5}>5 por página</option>
                                <option value={10}>10 por página</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex flex-col gap-7">
                        {loading ? (
                            <div className="text-muted-foreground py-8 text-center">Carregando questões...</div>
                        ) : paginated.length === 0 ? (
                            <div className="min-h-[120px] flex items-center justify-center text-[#a8b1c6]">
                                Nenhuma questão encontrada neste assunto.
                            </div>
                        ) : (
                            paginated.map((item) => {
                                const q = item.questao?.[0];
                                if (!q) return null;

                                return (
                                    <QuestionCard
                                        key={q.id}
                                        id={q.id}
                                        materiaNome={q.disciplina}
                                        assuntoNome={q.assunto}
                                        tags={[
                                            q.instituicao,
                                            q.cargo,
                                            q.disciplina,
                                            q.assunto,
                                            q.modalidade,
                                            q.banca,
                                        ]}
                                        statement={q.enunciado}
                                        options={Object.entries(q.alternativas).map(([letter, text]) => ({
                                            letter,
                                            text,
                                        }))}
                                        correct={q.correta}
                                        explanation={q.explicacao}
                                        comentarios={q.comentarios}
                                        erros={q.erros}
                                    />
                                );
                            })
                        )}
                    </div>

                    <Pagination total={itens.length} perPage={perPage} page={page} setPage={setPage} />
                </div>
            )}
        </div>
    );
}