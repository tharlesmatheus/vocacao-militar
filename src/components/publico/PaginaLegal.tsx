import Link from "next/link";
import React from "react";

export const EMAIL_CONTATO = process.env.NEXT_PUBLIC_CONTATO_EMAIL || "tharlesmatheus34@gmail.com";

/** Moldura simples das páginas públicas de Termos e Privacidade. */
export function PaginaLegal({ titulo, atualizadoEm, children }: { titulo: string; atualizadoEm: string; children: React.ReactNode }) {
    return (
        <div className="min-h-screen w-full bg-background text-foreground">
            <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-5">
                <Link href="/assinar" className="text-lg font-extrabold">
                    Vocação <span className="text-primary">Militar</span>
                </Link>
                <Link href="/assinar" className="text-sm underline text-muted-foreground">Voltar</Link>
            </header>
            <main className="mx-auto w-full max-w-3xl px-5 pb-16">
                <h1 className="mb-1 text-3xl font-extrabold">{titulo}</h1>
                <p className="mb-8 text-sm text-muted-foreground">Atualizado em {atualizadoEm}</p>
                <div className="flex flex-col gap-4 leading-relaxed [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc">
                    {children}
                </div>
            </main>
        </div>
    );
}
