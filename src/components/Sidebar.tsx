"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Home,
    CalendarDays,
    BarChart2,
    BadgeCheck,
    User,
    CreditCard,
    Menu as MenuIcon,
    X as CloseIcon,
    BookOpen,
    FileText,
    History,
} from "lucide-react";
import { useState } from "react";

const MENU = [
    { name: "Resolver Questões", href: "/", icon: Home },
    { name: "Cronograma Semanal", href: "/cronograma", icon: CalendarDays },
    { name: "Minhas Estatísticas", href: "/estatisticas", icon: BarChart2 },
    { name: "Minhas Conquistas", href: "/conquistas", icon: BadgeCheck },
    // —— NOVOS ITENS ——
    { name: "Edital", href: "/edital", icon: BookOpen },
    { name: "Resumos", href: "/resumos", icon: FileText },
    { name: "Revisão", href: "/revisao", icon: History },
    // ————————
    { name: "Meu Perfil", href: "/perfil", icon: User },
    { name: "Meu Plano", href: "/plano", icon: CreditCard },
];

export function Sidebar() {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);

    // Função para marcar item ativo inclusive em rotas aninhadas
    const isActive = (href: string) => {
        if (href === "/") return pathname === "/";
        return pathname === href || pathname.startsWith(href + "/");
    };

    return (
        <>
            {/* Botão para abrir menu (mobile) */}
            <button
                className="fixed top-5 left-4 z-40 md:hidden bg-sidebar rounded-lg p-2 shadow border border-sidebar-border"
                aria-label="Abrir menu"
                onClick={() => setOpen(true)}
            >
                <MenuIcon className="w-6 h-6 text-sidebar-foreground" />
            </button>

            {/* Sidebar */}
            <aside
                className={`
          z-30 font-sans
          bg-sidebar px-4 pt-6 pb-4 shadow-lg border-r border-sidebar-border
          w-[250px] min-h-screen flex flex-col
          transition-transform duration-200
          md:sticky md:top-0 md:left-0 md:translate-x-0
          ${open ? "fixed left-0 top-0 h-screen" : "fixed -translate-x-full md:translate-x-0"}
        `}
            >
                {/* Fechar (mobile) */}
                <button
                    className="absolute top-5 right-3 md:hidden rounded-lg p-2"
                    aria-label="Fechar menu"
                    onClick={() => setOpen(false)}
                >
                    <CloseIcon className="w-6 h-6 text-sidebar-foreground" />
                </button>

                {/* Logo */}
                <div className="flex items-center gap-3 mb-10 select-none">
                    <div className="w-11 h-11 rounded-xl bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground font-black text-xl shadow">
                        VM
                    </div>
                    <span className="font-black text-xl leading-6 text-sidebar-foreground tracking-tight">
                        Vocação<br />Militar
                    </span>
                </div>

                {/* Menu */}
                <nav className="flex flex-col gap-1 flex-1">
                    {MENU.map((item) => {
                        const active = isActive(item.href);
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={`
                  flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-[15px]
                  transition-all
                  ${active
                                        ? "bg-muted text-sidebar-foreground font-bold"
                                        : "text-muted-foreground hover:bg-muted hover:text-sidebar-foreground"}
                `}
                                onClick={() => setOpen(false)}
                            >
                                <item.icon
                                    size={20}
                                    className={active ? "text-sidebar-foreground" : "text-muted-foreground"}
                                />
                                <span className="whitespace-pre-line">{item.name}</span>
                            </Link>
                        );
                    })}
                </nav>
            </aside>

            {/* Backdrop (mobile) */}
            {open && (
                <div
                    className="fixed inset-0 z-20 bg-black/30 md:hidden"
                    onClick={() => setOpen(false)}
                    aria-label="Fechar menu"
                />
            )}
        </>
    );
}
