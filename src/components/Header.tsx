"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function Header() {
    const [menuAberto, setMenuAberto] = useState(false);
    const [aluno, setAluno] = useState<string | null>(null);

    const menuRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    const { theme, setTheme } = useTheme();

    /* ================= USER ================= */

    useEffect(() => {
        (async () => {
            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (user) {
                setAluno(
                    user.user_metadata?.nome ||
                    user.user_metadata?.name ||
                    user.email
                );
            }
        })();
    }, []);

    /* ================= CLICK OUTSIDE ================= */

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                menuRef.current &&
                !menuRef.current.contains(event.target as Node)
            ) {
                setMenuAberto(false);
            }
        }

        if (menuAberto)
            document.addEventListener("mousedown", handleClickOutside);

        return () =>
            document.removeEventListener("mousedown", handleClickOutside);
    }, [menuAberto]);

    /* ================= LOGOUT ================= */

    async function logout() {
        await supabase.auth.signOut();
        router.push("/auth");
    }

    /* ================= THEME TOGGLE ================= */

    function toggleTheme() {
        setTheme(theme === "dark" ? "light" : "dark");
    }

    /* ================= UI ================= */

    return (
        <header className="w-full px-4 md:px-8 py-4 border-b border-border bg-card">
            <div className="flex items-center justify-end gap-3">

                {/* Toggle modo noturno */}
                <button
                    onClick={toggleTheme}
                    className="w-9 h-9 rounded-md border border-border bg-muted hover:bg-muted/80 flex items-center justify-center transition"
                    title="Alternar tema"
                >
                    {theme === "dark" ? (
                        <Sun className="w-4 h-4" />
                    ) : (
                        <Moon className="w-4 h-4" />
                    )}
                </button>

                {/* Saudação */}
                <span className="hidden xs:block text-sm md:text-base font-medium text-foreground/80 max-w-[45vw] truncate">
                    {aluno ? `Bem-vindo, ${aluno}!` : "Bem-vindo!"}
                </span>

                {/* Menu usuário */}
                <div className="relative" ref={menuRef}>
                    <button
                        className="w-9 h-9 rounded-full bg-muted flex items-center justify-center font-bold text-foreground"
                        onClick={() => setMenuAberto((v) => !v)}
                        aria-expanded={menuAberto}
                    >
                        VM
                    </button>

                    {menuAberto && (
                        <div className="absolute right-0 mt-2 w-36 bg-card border border-border rounded-xl shadow-lg z-50 py-2">
                            <button
                                className="w-full text-left px-4 py-2 hover:bg-muted rounded-lg transition-colors"
                                onClick={logout}
                            >
                                Sair da conta
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}