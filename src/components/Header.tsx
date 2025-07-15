// src/components/Header.tsx
export function Header() {
    return (
        <header className="w-full px-4 md:px-8 py-4 border-b border-gray-200 bg-white flex items-center justify-between">
            <h1 className="text-lg sm:text-xl md:text-2xl font-extrabold font-sans text-[#232939]">
                Vocação Militar
            </h1>
            <div className="flex items-center gap-3 md:gap-6">
                <span className="text-sm md:text-base font-medium text-[#232939]/80 font-sans">
                    Bem-vindo, Candidato!
                </span>
                {/* Avatar círculo - pode substituir pela imagem depois */}
                <div className="w-9 h-9 rounded-full bg-[#dde3ef] flex items-center justify-center font-bold text-[#232939] text-base">
                    VM
                </div>
            </div>
        </header>
    );
}
