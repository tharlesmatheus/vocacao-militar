"use client";

export function CronogramaModal({ onClose }: { onClose: () => void }) {
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-card rounded-xl shadow-xl w-full max-w-2xl p-6 relative border border-border">
                <button
                    className="absolute top-3 right-4 text-2xl text-muted-foreground hover:text-foreground"
                    onClick={onClose}
                >
                    &times;
                </button>
                <h3 className="font-bold text-xl mb-6 text-foreground flex items-center gap-2">
                    📅 Cronograma Semanal
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-border text-sm">
                        <thead>
                            <tr className="bg-muted">
                                <th className="border border-border px-3 py-2 text-foreground">Horário</th>
                                <th className="border border-border px-3 py-2 text-foreground">Seg</th>
                                <th className="border border-border px-3 py-2 text-foreground">Ter</th>
                                <th className="border border-border px-3 py-2 text-foreground">Qua</th>
                                <th className="border border-border px-3 py-2 text-foreground">Qui</th>
                                <th className="border border-border px-3 py-2 text-foreground">Sex</th>
                                <th className="border border-border px-3 py-2 text-foreground">Sáb</th>
                                <th className="border border-border px-3 py-2 text-foreground">Dom</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Dados virão do backend futuramente */}
                            <tr>
                                <td className="border border-border px-2 py-2 text-center text-muted-foreground" colSpan={8}>
                                    Nenhum cronograma cadastrado ainda.
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div className="flex gap-3 mt-6">
                    <button className="bg-background text-foreground px-6 py-2 rounded-lg hover:bg-muted font-medium border border-border">
                        ✏️ Editar Cronograma
                    </button>
                    <button className="bg-primary text-primary-foreground px-6 py-2 rounded-lg hover:bg-primary/80 font-medium">
                        📥 Exportar
                    </button>
                </div>
            </div>
        </div>
    );
}
