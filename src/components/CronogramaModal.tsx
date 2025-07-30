"use client";

export function CronogramaModal({ onClose }: { onClose: () => void }) {
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-[#23273a] rounded-xl shadow-xl w-full max-w-2xl p-6 relative">
                <button
                    className="absolute top-3 right-4 text-2xl text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    onClick={onClose}
                >
                    &times;
                </button>
                <h3 className="font-bold text-xl mb-6 text-[#23273a] dark:text-white flex items-center gap-2">
                    📅 Cronograma Semanal
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-[#343a4f] dark:border-[#e9edf7] text-sm">
                        <thead>
                            <tr className="bg-[#232939] dark:bg-[#e9edf7]">
                                <th className="border border-[#343a4f] dark:border-[#e9edf7] px-3 py-2 text-white dark:text-[#232939]">Horário</th>
                                <th className="border border-[#343a4f] dark:border-[#e9edf7] px-3 py-2 text-white dark:text-[#232939]">Seg</th>
                                <th className="border border-[#343a4f] dark:border-[#e9edf7] px-3 py-2 text-white dark:text-[#232939]">Ter</th>
                                <th className="border border-[#343a4f] dark:border-[#e9edf7] px-3 py-2 text-white dark:text-[#232939]">Qua</th>
                                <th className="border border-[#343a4f] dark:border-[#e9edf7] px-3 py-2 text-white dark:text-[#232939]">Qui</th>
                                <th className="border border-[#343a4f] dark:border-[#e9edf7] px-3 py-2 text-white dark:text-[#232939]">Sex</th>
                                <th className="border border-[#343a4f] dark:border-[#e9edf7] px-3 py-2 text-white dark:text-[#232939]">Sáb</th>
                                <th className="border border-[#343a4f] dark:border-[#e9edf7] px-3 py-2 text-white dark:text-[#232939]">Dom</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Dados virão do backend futuramente */}
                            <tr>
                                <td className="border border-[#343a4f] dark:border-[#e9edf7] px-2 py-2 text-center text-[#b1bad3] dark:text-[#b1bad3]" colSpan={8}>
                                    Nenhum cronograma cadastrado ainda.
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div className="flex gap-3 mt-6">
                    <button className="bg-white dark:bg-[#232939] text-[#232939] dark:text-white px-6 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-[#181F2C] font-medium border border-[#232939] dark:border-white">
                        ✏️ Editar Cronograma
                    </button>
                    <button className="bg-[#232939] dark:bg-[#e9edf7] text-white dark:text-[#232939] px-6 py-2 rounded-lg hover:bg-[#343a4f] dark:hover:bg-[#dbe5f7] font-medium">
                        📥 Exportar
                    </button>
                </div>
            </div>
        </div>
    );
}
