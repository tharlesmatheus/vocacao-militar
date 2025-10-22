"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Opt = { value: string; label: string };
type EditalRow = { id: string; nome: string };
type MateriaRow = { id: string; nome: string };
type AssuntoRow = { id: string; nome: string };

function renderWithMarks(text: string) {
    // Escapa HTML básico e converte ==grifo== para <mark>
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/==(.+?)==/g, "<mark>$1</mark>")
        .replace(/\n/g, "<br/>");
}

export default function ResumosPage() {
    // opções
    const [editais, setEditais] = useState<Opt[]>([]);
    const [materias, setMaterias] = useState<Opt[]>([]);
    const [assuntos, setAssuntos] = useState<Opt[]>([]);

    // seleção
    const [edital, setEdital] = useState("");
    const [materia, setMateria] = useState("");
    const [assunto, setAssunto] = useState("");

    // form
    const [titulo, setTitulo] = useState("");
    const [conteudo, setConteudo] = useState("");
    const [preview, setPreview] = useState(false);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ t: "ok" | "err"; m: string } | null>(null);

    const textRef = useRef<HTMLTextAreaElement>(null);

    // Carrega editais
    useEffect(() => {
        (async () => {
            const { data, error } = await supabase
                .from("editais")
                .select("id,nome")
                .order("created_at", { ascending: false });
            if (!error && data) {
                setEditais((data as EditalRow[]).map((d) => ({ value: d.id, label: d.nome })));
            }
        })();
    }, []);

    // Carrega matérias ao escolher edital
    useEffect(() => {
        (async () => {
            setMaterias([]);
            setMateria("");
            setAssuntos([]);
            setAssunto("");
            if (!edital) return;
            const { data, error } = await supabase
                .from("materias")
                .select("id,nome")
                .eq("edital_id", edital)
                .order("nome");
            if (!error && data) {
                setMaterias((data as MateriaRow[]).map((d) => ({ value: d.id, label: d.nome })));
            }
        })();
    }, [edital]);

    // Carrega assuntos ao escolher matéria
    useEffect(() => {
        (async () => {
            setAssuntos([]);
            setAssunto("");
            if (!materia) return;
            const { data, error } = await supabase
                .from("assuntos")
                .select("id,nome")
                .eq("materia_id", materia)
                .order("nome");
            if (!error && data) {
                setAssuntos((data as AssuntoRow[]).map((d) => ({ value: d.id, label: d.nome })));
            }
        })();
    }, [materia]);

    // Botão "Grifar seleção"
    const addMark = () => {
        const ta = textRef.current;
        if (!ta) return;
        const { selectionStart: s, selectionEnd: e, value: v } = ta;
        if (s === e) return;
        const marked = v.slice(0, s) + "==" + v.slice(s, e) + "==" + v.slice(e);
        setConteudo(marked);
        setTimeout(() => {
            ta.focus();
            ta.selectionStart = s + 2;
            ta.selectionEnd = e + 2;
        }, 0);
    };

    const canSave = edital && materia && assunto && titulo.trim() && conteudo.trim();

    const salvar = async () => {
        try {
            setSaving(true);
            setMsg(null);
            const uid = (await supabase.auth.getUser()).data.user?.id;
            if (!uid) {
                setMsg({ t: "err", m: "Você precisa estar autenticado." });
                setSaving(false);
                return;
            }
            const { error } = await supabase.from("resumos").insert({
                edital_id: edital,
                materia_id: materia,
                assunto_id: assunto,
                titulo: titulo.trim(),
                conteudo: conteudo,
                user_id: uid,
            });
            if (error) throw error;

            // Limpa formulário
            setTitulo("");
            setConteudo("");
            setMsg({ t: "ok", m: "Resumo salvo! Revisões agendadas automaticamente." });
        } catch (e: any) {
            setMsg({ t: "err", m: e?.message || "Falha ao salvar o resumo." });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="mx-auto max-w-3xl p-4">
            <h1 className="mb-4 text-2xl font-semibold">Resumos</h1>

            {/* Seleções */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="block">
                    <span className="mb-1 block text-sm text-gray-600">Edital</span>
                    <select
                        value={edital}
                        onChange={(e) => setEdital(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white p-2 outline-none focus:ring"
                    >
                        <option value="">Selecione</option>
                        {editais.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="block">
                    <span className="mb-1 block text-sm text-gray-600">Matéria</span>
                    <select
                        value={materia}
                        onChange={(e) => setMateria(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white p-2 outline-none focus:ring"
                        disabled={!edital}
                    >
                        <option value="">{edital ? "Selecione" : "Selecione um edital"}</option>
                        {materias.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="block">
                    <span className="mb-1 block text-sm text-gray-600">Assunto</span>
                    <select
                        value={assunto}
                        onChange={(e) => setAssunto(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white p-2 outline-none focus:ring"
                        disabled={!materia}
                    >
                        <option value="">{materia ? "Selecione" : "Selecione a matéria"}</option>
                        {assuntos.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            {/* Título */}
            <div className="mt-3">
                <input
                    className="w-full rounded border p-2"
                    placeholder="Título do resumo"
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                />
            </div>

            {/* Editor */}
            <div className="mt-3 rounded border">
                <div className="flex items-center justify-between border-b p-2">
                    <div className="text-sm text-gray-600">
                        Dica: use <code>==texto==</code> para <mark>grifar</mark>
                    </div>
                    <div className="flex gap-2">
                        <button
                            className="rounded bg-gray-100 px-2 py-1 text-sm"
                            onClick={addMark}
                            disabled={!conteudo}
                        >
                            Grifar seleção
                        </button>
                        <button
                            className="rounded bg-gray-100 px-2 py-1 text-sm"
                            onClick={() => setPreview((p) => !p)}
                        >
                            {preview ? "Editar" : "Pré-visualizar"}
                        </button>
                    </div>
                </div>

                {!preview ? (
                    <textarea
                        ref={textRef}
                        className="h-64 w-full p-3 outline-none"
                        value={conteudo}
                        onChange={(e) => setConteudo(e.target.value)}
                        placeholder="Escreva seu resumo aqui…"
                    />
                ) : (
                    <div
                        className="prose max-w-none p-3"
                        dangerouslySetInnerHTML={{ __html: renderWithMarks(conteudo) }}
                    />
                )}
            </div>

            {/* Ações */}
            <div className="mt-4 flex items-center justify-between">
                {msg && (
                    <div
                        className={`text-sm ${msg.t === "ok" ? "text-green-700" : "text-red-600"
                            }`}
                    >
                        {msg.m}
                    </div>
                )}

                <button
                    disabled={!!saving || !canSave}
                    onClick={salvar}
                    className="rounded bg-indigo-600 px-3 py-2 text-white disabled:opacity-50"
                >
                    {saving ? "Salvando..." : "Salvar resumo"}
                </button>
            </div>
        </div>
    );
}
