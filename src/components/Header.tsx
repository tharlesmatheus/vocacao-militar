"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient"; // ajuste se usa "@/lib/..."
import { ModeToggle } from "@/components/mode-toggle";
import { PomodoroModal } from "@/components/PomodoroModal";
import { Clock } from "lucide-react";

const LS_KEY = "pomodoro_state_v1";

export function Header() {
    const [menuAberto, setMenuAberto] = useState(false);
    const [aluno, setAluno] = useState<string | null>(null);
    const [showPomodoro, setShowPomodoro] = useState(false);
    const [miniTime, setMiniTime] = useState<string | null>(null); // texto do badge: "12:34"
    const menuRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) setAluno(user.user_metadata?.nome || user.user_metadata?.name || user.email);
        })();
    }, []);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuAberto(false);
        }
        if (menuAberto) document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [menuAberto]);

    async function logout() {
        await supabase.auth.signOut();
        router.push("/auth");
    }

    // inicializa badge ao montar (após reload) e ouve atualizações do serviço
    useEffect(() => {
        const format = (s: number) => {
            const m = String(Math.floor(s / 60)).padStart(2, "0");
            const sec = String(s % 60).padStart(2, "0");
            return `${m}:${sec}`;
        };

        // estado salvo
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (raw) {
                const st = JSON.parse(raw) as { isRunning?: boolean; targetEnd?: number; remaining?: number; phase?: "study" | "break" };
                if (st?.isRunning) {
                    const now = Date.now();
                    const remaining = Math.max(0, Math.floor(((st.targetEnd ?? now) - now) / 1000));
                    setMiniTime(remaining > 0 ? format(remaining) : null);
                }
            }
        } catch { }

        const miniHandler = (e: Event) => {
            const ce = e as CustomEvent<string | null>;
            setMiniTime(ce.detail || null);
        };
        window.addEventListener("pomodoro:mini", miniHandler);
        return () => window.removeEventListener("pomodoro:mini", miniHandler);
    }, []);

    return (
        <header className="w-full px-4 md:px-8 py-4 border-b border-border bg-card">
            <div className="flex items-center justify-end gap-2 sm:gap-3">
                {/* Botão pomodoro — ícone apenas, com badge embutido */}
                <button
                    onClick={() => setShowPomodoro(true)}
                    className="relative inline-flex shrink-0 items-center justify-center w-9 h-9 rounded-md border border-border bg-muted hover:bg-muted/80 transition"
                    aria-label="Abrir Pomodoro"
                    title="Pomodoro"
                >
                    <Clock className="w-4 h-4" />
                    {miniTime && (
                        <span
                            className="absolute -top-1 -right-1 text-[10px] px-1.5 py-[2px] leading-none rounded-full bg-primary text-primary-foreground shadow"
                            aria-live="polite"
                        >
                            {miniTime}
                        </span>
                    )}
                </button>

                {/* Toggle de tema */}
                <ModeToggle />

                {/* Saudação */}
                <span className="hidden xs:block text-sm md:text-base font-medium text-foreground/80 max-w-[45vw] truncate">
                    {aluno ? `Bem-vindo, ${aluno}!` : "Bem-vindo!"}
                </span>

                {/* Menu do usuário */}
                <div className="relative" ref={menuRef}>
                    <button
                        className="w-9 h-9 rounded-full bg-muted flex items-center justify-center font-bold text-foreground text-base focus:outline-none shrink-0"
                        onClick={() => setMenuAberto((v) => !v)}
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
