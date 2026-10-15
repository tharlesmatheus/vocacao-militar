"use client";

import React, { useCallback, useEffect, useState } from "react";
import { linkCheckout } from "@/lib/plano";
import { VALOR_PLANO, eventoPixelEIr } from "@/lib/pixel";
import { supabase } from "../lib/supabaseClient";

type Comentario = {
    id: string;
    user_id: string | null;
    autor_tipo: "PLATAFORMA" | "ALUNO";
    autor_nome: string;
    texto: string;
    created_at: string;
};

const MAX_TEXTO = 2000;
const TENTATIVAS_ESPERA = 50; // ~60s esperando a geração (em segundo plano ou de outro aluno)

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function dataCurta(iso: string) {
    try {
        return new Date(iso).toLocaleDateString("pt-BR");
    } catch {
        return "";
    }
}

/**
 * Lista de comentários de uma questão.
 * O primeiro é sempre o "Por Vocação Militar". Se a questão ainda não tem,
 * ele é gerado uma única vez no servidor e fica salvo para todos.
 */
export function ComentariosQuestao({ questaoId }: { questaoId: string }) {
    const [comentarios, setComentarios] = useState<Comentario[]>([]);
    const [userId, setUserId] = useState<string | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [preparando, setPreparando] = useState(false);
    const [erro, setErro] = useState("");
    const [semAssinatura, setSemAssinatura] = useState(false);
    const [texto, setTexto] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [aviso, setAviso] = useState("");

    const listar = useCallback(async () => {
        const { data, error } = await supabase
            .from("questao_comentarios")
            .select("id,user_id,autor_tipo,autor_nome,texto,created_at")
            .eq("questao_id", questaoId)
            .order("autor_tipo", { ascending: false }) // PLATAFORMA antes de ALUNO
            .order("created_at", { ascending: true });
        if (error) throw error;
        // Explicação oficial sem texto (falha antiga) é tratada como inexistente: gera de novo.
        return ((data ?? []) as Comentario[]).filter(
            (c) => !(c.autor_tipo === "PLATAFORMA" && (c.texto ?? "").trim().length < 40)
        );
    }, [questaoId]);

    const garantirComentarioOficial = useCallback(async (): Promise<Comentario | null> => {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("Faça login para ver os comentários.");

        for (let tentativa = 0; tentativa < TENTATIVAS_ESPERA; tentativa++) {
            const r = await fetch(`/api/questoes/${questaoId}/comentario`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            const corpo = await r.json().catch(() => ({}));

            if (r.status === 200) return (corpo.comentario ?? null) as Comentario | null;
            if (r.status === 202) {
                await esperar(1200);
                continue;
            }
            if (r.status === 402) {
                setSemAssinatura(true);
                return null;
            }
            throw new Error(corpo.error || "Não foi possível carregar o comentário.");
        }
        throw new Error("A explicação está demorando mais que o normal. Feche e abra os comentários de novo em instantes.");
    }, [questaoId]);

    useEffect(() => {
        let cancelado = false;

        (async () => {
            setCarregando(true);
            setErro("");
            try {
                const { data: auth } = await supabase.auth.getUser();
                if (!cancelado) setUserId(auth.user?.id ?? null);

                let lista = await listar();
                if (cancelado) return;
                setComentarios(lista);
                setCarregando(false);

                if (!lista.some((c) => c.autor_tipo === "PLATAFORMA")) {
                    setPreparando(true);
                    const oficial = await garantirComentarioOficial();
                    if (cancelado) return;
                    if (oficial) {
                        lista = await listar();
                        if (!cancelado) setComentarios(lista);
                    }
                }
            } catch (e: any) {
                if (!cancelado) setErro(e?.message || "Erro ao carregar comentários.");
            } finally {
                if (!cancelado) {
                    setCarregando(false);
                    setPreparando(false);
                }
            }
        })();

        return () => {
            cancelado = true;
        };
    }, [listar, garantirComentarioOficial]);

    async function enviar(e: React.FormEvent) {
        e.preventDefault();
        const limpo = texto.trim();
        if (!limpo || !userId) return;

        setEnviando(true);
        setErro("");
        try {
            const { data, error } = await supabase
                .from("questao_comentarios")
                .insert({ questao_id: questaoId, user_id: userId, autor_tipo: "ALUNO", texto: limpo.slice(0, MAX_TEXTO) })
                .select("id,user_id,autor_tipo,autor_nome,texto,created_at")
                .single();
            if (error) throw error;
            setComentarios((lista) => [...lista, data as Comentario]);
            setTexto("");
        } catch (e: any) {
            setErro(e?.message || "Não foi possível publicar o comentário.");
        } finally {
            setEnviando(false);
        }
    }

    async function excluir(id: string) {
        const { error } = await supabase.from("questao_comentarios").delete().eq("id", id);
        if (error) {
            setErro(error.message);
            return;
        }
        setComentarios((lista) => lista.filter((c) => c.id !== id));
    }

    async function denunciar(id: string) {
        const { error } = await supabase
            .from("questao_comentario_denuncias")
            .insert({ comentario_id: id, user_id: userId, motivo: "" });
        setAviso(error && error.code !== "23505" ? "Não foi possível enviar a denúncia." : "Obrigado! Vamos revisar este comentário.");
        setTimeout(() => setAviso(""), 3000);
    }

    if (semAssinatura) {
        return (
            <div className="rounded-xl border border-border bg-muted p-4 text-sm">
                Os comentários fazem parte da assinatura.{" "}
                <button
                    type="button"
                    className="font-semibold text-primary underline"
                    onClick={async () => {
                        const { data } = await supabase.auth.getUser();
                        eventoPixelEIr(linkCheckout(data.user?.email), [["InitiateCheckout", VALOR_PLANO]]);
                    }}
                >
                    Assinar agora
                </button>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-border bg-muted/40 p-4 flex flex-col gap-4">
            {carregando ? (
                <div className="text-sm text-muted-foreground">Carregando explicação…</div>
            ) : (
                <>
                    {preparando && (
                        <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4" role="status" aria-live="polite">
                            <span className="text-sm font-semibold text-foreground">Carregando explicação…</span>
                            <span className="h-3 w-11/12 animate-pulse rounded bg-muted" />
                            <span className="h-3 w-10/12 animate-pulse rounded bg-muted" />
                            <span className="h-3 w-7/12 animate-pulse rounded bg-muted" />
                        </div>
                    )}

                    {comentarios.map((c) => {
                        const oficial = c.autor_tipo === "PLATAFORMA";
                        const meu = !!userId && c.user_id === userId;
                        return (
                            <div
                                key={c.id}
                                className={`rounded-lg p-4 text-sm ${oficial ? "bg-primary/10 border border-primary/30" : "bg-card border border-border"}`}
                            >
                                <div className="flex items-center justify-between gap-2 mb-2">
                                    <span className="font-semibold text-foreground">
                                        {oficial ? "Por Vocação Militar" : c.autor_nome}
                                    </span>
                                    <span className="text-xs text-muted-foreground">{dataCurta(c.created_at)}</span>
                                </div>
                                <p className="whitespace-pre-line leading-relaxed text-foreground">{c.texto}</p>
                                <div className="flex gap-3 mt-3 text-xs">
                                    {meu ? (
                                        <button type="button" onClick={() => excluir(c.id)} className="text-red-600 dark:text-red-400 hover:underline">
                                            Excluir
                                        </button>
                                    ) : (
                                        <button type="button" onClick={() => denunciar(c.id)} className="text-muted-foreground hover:underline">
                                            {oficial ? "Reportar erro" : "Denunciar"}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {!preparando && comentarios.length === 0 && !erro && (
                        <div className="text-sm text-muted-foreground">Ainda não há comentários.</div>
                    )}
                </>
            )}

            {aviso && <div className="text-sm text-green-700 dark:text-green-300">{aviso}</div>}
            {erro && <div className="text-sm text-red-600 dark:text-red-400">{erro}</div>}

            {userId && (
                <form onSubmit={enviar} className="flex flex-col gap-2">
                    <textarea
                        value={texto}
                        onChange={(e) => setTexto(e.target.value.slice(0, MAX_TEXTO))}
                        rows={3}
                        placeholder="Escreva seu comentário sobre a questão..."
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{texto.length}/{MAX_TEXTO}</span>
                        <button
                            type="submit"
                            disabled={enviando || !texto.trim()}
                            className="bg-primary text-primary-foreground font-semibold text-sm px-4 py-2 rounded-lg disabled:opacity-50"
                        >
                            {enviando ? "Publicando..." : "Comentar"}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}

export default ComentariosQuestao;
