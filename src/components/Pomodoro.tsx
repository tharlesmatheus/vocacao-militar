"use client";
import { useEffect, useRef, useState } from "react";

export default function Pomodoro({
    study = 30,
    rest = 5,
}: {
    study?: number;
    rest?: number;
}) {
    const [isStudy, setIsStudy] = useState(true);
    const [seconds, setSeconds] = useState(study * 60);
    const [running, setRunning] = useState(false);

    // ✅ inicializa com null e usa o tipo certo
    const timer = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (!running) return;

        timer.current = setInterval(() => {
            setSeconds((s) => {
                if (s > 1) return s - 1;
                // troca fase
                const nextIsStudy = !isStudy;
                setIsStudy(nextIsStudy);
                return (nextIsStudy ? study : rest) * 60;
            });
        }, 1000);

        return () => {
            if (timer.current) {
                clearInterval(timer.current);
                timer.current = null;
            }
        };
    }, [running, isStudy, study, rest]);

    // (opcional) se mudar a duração e o timer estiver parado, já reflete no display
    useEffect(() => {
        if (!running && isStudy) setSeconds(study * 60);
    }, [study, running, isStudy]);
    useEffect(() => {
        if (!running && !isStudy) setSeconds(rest * 60);
    }, [rest, running, isStudy]);

    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");

    const toggle = () => setRunning((r) => !r);
    const reset = () => {
        setRunning(false);
        setIsStudy(true);
        setSeconds(study * 60);
        if (timer.current) {
            clearInterval(timer.current);
            timer.current = null;
        }
    };

    return (
        <div className="rounded-lg border p-3">
            <div className="text-sm text-gray-600">{isStudy ? "Estudo" : "Pausa"}</div>
            <div className="my-2 text-3xl font-semibold tabular-nums">
                {mm}:{ss}
            </div>
            <div className="flex gap-2">
                <button onClick={toggle} className="rounded bg-indigo-600 px-3 py-2 text-white">
                    {running ? "Pausar" : "Play"}
                </button>
                <button onClick={reset} className="rounded bg-gray-200 px-3 py-2">
                    Reset
                </button>
            </div>
        </div>
    );
}
