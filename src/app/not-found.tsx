import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
    return (
        <div className="flex w-full items-center justify-center px-4 py-20">
            <div className="flex w-full max-w-md flex-col items-center rounded-xl border border-border bg-card p-8 text-center shadow-sm">
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <SearchX className="h-7 w-7" aria-hidden />
                </span>
                <h1 className="mt-4 mb-2 text-2xl font-extrabold text-foreground">Página não encontrada</h1>
                <p className="mb-6 text-muted-foreground">O endereço que você abriu não existe ou foi removido.</p>
                <Link
                    href="/"
                    className="rounded-lg bg-primary px-6 py-2.5 font-bold text-primary-foreground transition hover:bg-primary/90"
                >
                    Voltar para o painel
                </Link>
            </div>
        </div>
    );
}
