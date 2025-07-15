"use client";
export function RevisaoModal({ onClose }: { onClose: () => void }) {
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-[#23273a] rounded-xl shadow-xl w-full max-w-md p-6 relative">
                <button
                    className="absolute top-3 right-4 text-2xl text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    onClick={onClose}
                >
                    &times;
                </button>
                <h3 className="font-bold text-xl mb-6 text-[#23273a] dark:text-white flex items-center gap-2">
                    🔄 Revisão Espaçada
                </h3>
                <ul className="mb-4">
                    <li className="mb-2 p-3 rounded bg-[#ececec] dark:bg-[#282e3d] text-[#23273a] dark:text-white font-medium opacity-60">
                        Nenhuma revisão cadastrada ainda.
                    </li>
                </ul>
                <button className="w-full bg-[#23273a] dark:bg-white text-white dark:text-[#23273a] font-bold py-3 rounded-lg hover:bg-[#343a4f] dark:hover:bg-[#e1e5f0] transition">
                    Iniciar Revisão
                </button>
            </div>
        </div>
    );
}
