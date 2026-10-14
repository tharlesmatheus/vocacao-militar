import { Loader2 } from "lucide-react";

/** Estado de carregamento padrão das páginas logadas (cabe dentro do layout, sem ocupar a tela toda). */
export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
    return (
        <div className="flex w-full items-center justify-center gap-2 py-24 text-muted-foreground" role="status" aria-live="polite">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            <span className="text-sm">{texto}</span>
        </div>
    );
}
