"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronRight, Search } from "lucide-react";

/*
 * Lista padrão de categorias (disciplinas/assuntos) usada em Resumos,
 * Flashcards e Cadernos: card compacto alinhado à esquerda, ícone azul,
 * contador, selo "N para revisar", busca e ordenação.
 */

export type ItemCategoria = {
    id: string;
    nome: string;
    total: number;
    /** Itens com revisão vencida (hoje ou antes). */
    pendentes?: number;
    /** Texto extra discreto (ex.: "3 inativos"). */
    detalhe?: string;
};

type Ordem = "nome" | "total" | "pendentes";

export function ListaCategorias({
    itens,
    modo,
    icone,
    unidade,
    aoAbrir,
    rotuloBusca = "Buscar",
}: {
    itens: ItemCategoria[];
    modo: "grid" | "list";
    icone: ReactNode;
    /** [singular, plural], ex.: ["resumo", "resumos"] */
    unidade: [string, string];
    aoAbrir: (id: string) => void;
    rotuloBusca?: string;
}) {
    const [busca, setBusca] = useState("");
    const [ordem, setOrdem] = useState<Ordem>("nome");
    const temPendentes = itens.some((i) => (i.pendentes ?? 0) > 0);

    const visiveis = useMemo(() => {
        const termo = busca
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase()
            .trim();
        const filtrados = termo
            ? itens.filter((i) =>
                  i.nome
                      .normalize("NFD")
                      .replace(/[̀-ͯ]/g, "")
                      .toLowerCase()
                      .includes(termo)
              )
            : itens;
        return [...filtrados].sort((a, b) => {
            if (ordem === "total") return b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR");
            if (ordem === "pendentes") return (b.pendentes ?? 0) - (a.pendentes ?? 0) || b.total - a.total;
            return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
        });
    }, [itens, busca, ordem]);

    const qtd = (n: number) => `${n} ${n === 1 ? unidade[0] : unidade[1]}`;

    return (
        <div className="flex flex-col gap-4">
            {/* Barra de ferramentas */}
            {itens.length > 3 && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <input
                            value={busca}
                            onChange={(e) => setBusca(e.target.value)}
                            placeholder={rotuloBusca}
                            aria-label={rotuloBusca}
                            className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                        />
                    </label>
                    <select
                        value={ordem}
                        onChange={(e) => setOrdem(e.target.value as Ordem)}
                        aria-label="Ordenar"
                        className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                    >
                        <option value="nome">Ordem: A–Z</option>
                        <option value="total">Ordem: mais {unidade[1]}</option>
                        {temPendentes && <option value="pendentes">Ordem: para revisar</option>}
                    </select>
                </div>
            )}

            {visiveis.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nada encontrado para “{busca}”.</p>
            ) : (
                <ul className={modo === "grid" ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-2"}>
                    {visiveis.map((item) => {
                        const pend = item.pendentes ?? 0;
                        return (
                            <li key={item.id}>
                                <button
                                    type="button"
                                    onClick={() => aoAbrir(item.id)}
                                    className={`group flex h-full w-full items-center gap-3 rounded-xl border border-border bg-card text-left shadow-sm transition hover:border-primary/60 hover:bg-muted/40 ${
                                        modo === "grid" ? "p-4" : "px-4 py-3"
                                    }`}
                                >
                                    <span
                                        className={`flex shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ${
                                            modo === "grid" ? "h-11 w-11" : "h-9 w-9"
                                        }`}
                                        aria-hidden
                                    >
                                        {icone}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        {/* Nome inteiro (até 2 linhas): o selo fica embaixo para não cortar o nome. */}
                                        <span className="line-clamp-2 font-semibold leading-snug text-foreground" title={item.nome}>
                                            {item.nome}
                                        </span>
                                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                            <span>
                                                {qtd(item.total)}
                                                {item.detalhe ? ` • ${item.detalhe}` : ""}
                                            </span>
                                            {pend > 0 && (
                                                <span className="rounded-full bg-primary/15 px-2 py-0.5 font-semibold text-primary">
                                                    {pend} para revisar
                                                </span>
                                            )}
                                        </span>
                                    </span>
                                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
