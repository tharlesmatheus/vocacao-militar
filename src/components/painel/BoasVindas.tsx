"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { ocultarBoasVindas, type PerfilAluno } from "@/lib/perfilAluno";
import { BotaoLembretes } from "@/components/BotaoLembretes";

type Passos = { questoes: number; caderno: boolean; revisao: boolean };

/**
 * Primeiros passos do aluno novo. Quem usa a plataforma na primeira semana
 * renova; então guiamos para as 4 ações que criam o hábito.
 * Some quando tudo estiver feito (e o aluno fechar) ou quando ele dispensar.
 */
export function BoasVindas({ perfil, aoOcultar }: { perfil: PerfilAluno | null; aoOcultar: () => void }) {
    const [passos, setPassos] = useState<Passos | null>(null);

    useEffect(() => {
        (async () => {
            const { data: auth } = await supabase.auth.getUser();
            const uid = auth.user?.id;
            if (!uid) return;
            const [q, c, r] = await Promise.all([
                supabase.from("question_attempts").select("id", { count: "exact", head: true }).eq("user_id", uid),
                supabase.from("caderno_itens").select("id", { count: "exact", head: true }).eq("user_id", uid),
                supabase.from("review_progress").select("item_id", { count: "exact", head: true }).eq("user_id", uid).not("last_reviewed_at", "is", null),
            ]);
            setPassos({ questoes: q.count ?? 0, caderno: (c.count ?? 0) > 0, revisao: (r.count ?? 0) > 0 });
        })();
    }, []);

    if (perfil?.boas_vindas_ocultas_em || !passos) return null;

    const itens = [
        { feito: !!perfil?.meta_instituicao, titulo: "Escolha sua meta", texto: "O concurso que você vai fazer.", href: "/meta", acao: "Escolher" },
        {
            feito: passos.questoes >= 10,
            titulo: "Resolva 10 questões",
            texto: passos.questoes >= 10 ? "Feito!" : `${passos.questoes}/10 até agora.`,
            href: "/questoes",
            acao: "Resolver",
        },
        { feito: passos.caderno, titulo: "Monte seu caderno", texto: "Marque \"+ Erros\" numa questão que você errou.", href: "/questoes", acao: "Ir às questões" },
        { feito: passos.revisao, titulo: "Faça sua primeira revisão", texto: "O que você revisa, você não esquece.", href: "/revisao", acao: "Revisar" },
    ];
    const feitos = itens.filter((i) => i.feito).length;
    const completo = feitos === itens.length;

    async function fechar() {
        await ocultarBoasVindas();
        aoOcultar();
    }

    return (
        <section className="relative rounded-lg border border-primary/40 bg-card p-4 shadow-sm">
            <button type="button" onClick={fechar} className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Fechar primeiros passos">
                <X className="h-4 w-4" />
            </button>
            <div className="pr-8">
                <div className="font-titulo text-lg font-bold uppercase tracking-wide text-foreground">
                    {completo ? "Treinamento básico concluído!" : "Primeiros passos"}
                </div>
                <div className="text-sm text-muted-foreground">
                    {completo ? "Agora é constância: volte amanhã para a Missão do dia." : `${feitos} de ${itens.length} concluídos. Leva uns 15 minutos.`}
                </div>
            </div>

            <div className="mt-3 h-1.5 w-full rounded-full bg-muted">
                <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${(100 * feitos) / itens.length}%` }} />
            </div>

            <ol className="mt-4 grid gap-2 sm:grid-cols-2">
                {itens.map((i) => (
                    <li key={i.titulo} className={`flex items-start gap-3 rounded-md border p-3 ${i.feito ? "border-border bg-muted/40" : "border-border bg-background"}`}>
                        {i.feito ? (
                            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Concluído" />
                        ) : (
                            <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-label="Pendente" />
                        )}
                        <div className="min-w-0 flex-1">
                            <div className={`text-sm font-semibold ${i.feito ? "text-muted-foreground line-through" : "text-foreground"}`}>{i.titulo}</div>
                            <div className="text-xs text-muted-foreground">{i.texto}</div>
                        </div>
                        {!i.feito && (
                            <Link href={i.href} className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                                {i.acao}
                            </Link>
                        )}
                    </li>
                ))}
            </ol>

            <div className="mt-4 border-t border-border pt-3">
                <div className="mb-1 text-sm font-semibold text-foreground">Bônus: lembrete no celular</div>
                <BotaoLembretes />
            </div>
        </section>
    );
}
