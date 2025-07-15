"use client";
import React from "react";

type Caderno = { id: string; titulo: string };

type Props = {
    onClose: () => void;
    cadernos?: Caderno[];
};

export function CadernosModal({ onClose, cadernos = [] }: Props) {
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
                    📝 Meus Cadernos
                </h3>
                <ul className="mb-4">
                    {cadernos.length === 0 && (
                        <li className="mb-2 p-3 rounded bg-[#ececec] dark:bg-[#282e3d] text-[#23273a] dark:text-white font-medium opacity-60">
                            Nenhum caderno encontrado
                        </li>
                    )}
                    {cadernos.map((caderno) => (
                        <li key={caderno.id} className="mb-2 p-3 rounded bg-[#f5f6fa] dark:bg-[#282e3d] text-[#23273a] dark:text-white font-medium">
                            {caderno.titulo}
                        </li>
                    ))}
                </ul>
                <button
                    className="w-full bg-[#23273a] dark:bg-white text-white dark:text-[#23273a] font-bold py-3 rounded-lg hover:bg-[#343a4f] dark:hover:bg-[#f3f3ff] transition"
                    onClick={() => alert("Função para criar novo caderno")}
                >
                    + Novo Caderno
                </button>
            </div>
        </div>
    );
}
