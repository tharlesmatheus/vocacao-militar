"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
    BarChart3,
    BookOpenCheck,
    Clock3,
    FileText,
    Home,
    Menu,
    RotateCcw,
    Tags,
    X,
} from "lucide-react";

type MenuItem = {
    href: string;
    label: string;
    description?: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
};

const ITEMS: MenuItem[] = [
    {
        href: "/",
        label: "Início",
        description: "Visão geral",
        icon: Home,
    },
    {
        href: "/questoes",
        label: "Questões",
        description: "Lançar e resolver questões",
        icon: BookOpenCheck,
    },
    {
        href: "/catalogo",
        label: "Catálogo",
        description: "Instituições, cargos, bancas, disciplinas e assuntos",
        icon: Tags,
    },
    {
        href: "/revisao",
        label: "Revisões",
        description: "Cadernos e revisão espaçada",
        icon: RotateCcw,
    },
    {
        href: "/edital",
        label: "Edital",
        description: "Estrutura do plano de estudos",
        icon: FileText,
    },
    {
        href: "/estatisticas",
        label: "Estatísticas",
        description: "Desempenho e evolução",
        icon: BarChart3,
    },
    {
        href: "/tempo-de-estudo",
        label: "Tempo de estudo",
        description: "Histórico de sessões",
        icon: Clock3,
    },
];

function isActive(pathname: string, href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppMenu() {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="fixed left-4 top-4 z-40 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card shadow-sm lg:hidden"
                aria-label="Abrir menu"
            >
                <Menu size={20} />
            </button>

            {open && (
                <button
                    type="button"
                    aria-label="Fechar menu"
                    className="fixed inset-0 z-40 bg-black/50 lg:hidden"
                    onClick={() => setOpen(false)}
                />
            )}

            <aside
                className={`fixed inset-y-0 left-0 z-50 flex w-[290px] flex-col border-r border-border bg-card transition-transform duration-200 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"
                    }`}
            >
                <div className="flex h-16 items-center justify-between border-b border-border px-5">
                    <Link
                        href="/"
                        onClick={() => setOpen(false)}
                        className="font-bold tracking-tight"
                    >
                        Estudos
                    </Link>

                    <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted lg:hidden"
                        aria-label="Fechar menu"
                    >
                        <X size={19} />
                    </button>
                </div>

                <nav className="flex-1 overflow-y-auto p-3">
                    <div className="space-y-1">
                        {ITEMS.map((item) => {
                            const Icon = item.icon;
                            const active = isActive(pathname, item.href);

                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={() => setOpen(false)}
                                    className={`flex items-start gap-3 rounded-2xl px-3 py-3 transition ${active
                                            ? "bg-primary text-primary-foreground"
                                            : "text-foreground hover:bg-muted"
                                        }`}
                                >
                                    <Icon
                                        size={19}
                                        className="mt-0.5 shrink-0"
                                    />

                                    <span className="min-w-0">
                                        <span className="block text-sm font-semibold">
                                            {item.label}
                                        </span>

                                        {item.description && (
                                            <span
                                                className={`mt-0.5 block text-xs leading-relaxed ${active
                                                        ? "text-primary-foreground/75"
                                                        : "text-muted-foreground"
                                                    }`}
                                            >
                                                {item.description}
                                            </span>
                                        )}
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                </nav>

                <div className="border-t border-border p-4 text-xs text-muted-foreground">
                    O cadastro de categorias de questões fica exclusivamente em
                    <span className="font-semibold text-foreground"> /catalogo</span>.
                </div>
            </aside>
        </>
    );
}
