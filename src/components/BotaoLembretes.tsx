"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { ativarLembretes, desativarLembretes, estadoLembretes, textoEstado, type EstadoLembretes } from "@/lib/lembretes";

export function BotaoLembretes({ compacto = false, aoMudar }: { compacto?: boolean; aoMudar?: (e: EstadoLembretes) => void }) {
    const [estado, setEstado] = useState<EstadoLembretes | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState("");

    useEffect(() => {
        estadoLembretes().then(setEstado).catch(() => setEstado("indisponivel"));
    }, []);

    async function alternar() {
        setOcupado(true);
        setErro("");
        try {
            const novo = estado === "ativo" ? await desativarLembretes() : await ativarLembretes();
            setEstado(novo);
            aoMudar?.(novo);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível ativar.");
        } finally {
            setOcupado(false);
        }
    }

    if (!estado) return null;
    const podeClicar = estado === "ativo" || estado === "inativo";

    return (
        <div className="flex flex-col gap-1">
            {podeClicar && (
                <button
                    type="button"
                    onClick={alternar}
                    disabled={ocupado}
                    className={`inline-flex w-fit items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${
                        estado === "ativo" ? "border border-border bg-muted text-foreground hover:bg-muted/70" : "bg-primary text-primary-foreground hover:bg-primary/90"
                    }`}
                >
                    {estado === "ativo" ? <BellOff className="h-4 w-4" aria-hidden /> : <Bell className="h-4 w-4" aria-hidden />}
                    {ocupado ? "Aguarde…" : estado === "ativo" ? "Desativar lembretes" : "Ativar lembretes no celular"}
                </button>
            )}
            {!compacto || !podeClicar ? <span className="text-xs text-muted-foreground">{textoEstado[estado]}</span> : null}
            {erro && <span className="text-xs text-red-600 dark:text-red-400">{erro}</span>}
        </div>
    );
}
