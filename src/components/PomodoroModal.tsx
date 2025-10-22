"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Phase = "study" | "break";
type Edital = { id: string; nome: string };
type Materia = { id: string; nome: string; edital_id: string };
type Assunto = { id: string; nome: string; materia_id: string; edital_id: string };

const STUDY_SECONDS = 45 * 60;
const BREAK_SECONDS = 5 * 60;
const LS_KEY = "pomodoro_state_v1";

type Persisted = {
    phase: Phase;
    remaining: number;
    isRunning: boolean;
    targetEnd?: number;
    currentSessionId?: string;
    edital_id?: string | null;
    materia_id?: string | null;
    assunto_id?: string | null;
};

function formatClock(s: number) {
    const m = String(Math.floor(s / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    return `${m}:${sec}`;
}
function dispatchMini(text: string | null) {
    window.dispatchEvent(new CustomEvent("pomodoro:mini", { detail: text }));
}

/** ============== SERVIÇO SINGLETON (persiste mesmo com o modal fechado) ============== */
class PomodoroService {
    state: Persisted = {
        phase: "study",
        remaining: STUDY_SECONDS,
        isRunning: false,
    };
    private timer: number | null = null;

    constructor() {
        // carrega estado salvo
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (raw) this.state = { ...this.state, ...(JSON.parse(raw) as Persisted) };
        } catch { }
        // se estava rodando, recalcula remaining e retoma
        if (this.state.isRunning) {
            const now = Date.now();
            const left = Math.max(0, Math.floor(((this.state.targetEnd ?? now) - now) / 1000));
            this.state.remaining = left;
            if (left <= 0) {
                // passou do tempo — comuta uma vez
                this.switchPhaseInternal(true);
            } else {
                this.startTick();
            }
        }
        this.persistAndBroadcast();
    }

    private durationForPhase(p: Phase) {
        return p === "study" ? STUDY_SECONDS : BREAK_SECONDS;
    }

    private persistAndBroadcast() {
        localStorage.setItem(LS_KEY, JSON.stringify(this.state));
        const label = this.state.isRunning ? formatClock(this.state.remaining) : null;
        dispatchMini(label);
        window.dispatchEvent(new CustomEvent("pomodoro:update", { detail: { ...this.state } }));
    }

    private startTick() {
        if (this.timer) return;
        this.timer = window.setInterval(async () => {
            const now = Date.now();
            const left = Math.max(0, Math.floor(((this.state.targetEnd ?? now) - now) / 1000));
            this.state.remaining = left;
            if (left <= 0) {
                await this.onPhaseEnded();
            }
            this.persistAndBroadcast();
        }, 1000);
    }

    private stopTick() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    private async openSession(p: Phase) {
        const { data: { user } } = await supabase.auth.getUser();
        const uid = user?.id;
        if (!uid) return;
        const { data } = await supabase
            .from("pomodoro_sessions")
            .insert({
                user_id: uid,
                phase: p,
                edital_id: this.state.edital_id,
                materia_id: this.state.materia_id,
                assunto_id: this.state.assunto_id,
                started_at: new Date().toISOString(),
            })
            .select("id")
            .single();
        if (data?.id) this.state.currentSessionId = data.id;
    }

    private async closeSession() {
        if (!this.state.currentSessionId) return;
        await supabase
            .from("pomodoro_sessions")
            .update({ ended_at: new Date().toISOString() })
            .eq("id", this.state.currentSessionId);
        this.state.currentSessionId = undefined;
    }

    private async onPhaseEnded() {
        // encerra a fase atual
        await this.closeSession();
        // troca de fase e já inicia a próxima rodando
        await this.switchPhaseInternal(true);
    }

    private async switchPhaseInternal(autorun: boolean) {
        this.state.phase = this.state.phase === "study" ? "break" : "study";
        const dur = this.durationForPhase(this.state.phase);
        this.state.remaining = dur;
        this.state.isRunning = autorun;
        this.state.targetEnd = autorun ? Date.now() + dur * 1000 : undefined;
        if (autorun) {
            await this.openSession(this.state.phase);
            this.startTick();
        } else {
            this.stopTick();
        }
        this.persistAndBroadcast();
    }

    // === Métodos públicos usados pelo modal ===

    selectContext(ids: { edital_id: string; materia_id: string; assunto_id: string }) {
        this.state.edital_id = ids.edital_id;
        this.state.materia_id = ids.materia_id;
        this.state.assunto_id = ids.assunto_id;
        this.persistAndBroadcast();
    }

    async start() {
        if (this.state.isRunning) return;
        this.state.isRunning = true;
        // se não houver targetEnd, cria a partir do remaining
        if (!this.state.targetEnd) this.state.targetEnd = Date.now() + (this.state.remaining || this.durationForPhase(this.state.phase)) * 1000;
        // se não houver sessão aberta, abre
        if (!this.state.currentSessionId) await this.openSession(this.state.phase);
        this.startTick();
        this.persistAndBroadcast();
    }

    pause() {
        this.state.isRunning = false;
        this.state.targetEnd = undefined;
        this.stopTick();
        this.persistAndBroadcast();
    }

    reset() {
        this.state.isRunning = false;
        this.state.remaining = this.durationForPhase(this.state.phase);
        this.state.targetEnd = undefined;
        this.stopTick();
        this.persistAndBroadcast();
    }

    async skip() {
        // fecha fase atual e vai para a próxima já rodando
        await this.closeSession();
        await this.switchPhaseInternal(true);
    }

    async endAll() {
        this.stopTick();
        await this.closeSession();
        this.state = {
            phase: "study",
            remaining: STUDY_SECONDS,
            isRunning: false,
            edital_id: this.state.edital_id,
            materia_id: this.state.materia_id,
            assunto_id: this.state.assunto_id,
        };
        this.persistAndBroadcast();
    }
}

// singleton
let _svc: PomodoroService | null = null;
function service() {
    if (!_svc && typeof window !== "undefined") _svc = new PomodoroService();
    return _svc!;
}
// garante inicialização assim que o arquivo for importado (Header importa este componente)
if (typeof window !== "undefined") service();

/** ============== UI ============== */

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

    const selectBase = "rounded border border-border p-2 bg-input text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-primary/20 w-full";

    useEffect(() => {
        (async () => {
            const uid = (await supabase.auth.getUser()).data.user?.id;
            if (!uid) return;
            const { data: eds } = await supabase
                .from("editais").select("id,nome")
                .eq("user_id", uid).order("created_at", { ascending: false });
            setEditais(eds || []);
        })();
    }, []);

    useEffect(() => {
        (async () => {
            if (!editalId) { setMaterias([]); setAssuntos([]); setMateriaId(""); setAssuntoId(""); return; }
            const uid = (await supabase.auth.getUser()).data.user?.id;
            const { data: mats } = await supabase
                .from("materias").select("id,nome,edital_id")
                .eq("user_id", uid).eq("edital_id", editalId).order("nome");
            setMaterias(mats || []);
            setMateriaId(""); setAssuntoId(""); setAssuntos([]);
        })();
    }, [editalId]);

    useEffect(() => {
        (async () => {
            if (!materiaId) { setAssuntos([]); setAssuntoId(""); return; }
            const uid = (await supabase.auth.getUser()).data.user?.id;
            const { data: ass } = await supabase
                .from("assuntos").select("id,nome,materia_id,edital_id")
                .eq("user_id", uid).eq("materia_id", materiaId).order("nome");
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

export function PomodoroModal({ onClose }: { onClose: () => void }) {
    const svc = service();

    // espelho local só para renderizar
    const [phase, setPhase] = useState<Phase>(svc.state.phase);
    const [remaining, setRemaining] = useState<number>(svc.state.remaining);
    const [isRunning, setIsRunning] = useState<boolean>(svc.state.isRunning);
    const [step, setStep] = useState<"select" | "timer">(
        svc.state.edital_id && svc.state.materia_id && svc.state.assunto_id ? "timer" : "select"
    );

    // acompanha atualizações do serviço
    useEffect(() => {
        const handler = (e: Event) => {
            const st = (e as CustomEvent<Persisted>).detail;
            setPhase(st.phase);
            setRemaining(st.remaining);
            setIsRunning(st.isRunning);
        };
        window.addEventListener("pomodoro:update", handler);
        return () => window.removeEventListener("pomodoro:update", handler);
    }, []);

    const minutes = useMemo(() => String(Math.floor(remaining / 60)).padStart(2, "0"), [remaining]);
    const seconds = useMemo(() => String(remaining % 60).padStart(2, "0"), [remaining]);

    const handleStart = useCallback(async () => { await svc.start(); }, [svc]);
    const handlePause = useCallback(() => { svc.pause(); }, [svc]);
    const handleReset = useCallback(() => { svc.reset(); }, [svc]);
    const handleSkip = useCallback(async () => { await svc.skip(); }, [svc]);
    const handleEnd = useCallback(async () => { await svc.endAll(); }, [svc]);

    return (
        <ModalContainer onClose={onClose}>
            <div className="px-5 py-4 border-b border-border flex items-center justify-between rounded-t-2xl">
                <div className="flex items-center gap-2">
                    <span className="text-xl">🍎</span>
                    <h2 className="text-lg font-semibold">Pomodoro</h2>
                </div>
                <div className="text-sm text-muted-foreground">
                    {phase === "study" ? "Estudo (45 min)" : "Pausa (5 min)"}
                </div>
            </div>

            {step === "select" ? (
                <Selector
                    initial={{
                        edital_id: svc.state.edital_id ?? "",
                        materia_id: svc.state.materia_id ?? "",
                        assunto_id: svc.state.assunto_id ?? "",
                    }}
                    onReady={(sel) => {
                        svc.selectContext(sel);
                        // zera para começar do estudo
                        svc.state.phase = "study";
                        svc.state.remaining = STUDY_SECONDS;
                        svc.state.isRunning = false;
                        svc.state.targetEnd = undefined;
                        localStorage.setItem(LS_KEY, JSON.stringify(svc.state));
                        setStep("timer");
                    }}
                />
            ) : (
                <div className="p-5">
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
                                onClick={handleEnd}
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

                        <p className="mt-4 text-xs text-muted-foreground text-center">
                            O timer continua mesmo se fechar este modal ou recarregar a página.
                        </p>
                    </div>
                </div>
            )}
        </ModalContainer>
    );
}
