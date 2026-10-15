import React from "react";
import { pedacosFormatados } from "@/lib/textoFormatado";

/**
 * Mostra o texto da questão com negrito, itálico e sublinhado quando a fonte
 * trouxe esses destaques ("o termo sublinhado..."). Sem formatação, mostra o
 * texto puro. Nunca usa innerHTML (ver lib/textoFormatado.ts).
 */
export function TextoFormatado({ texto, fmt }: { texto: string; fmt?: string | null }) {
    if (!fmt) return <>{texto}</>;
    return (
        <>
            {pedacosFormatados(fmt).map((p, i) => {
                let no: React.ReactNode = p.texto;
                if (p.marcas.includes("u")) no = <u className="decoration-2 underline-offset-2">{no}</u>;
                if (p.marcas.includes("i")) no = <em>{no}</em>;
                if (p.marcas.includes("b")) no = <strong className="font-bold">{no}</strong>;
                return <React.Fragment key={i}>{no}</React.Fragment>;
            })}
        </>
    );
}
