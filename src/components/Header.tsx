"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient"; // ajuste se usar "@/lib/..."
import { ModeToggle } from "@/components/mode-toggle";
import { PomodoroModal } from "@/components/PomodoroModal";

export function Header() {
    const [menuAberto, setMenuAberto] = useState(false);
    const [aluno, setAluno] = useState<string | null>(null);
    const [showPomodoro, setShowPomodoro] = useState(false);
    const [miniTime, setMiniTime] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setAluno(user.user_metadata?.nome || user.user_metadata?.name || user.email);
            }
        })();
    }, []);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setMenuAberto(false);
            }
        }
        if (menuAberto) document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [menuAberto]);

    async function logout() {
        await supabase.auth.signOut();
        router.push("/auth");
    }

    // recebe mini status do Pomodoro
    useEffect(() => {
        const handler = (e: Event) => {
            const ce = e as CustomEvent<string | null>;
            setMiniTime(ce.detail || null);
        };
        window.addEventListener("pomodoro:mini", handler);
        return () => window.removeEventListener("pomodoro:mini", handler);
    }, []);

    return (
        <header className="w-full px-4 md:px-8 py-4 border-b border-border bg-card flex items-center justify-between">
            <div className="flex items-center gap-2">
                {miniTime && (
                    <span className="hidden sm:inline-flex items-center text-xs px-2 py-1 rounded-full bg-muted text-foreground/80">
                        🍅 {miniTime}
                    </span>
                )}
            </div>

            <div className="flex items-center gap-3 md:gap-6">
                <button
                    onClick={() => setShowPomodoro(true)}
                    className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm md:text-base font-medium hover:opacity-90 active:opacity-80 transition"
                    aria-label="Abrir Pomodoro"
                >
                    🍅 Pomodoro
                </button>

                <span className="text-sm md:text-base font-medium text-foreground/80 font-sans">
                    {aluno ? `Bem-vindo, ${aluno}!` : "Bem-vindo!"}
                </span>

                <ModeToggle />

                <div className="relative" ref={menuRef}>
                    <button
                        className="w-9 h-9 rounded-full bg-muted flex items-center justify-center font-bold text-foreground text-base focus:outline-none"
                        onClick={() => setMenuAberto(v => !v)}
                        aria-haspopup="true"
                        aria-expanded={menuAberto}
                        aria-label="Abrir menu do usuário"
                    >
                        VM
                    </button>
                    {menuAberto && (
                        <div className="absolute right-0 mt-2 w-36 bg-card border border-border rounded-xl shadow-lg z-50 py-2">
                            <button
                                className="w-full text-left px-4 py-2 text-foreground hover:bg-muted rounded-lg transition-colors"
                                onClick={logout}
                            >
                                Sair da conta
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {showPomodoro && <PomodoroModal onClose={() => setShowPomodoro(false)} />}
        </header>
    );
}
