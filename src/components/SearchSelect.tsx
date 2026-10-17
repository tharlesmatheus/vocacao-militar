"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

/*
 * Caixa de seleção com busca: digite e a lista vai filtrando (sem diferenciar
 * acento nem maiúscula: "pm pe", "polícia", "sao paulo" funcionam).
 * Teclado: ↑ ↓ navegam, Enter escolhe, Esc fecha. Segue o padrão ARIA "combobox".
 * Mostra no máximo MAX_ITENS por vez para listas grandes (assuntos) não travarem.
 */

const MAX_ITENS = 200;

const semAcento = (t: string) =>
    t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

type Props = {
    id: string;
    name: string;
    value: string;
    options: string[];
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    rotulo?: (v: string) => string;
    className?: string;
};

export default function SearchSelect({ id, name, value, options, onChange, placeholder = "Selecione", disabled, rotulo, className }: Props) {
    const [aberto, setAberto] = useState(false);
    const [busca, setBusca] = useState("");
    const [ativo, setAtivo] = useState(0);
    const raiz = useRef<HTMLDivElement>(null);
    const lista = useRef<HTMLUListElement>(null);
    const idLista = useId();
    const nome = (v: string) => (rotulo ? rotulo(v) : v);

    const filtradas = useMemo(() => {
        const termos = semAcento(busca).split(" ").filter(Boolean);
        const todas = termos.length
            ? options.filter((o) => {
                  const alvo = semAcento(`${o} ${nome(o)}`);
                  return termos.every((t) => alvo.includes(t));
              })
            : options;
        return todas;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [busca, options]);
    // Primeira linha = "limpar" (placeholder), só quando não há busca.
    const itens = useMemo(
        () => [...(busca ? [] : [""]), ...filtradas.slice(0, MAX_ITENS)],
        [busca, filtradas]
    );

    useEffect(() => {
        if (!aberto) return;
        const fora = (e: MouseEvent) => {
            if (raiz.current && !raiz.current.contains(e.target as Node)) fechar();
        };
        document.addEventListener("mousedown", fora);
        return () => document.removeEventListener("mousedown", fora);
    }, [aberto]);

    useEffect(() => setAtivo(0), [busca]);
    useEffect(() => {
        lista.current?.querySelector<HTMLElement>(`[data-i="${ativo}"]`)?.scrollIntoView({ block: "nearest" });
    }, [ativo, aberto]);

    function fechar() {
        setAberto(false);
        setBusca("");
    }

    function escolher(v: string) {
        onChange(v);
        fechar();
    }

    function teclas(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!aberto) setAberto(true);
            else setAtivo((i) => Math.min(itens.length - 1, i + 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAtivo((i) => Math.max(0, i - 1));
        } else if (e.key === "Enter") {
            if (aberto) {
                e.preventDefault(); // não envia o formulário enquanto escolhe
                if (itens[ativo] !== undefined) escolher(itens[ativo]);
            }
        } else if (e.key === "Escape") {
            fechar();
        } else if (e.key === "Tab") {
            fechar();
        }
    }

    const texto = aberto ? busca : value ? nome(value) : "";

    return (
        <div ref={raiz} className="relative">
            <input type="hidden" name={name} value={value} />
            <input
                id={id}
                type="text"
                role="combobox"
                aria-expanded={aberto}
                aria-controls={idLista}
                aria-autocomplete="list"
                aria-activedescendant={aberto ? `${idLista}-${ativo}` : undefined}
                autoComplete="off"
                disabled={disabled}
                className={`${className ?? ""} pr-10`}
                placeholder={aberto && value ? nome(value) : placeholder}
                value={texto}
                title={value ? nome(value) : undefined}
                onFocus={() => setAberto(true)}
                onClick={() => setAberto(true)}
                onChange={(e) => {
                    setBusca(e.target.value);
                    setAberto(true);
                }}
                onKeyDown={teclas}
            />
            <span aria-hidden className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                ⌄
            </span>
            {aberto && !disabled && (
                <ul
                    ref={lista}
                    id={idLista}
                    role="listbox"
                    className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-lg"
                >
                    {itens.length === 0 && <li className="px-4 py-2 text-sm text-muted-foreground">Nada encontrado</li>}
                    {itens.map((v, i) => (
                        <li
                            key={v || "__vazio"}
                            id={`${idLista}-${i}`}
                            data-i={i}
                            role="option"
                            aria-selected={v === value}
                            onMouseDown={(e) => e.preventDefault()} // mantém o foco no campo
                            onClick={() => escolher(v)}
                            onMouseEnter={() => setAtivo(i)}
                            className={`cursor-pointer px-4 py-2 text-sm ${i === ativo ? "bg-primary/15" : ""} ${
                                v === value ? "font-semibold text-primary" : v ? "text-foreground" : "text-muted-foreground"
                            }`}
                        >
                            {v ? nome(v) : placeholder}
                        </li>
                    ))}
                    {filtradas.length > MAX_ITENS && (
                        <li className="px-4 py-2 text-xs text-muted-foreground">
                            Mostrando {MAX_ITENS} de {filtradas.length}. Digite mais letras para achar.
                        </li>
                    )}
                </ul>
            )}
        </div>
    );
}
