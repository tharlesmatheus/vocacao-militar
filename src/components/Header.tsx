"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function Header() {
    const { resolvedTheme, setTheme } = useTheme();
    // O tema só é conhecido no navegador; antes disso o ícone ficaria errado.
    const [montado, setMontado] = useState(false);
    useEffect(() => setMontado(true), []);

    const escuro = montado ? resolvedTheme === "dark" : true;

    return (
        <header className="w-full max-w-full overflow-x-hidden border-b border-border bg-card/80 backdrop-blur">
            {/* Filete azul: assinatura visual da marca */}
            <div aria-hidden className="h-[3px] w-full bg-primary" />
            <div className="flex items-center justify-end gap-3 px-4 py-3">
                <span className="mr-auto hidden pl-14 font-titulo text-sm font-semibold uppercase tracking-[0.25em] text-muted-foreground sm:inline lg:pl-0">
                    Foco • Disciplina • Aprovação
                </span>

                <button
                    type="button"
                    onClick={() => setTheme(escuro ? "light" : "dark")}
                    aria-label={escuro ? "Usar tema claro" : "Usar tema escuro"}
                    title={escuro ? "Usar tema claro" : "Usar tema escuro"}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted transition hover:border-primary hover:text-primary"
                >
                    {escuro ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
            </div>
        </header>
    );
}
