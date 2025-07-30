import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient"; // ajuste o caminho se necessário

export function Header() {
    const [menuAberto, setMenuAberto] = useState(false);
    const [aluno, setAluno] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    // Buscar nome do aluno ao carregar o componente
    useEffect(() => {
        async function fetchAluno() {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setAluno(
                    user.user_metadata?.nome ||
                    user.user_metadata?.name ||
                    user.email
                );
            }
        }
        fetchAluno();
    }, []);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setMenuAberto(false);
            }
        }
        if (menuAberto) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [menuAberto]);

    async function logout() {
        await supabase.auth.signOut();
        router.push("/auth");
    }

    return (
        <header className="w-full px-4 md:px-8 py-4 border-b border-gray-200 bg-white flex items-center justify-end">
            <div className="flex items-center gap-3 md:gap-6">
                <span className="text-sm md:text-base font-medium text-[#232939]/80 font-sans">
                    {aluno ? `Bem-vindo, ${aluno}!` : "Bem-vindo!"}
                </span>
                <div className="relative" ref={menuRef}>
                    <button
                        className="w-9 h-9 rounded-full bg-[#dde3ef] flex items-center justify-center font-bold text-[#232939] text-base focus:outline-none"
                        onClick={() => setMenuAberto((v) => !v)}
                        aria-haspopup="true"
                        aria-expanded={menuAberto}
                        aria-label="Abrir menu do usuário"
                    >
                        VM
                    </button>
                    {menuAberto && (
                        <div className="absolute right-0 mt-2 w-36 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-2">
                            <button
                                className="w-full text-left px-4 py-2 text-[#232939] hover:bg-gray-100 rounded-lg transition-colors"
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
