"use client";

import { useRouter } from "next/navigation";

export default function NotFound() {
    const router = useRouter();

    return (
        <div className="min-h-screen flex items-center justify-center bg-muted px-4">
            <div className="bg-card rounded-2xl shadow-lg p-8 flex flex-col items-center max-w-md w-full">
                <svg width="68" height="68" fill="none" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" fill="#f3dada" />
                    <path d="M9 9l6 6M15 9l-6 6" stroke="#e2735e" strokeWidth={2.5} strokeLinecap="round" />
                </svg>
                <h1 className="text-2xl font-extrabold text-foreground mt-4 mb-2 text-center">Conteúdo não encontrado!</h1>
                <p className="text-muted-foreground text-center mb-6">A página que você tentou acessar não existe ou foi removida.</p>
                <button
                    onClick={() => router.push("/")}
                    className="bg-primary text-primary-foreground font-bold px-6 py-2 rounded-xl hover:bg-primary/90 transition"
                >
                    Voltar Para Página Principal
                </button>
            </div>
        </div>
    );
}
