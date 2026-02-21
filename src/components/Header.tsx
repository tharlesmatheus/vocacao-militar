"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function Header() {
    const { theme, setTheme } = useTheme();

    function toggleTheme() {
        setTheme(theme === "dark" ? "light" : "dark");
    }

    return (
        <header className="w-full max-w-full overflow-x-hidden border-b border-border bg-card">
            <div className="flex items-center justify-end px-4 py-4">

                {/* Toggle modo noturno */}
                <button
                    onClick={toggleTheme}
                    aria-label="Alternar tema"
                    title="Alternar tema"
                    className="
            flex items-center justify-center
            w-9 h-9
            rounded-md
            border border-border
            bg-muted
            hover:bg-muted/80
            transition
            shrink-0
          "
                >
                    {theme === "dark" ? (
                        <Sun className="w-4 h-4" />
                    ) : (
                        <Moon className="w-4 h-4" />
                    )}
                </button>

            </div>
        </header>
    );
}