import type { ReactNode } from "react";

/*
 * Padrões visuais das páginas logadas. A LARGURA e o espaçamento externo vêm do
 * layout (app/layout.tsx); a página só organiza o conteúdo. Assim todas as
 * telas têm o mesmo tamanho e o mesmo alinhamento.
 */

/** Pilha vertical padrão da página. */
export function Pagina({ children, className = "" }: { children: ReactNode; className?: string }) {
    return <div className={`flex w-full flex-col gap-6 ${className}`}>{children}</div>;
}

/** Cabeçalho padrão: rótulo (opcional), título, descrição curta e ações à direita. */
export function CabecalhoPagina({
    titulo,
    descricao,
    rotulo,
    icone,
    acoes,
}: {
    titulo: ReactNode;
    descricao?: ReactNode;
    rotulo?: ReactNode;
    icone?: ReactNode;
    acoes?: ReactNode;
}) {
    return (
        <header className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
                {rotulo && (
                    <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                        {icone}
                        {rotulo}
                    </div>
                )}
                <h1 className="text-3xl font-extrabold text-foreground">{titulo}</h1>
                {descricao && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{descricao}</p>}
            </div>
            {acoes && <div className="flex shrink-0 flex-wrap items-center gap-2">{acoes}</div>}
        </header>
    );
}

/** Card padrão. Use `titulo` para o cabeçalho interno e `acoes` para botões à direita dele. */
export function Painel({
    titulo,
    descricao,
    acoes,
    children,
    className = "",
    corpoClassName = "",
}: {
    titulo?: ReactNode;
    descricao?: ReactNode;
    acoes?: ReactNode;
    children?: ReactNode;
    className?: string;
    corpoClassName?: string;
}) {
    return (
        <section className={`rounded-xl border border-border bg-card p-5 shadow-sm ${className}`}>
            {(titulo || acoes) && (
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        {titulo && <h2 className="text-base font-bold text-foreground">{titulo}</h2>}
                        {descricao && <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>}
                    </div>
                    {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
                </div>
            )}
            <div className={corpoClassName}>{children}</div>
        </section>
    );
}

/** Cartão de número (KPI): rótulo pequeno, valor grande, detalhe opcional. */
export function Numero({
    rotulo,
    valor,
    detalhe,
    icone,
    className = "",
}: {
    rotulo: ReactNode;
    valor: ReactNode;
    detalhe?: ReactNode;
    icone?: ReactNode;
    className?: string;
}) {
    return (
        <div className={`relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm ${className}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{rotulo}</div>
                {icone && <div className="shrink-0 text-primary">{icone}</div>}
            </div>
            <div className="mt-1.5 text-2xl font-extrabold tracking-tight text-foreground">{valor}</div>
            {detalhe && <div className="mt-0.5 text-xs text-muted-foreground">{detalhe}</div>}
        </div>
    );
}

/** Seletor de opções em bloco (ex.: Dia | Semana | Mês | Ano | Tudo). */
export function SeletorSegmentado<T extends string>({
    opcoes,
    valor,
    aoMudar,
    rotulo,
}: {
    opcoes: { id: T; nome: ReactNode }[];
    valor: T;
    aoMudar: (id: T) => void;
    rotulo?: string;
}) {
    return (
        <div role="radiogroup" aria-label={rotulo} className="inline-flex max-w-full overflow-x-auto rounded-lg border border-border bg-muted p-1">
            {opcoes.map((o) => {
                const ativo = o.id === valor;
                return (
                    <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={ativo}
                        onClick={() => aoMudar(o.id)}
                        className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                            ativo ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        {o.nome}
                    </button>
                );
            })}
        </div>
    );
}

/** Estado vazio padrão. */
export function Vazio({ titulo, texto, acao }: { titulo: ReactNode; texto?: ReactNode; acao?: ReactNode }) {
    return (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
            <div className="font-semibold text-foreground">{titulo}</div>
            {texto && <p className="max-w-md text-sm text-muted-foreground">{texto}</p>}
            {acao && <div className="mt-2">{acao}</div>}
        </div>
    );
}
