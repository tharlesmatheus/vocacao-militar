"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient"; // ajuste se usar "@/lib/..."

type Phase = "study" | "break";

type Edital = { id: string; nome: string };
type Materia = { id: string; nome: string; edital_id: string };
type Assunto = { id: string; nome: string; materia_id: string; edital_id: string };

const STUDY_SECONDS = 45 * 60;
const BREAK_SECONDS = 5 * 60;

type PersistedState = {
    phase: Phase;
    remaining: number;
    isRunning: boolean;
    targetEnd?: number;             // epoch ms
    currentSessionId?: string;      // registro atual no banco
    edital_id?: string | null;
    materia_id?: string | null;
    assunto_id?: string | null;
};

const LS_KEY = "pomodoro_state_v1";

function saveState(state: PersistedState) {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function loadState(): PersistedState | null {
    try {
        const raw = localStorage.getItem(LS_KEY);
        return raw ? JSON.parse(raw) as PersistedState : null;
    } catch {
        return null;
    }
}

function dispatchMiniBadge(text: string | null) {
    window.dispatchEvent(new CustomEvent("pomodoro:mini", { detail: text }));
}

/** UI: Container do Modal */
function ModalContainer({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center px-4">
            <div className="bg-card text-foreground rounded-2xl border border-border shadow-xl w-full max-w-xl relative">
                <button
                    className="absolute top-2 right-2 rounded p-2 hover:bg-muted text-muted-foreground"
                    onClick={onClose}
                    aria-label="Fechar"
                >
                    ✕
                </button>
                {children}
            </div>
        </div>
    );
}

/** PASSO 1: Seleção (edital → matéria → assunto) */
function Selector({
    onReady,
    initial,
}: {
    onReady: (e: { edital_id: string; materia_id: string; assunto_id: string }) => void;
    initial?: { edital_id?: string | null; materia_id?: string | null; assunto_id?: string | null };
}) {
    const [editais, setEditais] = useState<Edital[]>([]);
    const [materias, setMaterias] = useState<Materia[]>([]);
    const [assuntos, setAssuntos] = useState<Assunto[]>([]);

    const [editalId, setEditalId] = useState(initial?.edital_id || "");
    const [materiaId, setMateriaId] = useState(initial?.materia_id || "");
    const [assuntoId, setAssuntoId] = useState(initial?.assunto_id || "");

    const inputBase = "rounded border border-border p-2 bg-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20";
    const selectBase = "rounded border border-border p-2 bg-input text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-primary/20 w-full";

    useEffect(() => {
        (async () => {
            const uid = (await supabase.auth.getUser()).data.user?.id;
            if (!uid) return;
            const { data: eds } = await supabase
                .from("editais")
                .select("id,nome")
                .eq("user_id", uid)
                .order("created_at", { ascending: false });
            setEditais(eds || []);
        })();
    }, []);

    useEffect(() => {
        (async () => {
            if (!editalId) {
                setMaterias([]); setAssuntos([]); setMateriaId(""); setAssuntoId("");
                return;
            }
            const uid = (await supabase.auth.getUser()).data.user?.id;
            const { data: mats } = await supabase
                .from("materias")
                .select("id,nome,edital_id")
                .eq("user_id", uid)
                .eq("edital_id", editalId)
                .order("nome");
            setMaterias(mats || []);
            setMateriaId(""); setAssuntoId("");
            setAssuntos([]);
        })();
    }, [editalId]);

    useEffect(() => {
        (async () => {
            if (!materiaId) {
                setAssuntos([]); setAssuntoId("");
                return;
            }
            const uid = (await supabase.auth.getUser()).data.user?.id;
            const { data: ass } = await supabase
                .from("assuntos")
                .select("id,nome,materia_id,edital_id")
                .eq("user_id", uid)
                .eq("materia_id", materiaId)
                .order("nome");
            setAssuntos(ass || []);
            setAssuntoId("");
        })();
    }, [materiaId]);

    return (
        <div className="p-5 space-y-4">
            <h3 className="text-lg font-semibold">Selecione para iniciar</h3>

            <label className="block text-sm text-muted-foreground">
                Edital
                <select className={`mt-1 ${selectBase}`} value={editalId} onChange={(e) => setEditalId(e.target.value)}>
                    <option value="">--</option>
                    {editais.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
            </label>

            <label className="block text-sm text-muted-foreground">
                Matéria
                <select className={`mt-1 ${selectBase}`} value={materiaId} onChange={(e) => setMateriaId(e.target.value)} disabled={!editalId}>
                    <option value="">--</option>
                    {materias.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
            </label>

            <label className="block text-sm text-muted-foreground">
                Assunto
                <select className={`mt-1 ${selectBase}`} value={assuntoId} onChange={(e) => setAssuntoId(e.target.value)} disabled={!materiaId}>
                    <option value="">--</option>
                    {assuntos.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
            </label>

            <div className="pt-2 text-right">
                <button
                    onClick={() => onReady({ edital_id: editalId, materia_id: materiaId, assunto_id: assuntoId })}
                    disabled={!editalId || !materiaId || !assuntoId}
                    className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
                >
                    Play
                </button>
            </div>
        </div>
    );
}

/** MODAL PRINCIPAL */
export function PomodoroModal({ onClose }: { onClose: () => void }) {
    const [phase, setPhase] = useState<Phase>("study");
    const [remaining, setRemaining] = useState<number>(STUDY_SECONDS);
    const [isRunning, setIsRunning] = useState(false);
    const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined);
    const [editalId, setEditalId] = useState<string | null>(null);
    const [materiaId, setMateriaId] = useState<string | null>(null);
    const [assuntoId, setAssuntoId] = useState<string | null>(null);
    const [step, setStep] = useState<"select" | "timer">("select");

    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    // carrega estado salvo (inclusive vínculos)
    useEffect(() => {
        const st = loadState();
        if (st) {
            setPhase(st.phase);
            setRemaining(st.remaining ?? (st.phase === "study" ? STUDY_SECONDS : BREAK_SECONDS));
            setIsRunning(st.isRunning);
            setCurrentSessionId(st.currentSessionId);
            if (st.edital_id) setEditalId(st.edital_id);
            if (st.materia_id) setMateriaId(st.materia_id);
            if (st.assunto_id) setAssuntoId(st.assunto_id);
            if (st.edital_id && st.materia_id && st.assunto_id) setStep("timer");

            // se tinha targetEnd, re-calcula remaining (resiliência a refresh)
            if (st.isRunning && st.targetEnd) {
                const now = Date.now();
                const delta = Math.max(0, Math.floor((st.targetEnd - now) / 1000));
                setRemaining(delta);
            }
        }
    }, []);

    // helper — salva no LS e atualiza mini badge
    const persist = useCallback((next: Partial<PersistedState> = {}) => {
        const state: PersistedState = {
            phase,
            remaining,
            isRunning,
            currentSessionId,
            edital_id: editalId,
            materia_id: materiaId,
            assunto_id: assuntoId,
            ...next,
        };
        saveState(state);
        const label = `${state.phase === "study" ? "Estudo" : "Pausa"} ${formatClock(state.remaining ?? remaining)}`;
        dispatchMiniBadge(state.isRunning ? label : null);
    }, [phase, remaining, isRunning, currentSessionId, editalId, materiaId, assuntoId]);

    // formata mm:ss
    const formatClock = (s: number) => {
        const m = String(Math.floor(s / 60)).padStart(2, "0");
        const sec = String(s % 60).padStart(2, "0");
        return `${m}:${sec}`;
    };

    const durationForPhase = useMemo(() => phase === "study" ? STUDY_SECONDS : BREAK_SECONDS, [phase]);

    // cria sessão (insert) ao iniciar fase
    const openSession = useCallback(async (p: Phase) => {
        const { data: { user } } = await supabase.auth.getUser();
        const uid = user?.id;
        if (!uid) return;

        const { data, error } = await supabase
            .from("pomodoro_sessions")
            .insert({
                user_id: uid,
                phase: p,
                edital_id: editalId,
                materia_id: materiaId,
                assunto_id: assuntoId,
                started_at: new Date().toISOString(),
            })
            .select("id")
            .single();

        if (!error && data?.id) {
            setCurrentSessionId(data.id);
            persist({ currentSessionId: data.id });
        }
    }, [editalId, materiaId, assuntoId, persist]);

    // encerra sessão (update ended_at)
    const closeSession = useCallback(async () => {
        if (!currentSessionId) return;
        await supabase
            .from("pomodoro_sessions")
            .update({ ended_at: new Date().toISOString() })
            .eq("id", currentSessionId);
        setCurrentSessionId(undefined);
        persist({ currentSessionId: undefined });
    }, [currentSessionId, persist]);

    // alterna fase automaticamente
    const switchPhase = useCallback(async () => {
        await closeSession();
        const nextPhase: Phase = phase === "study" ? "break" : "study";
        setPhase(nextPhase);
        const nextDur = nextPhase === "study" ? STUDY_SECONDS : BREAK_SECONDS;
        setRemaining(nextDur);
        setIsRunning(true);
        persist({ phase: nextPhase, remaining: nextDur, isRunning: true, targetEnd: Date.now() + nextDur * 1000 });
        await openSession(nextPhase);
    }, [phase, closeSession, persist, openSession]);

    // loop do timer
    const startTicking = useCallback(() => {
        if (intervalRef.current) return;
        intervalRef.current = setInterval(() => {
            setRemaining(prev => {
                if (prev <= 1) {
                    clearInterval(intervalRef.current!);
                    intervalRef.current = null;
                    // terminou a fase → troca
                    switchPhase();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, [switchPhase]);

    const stopTicking = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    // iniciar (play)
    const handleStart = useCallback(async () => {
        if (!editalId || !materiaId || !assuntoId) return;
        if (!isRunning) {
            setIsRunning(true);
            persist({ isRunning: true, targetEnd: Date.now() + remaining * 1000 });
            startTicking();
            // se ainda não existe sessão aberta, abre uma
            if (!currentSessionId) await openSession(phase);
        }
    }, [editalId, materiaId, assuntoId, isRunning, persist, remaining, startTicking, currentSessionId, openSession, phase]);

    const handlePause = useCallback(async () => {
        setIsRunning(false);
        persist({ isRunning: false, targetEnd: undefined });
        stopTicking();
        // não fecha sessão — apenas pausa
    }, [persist, stopTicking]);

    const handleReset = useCallback(async () => {
        stopTicking();
        setIsRunning(false);
        const d = durationForPhase;
        setRemaining(d);
        persist({ isRunning: false, remaining: d, targetEnd: undefined });
    }, [stopTicking, durationForPhase, persist]);

    const handleSkip = useCallback(async () => {
        stopTicking();
        await closeSession(); // fecha fase atual
        await switchPhase();  // e já abre a próxima
    }, [stopTicking, closeSession, switchPhase]);

    const handleEndAll = useCallback(async () => {
        stopTicking();
        await closeSession();
        setIsRunning(false);
        setPhase("study");
        setRemaining(STUDY_SECONDS);
        persist({ isRunning: false, phase: "study", remaining: STUDY_SECONDS, targetEnd: undefined });
        dispatchMiniBadge(null);
    }, [stopTicking, closeSession, persist]);

    // controla intervalo conforme isRunning
    useEffect(() => {
        if (isRunning) startTicking();
        else stopTicking();
        return () => stopTicking();
    }, [isRunning, startTicking, stopTicking]);

    // badge ao fechar modal
    useEffect(() => {
        const label = `${phase === "study" ? "Estudo" : "Pausa"} ${formatClock(remaining)}`;
        dispatchMiniBadge(isRunning ? label : null);
    }, [isRunning, remaining, phase]);

    const minutes = String(Math.floor(remaining / 60)).padStart(2, "0");
    const seconds = String(remaining % 60).padStart(2, "0");

    return (
        <ModalContainer onClose={onClose}>
            {/* Cabeçalho */}
            <div className="px-5 py-4 border-b border-border flex items-center justify-between rounded-t-2xl">
                <div className="flex items-center gap-2">
                    <span className="text-xl">🍅</span>
                    <h2 className="text-lg font-semibold">Pomodoro</h2>
                </div>
                <div className="text-sm text-muted-foreground">
                    {phase === "study" ? "Fase: Estudo (45min)" : "Fase: Pausa (5min)"}
                </div>
            </div>

            {/* Corpo */}
            {step === "select" ? (
                <Selector
                    initial={{ edital_id: editalId, materia_id: materiaId, assunto_id: assuntoId }}
                    onReady={(sel) => {
                        setEditalId(sel.edital_id);
                        setMateriaId(sel.materia_id);
                        setAssuntoId(sel.assunto_id);
                        setPhase("study");
                        setRemaining(STUDY_SECONDS);
                        setIsRunning(false);
                        saveState({
                            phase: "study",
                            remaining: STUDY_SECONDS,
                            isRunning: false,
                            edital_id: sel.edital_id,
                            materia_id: sel.materia_id,
                            assunto_id: sel.assunto_id,
                        });
                        setStep("timer");
                    }}
                />
            ) : (
                <div className="p-5">
                    {/* Chips de contexto */}
                    <div className="flex flex-wrap gap-2 mb-4">
                        {editalId && (
                            <span className="text-xs px-2 py-1 rounded-full border border-border bg-muted">Edital: {editalId.slice(0, 8)}…</span>
                        )}
                        {materiaId && (
                            <span className="text-xs px-2 py-1 rounded-full border border-border bg-muted">Matéria: {materiaId.slice(0, 8)}…</span>
                        )}
                        {assuntoId && (
                            <span className="text-xs px-2 py-1 rounded-full border border-border bg-muted">Assunto: {assuntoId.slice(0, 8)}…</span>
                        )}
                    </div>

                    {/* Relógio */}
                    <div className="flex flex-col items-center">
                        <div className="text-6xl font-extrabold mb-6">
                            {minutes}:{seconds}
                        </div>

                        {/* Controles */}
                        <div className="flex flex-wrap gap-2 justify-center">
                            {!isRunning ? (
                                <button
                                    onClick={handleStart}
                                    className="bg-green-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-green-700 transition"
                                >
                                    Iniciar
                                </button>
                            ) : (
                                <button
                                    onClick={handlePause}
                                    className="bg-amber-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-amber-700 transition"
                                >
                                    Pausar
                                </button>
                            )}

                            <button
                                onClick={handleReset}
                                className="bg-gray-500 text-white px-5 py-2 rounded-lg font-semibold hover:bg-gray-600 transition"
                            >
                                Reset
                            </button>

                            <button
                                onClick={handleSkip}
                                className="bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-blue-700 transition"
                                title="Pular para a próxima fase"
                            >
                                Pular fase
                            </button>

                            <button
                                onClick={handleEndAll}
                                className="bg-red-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-red-700 transition"
                                title="Encerrar o ciclo atual"
                            >
                                Encerrar
                            </button>

                            <button
                                onClick={() => setStep("select")}
                                className="px-5 py-2 rounded-lg border border-border font-semibold hover:bg-muted transition"
                                title="Trocar matéria/assunto"
                            >
                                Trocar seleção
                            </button>
                        </div>

                        {/* Dica responsiva */}
                        <p className="mt-4 text-xs text-muted-foreground text-center">
                            O timer continua mesmo se fechar este modal ou recarregar a página.
                        </p>
                    </div>
                </div>
            )}
        </ModalContainer>
    );
}
