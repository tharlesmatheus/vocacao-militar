"use client";
import { useEstudoAutomatico } from "@/lib/tempoAtivo";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, RotateCcw, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Pagina } from "@/components/app/Pagina";
import { QuestionCard } from "@/components/QuestionCard";
import { rotuloBanca, rotuloModalidade } from "@/lib/rotulos";
import {
    NOME_CADERNO,
    carregarItensCaderno,
    carregarResumoCadernos,
    itensAtivos,
    plural,
    type CadernoTipo,
} from "@/lib/cadernos";

/*
 * Treino do caderno: uma questão por vez, até 20 por sessão.
 * Cada resposta passa por registrar_treino_caderno (dentro do QuestionCard):
 * 2 acertos seguidos tiram a questão do caderno de erros.
 */

const TAMANHO_SESSAO = 20;

type Questao = {
    id: string;
    instituicao: string | null;
    cargo: string | null;
    disciplina: string | null;
    assunto: string | null;
    modalidade: string | null;
    banca: string | null;
    ano?: number | null;
    enunciado: string;
    alternativas: Record<string, string>;
    correta: string;
    explicacao: string | null;
};

function Treino() {
    useEstudoAutomatico("caderno");
    const params = useSearchParams();
    const tipo: CadernoTipo = params.get("tipo") === "ACERTOS" ? "ACERTOS" : "ERROS";
    const disciplina = params.get("disciplina");
    const assunto = params.get("assunto");

    const [questoes, setQuestoes] = useState<Questao[] | null>(null);
    const [indice, setIndice] = useState(0);
    const [respondida, setRespondida] = useState(false);
    const [acertos, setAcertos] = useState(0);
    const [recuperadasAntes, setRecuperadasAntes] = useState<number | null>(null);
    const [recuperadasDepois, setRecuperadasDepois] = useState<number | null>(null);
    const [erro, setErro] = useState("");

    useEffect(() => {
        (async () => {
            try {
                const itens = await carregarItensCaderno();
                setRecuperadasAntes((await carregarResumoCadernos(itens)).recuperadas);
                // Mais antigas (ou há mais tempo sem treino) primeiro.
                const fila = itensAtivos(itens, tipo)
                    .filter((i) => (!disciplina || i.disciplina === disciplina) && (!assunto || i.assunto === assunto))
                    .sort((a, b) => (a.ultima_tentativa_em ?? a.created_at).localeCompare(b.ultima_tentativa_em ?? b.created_at))
                    .slice(0, TAMANHO_SESSAO)
                    .map((i) => i.questao_id);
                if (!fila.length) return setQuestoes([]);
                const { data, error } = await supabase
                    .rpc("questoes_por_ids", { p_ids: fila })
                    .select("id,instituicao,cargo,disciplina,assunto,modalidade,banca,ano,enunciado,alternativas,correta,explicacao");
                if (error) throw error;
                const mapa = new Map(((data ?? []) as Questao[]).map((q) => [q.id, q]));
                setQuestoes(fila.map((id) => mapa.get(id)).filter(Boolean) as Questao[]);
            } catch (e: any) {
                setErro(e?.message || "Não foi possível montar o treino.");
                setQuestoes([]);
            }
        })();
    }, [tipo, disciplina, assunto]);

    const terminou = questoes !== null && questoes.length > 0 && indice >= questoes.length;

    useEffect(() => {
        if (!terminou) return;
        carregarItensCaderno()
            .then(carregarResumoCadernos)
            .then((r) => setRecuperadasDepois(r.recuperadas))
            .catch(() => undefined);
    }, [terminou]);

    const atual = questoes && !terminou ? questoes[indice] : null;
    const titulo = useMemo(
        () => [NOME_CADERNO[tipo], disciplina, assunto].filter(Boolean).join(" › "),
        [tipo, disciplina, assunto]
    );

    if (questoes === null) return <div className="h-60 animate-pulse rounded-xl bg-muted" />;

    if (!questoes.length) {
        return (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" aria-hidden />
                <div className="text-lg font-bold text-foreground">{erro || "Nada para treinar aqui agora."}</div>
                <Link href="/cadernos" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Voltar aos cadernos</Link>
            </div>
        );
    }

    if (terminou) {
        const recuperadas = recuperadasAntes !== null && recuperadasDepois !== null ? Math.max(0, recuperadasDepois - recuperadasAntes) : null;
        return (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card px-6 py-12 text-center shadow-sm">
                <Trophy className="h-12 w-12 text-primary" aria-hidden />
                <div className="font-titulo text-3xl font-extrabold uppercase text-foreground">Treino concluído</div>
                <p className="text-muted-foreground">
                    Você acertou <strong className="text-foreground">{acertos}</strong> de {questoes.length}.
                    {tipo === "ERROS" && recuperadas !== null && (
                        <> {recuperadas > 0 ? `${plural(recuperadas, "questão saiu", "questões saíram")} do caderno de erros.` : "Acerte cada questão 2 vezes seguidas para tirá-la do caderno."}</>
                    )}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                    <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">
                        <RotateCcw className="h-4 w-4" aria-hidden /> Treinar de novo
                    </button>
                    <Link href="/cadernos" className="rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted">
                        Voltar aos cadernos
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-semibold text-foreground">{titulo}</span>
                    <span className="text-muted-foreground">
                        {indice + 1} de {questoes.length} • {acertos} {acertos === 1 ? "acerto" : "acertos"}
                    </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted">
                    <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${(100 * indice) / questoes.length}%` }} />
                </div>
            </div>

            {atual && (
                <QuestionCard
                    key={atual.id}
                    id={atual.id}
                    numero={indice + 1}
                    total={questoes.length}
                    materiaNome={atual.disciplina}
                    assuntoNome={atual.assunto}
                    tags={[
                        atual.disciplina ?? "",
                        atual.assunto ?? "",
                        atual.instituicao ?? "",
                        atual.cargo ?? "",
                        rotuloBanca(atual.banca),
                        atual.ano ? String(atual.ano) : "",
                        rotuloModalidade(atual.modalidade),
                    ]}
                    statement={atual.enunciado}
                    options={Object.entries(atual.alternativas ?? {}).map(([letter, text]) => ({ letter, text }))}
                    correct={atual.correta}
                    explanation={atual.explicacao ?? ""}
                    aoResponder={(ok) => {
                        setRespondida(true);
                        if (ok) setAcertos((n) => n + 1);
                    }}
                />
            )}

            <div className="flex justify-between">
                <Link href="/cadernos" className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted">
                    Encerrar
                </Link>
                <button
                    type="button"
                    disabled={!respondida}
                    onClick={() => {
                        setRespondida(false);
                        setIndice((i) => i + 1);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40"
                >
                    {indice + 1 < questoes.length ? "Próxima questão" : "Ver resultado"} <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
            </div>
        </>
    );
}

export default function TreinoCadernoPage() {
    return (
        <Pagina>
            <Suspense fallback={<div className="h-60 animate-pulse rounded-xl bg-muted" />}>
                <Treino />
            </Suspense>
        </Pagina>
    );
}
