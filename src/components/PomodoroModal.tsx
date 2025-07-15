"use client";
import { useState, useRef } from "react";

export function PomodoroModal({ onClose }: { onClose: () => void }) {
    const [seconds, setSeconds] = useState(25 * 60);
    const [isRunning, setIsRunning] = useState(false);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    const start = () => {
        if (isRunning) return;
        setIsRunning(true);
        intervalRef.current = setInterval(() => {
            setSeconds(s => {
                if (s <= 1) {
                    clearInterval(intervalRef.current!);
                    setIsRunning(false);
                    return 25 * 60;
                }
                return s - 1;
            });
        }, 1000);
    };

    const stop = () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setIsRunning(false);
    };

    const reset = () => {
        stop();
        setSeconds(25 * 60);
    };

    const min = String(Math.floor(seconds / 60)).padStart(2, "0");
    const sec = String(seconds % 60).padStart(2, "0");

    return (
        <ModalContainer onClose={onClose}>
            <h3 className="font-bold text-xl mb-6 text-[#23273a] flex items-center gap-2">🍅 Timer Pomodoro</h3>
            <div className="flex flex-col items-center">
                <div className="text-6xl font-extrabold mb-6 text-[#23273a]">{min}:{sec}</div>
                <div className="flex gap-3">
                    <button onClick={start} className="bg-green-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-green-700 transition">Iniciar</button>
                    <button onClick={stop} className="bg-red-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-red-700 transition">Parar</button>
                    <button onClick={reset} className="bg-gray-500 text-white px-6 py-3 rounded-lg font-bold hover:bg-gray-700 transition">Reset</button>
                </div>
            </div>
        </ModalContainer>
    );
}

function ModalContainer({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-lg relative">
                <button className="absolute top-2 right-3 text-2xl text-gray-400 hover:text-gray-600" onClick={onClose}>×</button>
                {children}
            </div>
        </div>
    );
}
