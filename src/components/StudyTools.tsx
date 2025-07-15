"use client";
import { useState } from "react";
import { PomodoroModal } from "./PomodoroModal";
import { CadernosModal } from "./CadernosModal";
import { CronogramaModal } from "./CronogramaModal";
import { RevisaoModal } from "./RevisaoModal";

export function StudyTools() {
    const [modal, setModal] = useState<null | "pomodoro" | "cadernos" | "cronograma" | "revisao">(null);

    return (
        <>
            <section className="bg-[#202738] dark:bg-white rounded-xl p-4 sm:p-6 mb-8 shadow flex flex-col gap-2 transition-colors">
                <h2 className="font-bold text-lg mb-3 text-white dark:text-[#232939]">Ferramentas de Estudo</h2>
                <div className="flex flex-wrap gap-4">
                    <button onClick={() => setModal("pomodoro")}
                        className="bg-white dark:bg-[#181F2C] dark:text-white text-[#232939] font-semibold rounded-lg px-4 py-2 shadow hover:scale-105 transition flex items-center gap-2">
                        <span>🍅</span> Pomodoro
                    </button>
                    <button onClick={() => setModal("cadernos")}
                        className="bg-white dark:bg-[#181F2C] dark:text-white text-[#232939] font-semibold rounded-lg px-4 py-2 shadow hover:scale-105 transition flex items-center gap-2">
                        <span>📚</span> Meus Cadernos
                    </button>
                    <button onClick={() => setModal("cronograma")}
                        className="bg-white dark:bg-[#181F2C] dark:text-white text-[#232939] font-semibold rounded-lg px-4 py-2 shadow hover:scale-105 transition flex items-center gap-2">
                        <span>📅</span> Meu Cronograma
                    </button>
                    <button onClick={() => setModal("revisao")}
                        className="bg-white dark:bg-[#181F2C] dark:text-white text-[#232939] font-semibold rounded-lg px-4 py-2 shadow hover:scale-105 transition flex items-center gap-2">
                        <span>🔄</span> Revisão Espaçada
                    </button>
                </div>
            </section>

            {modal === "pomodoro" && <PomodoroModal onClose={() => setModal(null)} />}
            {modal === "cadernos" && <CadernosModal onClose={() => setModal(null)} cadernos={[]} />}
            {modal === "cronograma" && <CronogramaModal onClose={() => setModal(null)} />}
            {modal === "revisao" && <RevisaoModal onClose={() => setModal(null)} />}
        </>
    );
}
