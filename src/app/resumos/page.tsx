'use client'
import { useEffect, useRef, useState } from 'react';
import Select from '@/components/Select';
import { renderWithMarks } from '@/components/Rich';
import { supabase } from '@/lib/supabaseClient';

type Opt = { value: string; label: string };

export default function ResumosPage() {
    const [editais, setEditais] = useState<Opt[]>([]);
    const [materias, setMaterias] = useState<Opt[]>([]);
    const [assuntos, setAssuntos] = useState<Opt[]>([]);
    const [edital, setEdital] = useState(''); const [materia, setMateria] = useState(''); const [assunto, setAssunto] = useState('');
    const [titulo, setTitulo] = useState(''); const [conteudo, setConteudo] = useState('');
    const [preview, setPreview] = useState(false); const [saving, setSaving] = useState(false);
    const textRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        (async () => {
            const { data } = await supabase.from('editais').select('id,nome').order('created_at', { ascending: false });
            setEditais((data || []).map(d => ({ value: d.id, label: d.nome })));
        })()
    }, []);

    useEffect(() => {
        (async () => {
            setMaterias([]); setMateria(''); setAssuntos([]); setAssunto('');
            if (!edital) return;
            const { data } = await supabase.from('materias').select('id,nome').eq('edital_id', edital).order('nome');
            setMaterias((data || []).map(d => ({ value: d.id, label: d.nome })));
        })()
    }, [edital]);

    useEffect(() => {
        (async () => {
            setAssuntos([]); setAssunto('');
            if (!materia) return;
            const { data } = await supabase.from('assuntos').select('id,nome').eq('materia_id', materia).order('nome');
            setAssuntos((data || []).map(d => ({ value: d.id, label: d.nome })));
        })()
    }, [materia]);

    const addMark = () => {
        const ta = textRef.current; if (!ta) return;
        const { selectionStart: s, selectionEnd: e, value: v } = ta;
        if (s === e) return;
        const marked = v.slice(0, s) + '==' + v.slice(s, e) + '==' + v.slice(e);
        setConteudo(marked);
        setTimeout(() => { ta.focus(); ta.selectionStart = s + 2; ta.selectionEnd = e + 2; }, 0);
    };

    const canSave = edital && materia && assunto && titulo && conteudo;

    return (
        <div className="mx-auto max-w-3xl p-4">
            <h1 className="mb-4 text-2xl font-semibold">Resumos</h1>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Select label="Edital" value={edital} onChange={setEdital} options={editais} />
                <Select label="Matéria" value={materia} onChange={setMateria} options={materias} />
                <Select label="Assunto" value={assunto} onChange={setAssunto} options={assuntos} />
            </div>

            <div className="mt-3">
                <input className="w-full rounded border p-2" placeholder="Título do resumo" value={titulo} onChange={e => setTitulo(e.target.value)} />
            </div>

            <div className="mt-3 rounded border">
                <div className="flex items-center justify-between border-b p-2">
                    <div className="text-sm text-gray-600">Use <code>==texto==</code> para grifar</div>
                    <div className="flex gap-2">
                        <button className="rounded bg-gray-100 px-2 py-1 text-sm" onClick={addMark}>Grifar seleção</button>
                        <button className="rounded bg-gray-100 px-2 py-1 text-sm" onClick={() => setPreview(p => !p)}>{preview ? 'Editar' : 'Pré-visualizar'}</button>
                    </div>
                </div>

                {!preview ? (
                    <textarea ref={textRef} className="h-60 w-full p-3 outline-none" value={conteudo} onChange={e => setConteudo(e.target.value)} placeholder="Escreva seu resumo..." />
                ) : (
                    <div className="prose max-w-none p-3" dangerouslySetInnerHTML={{ __html: renderWithMarks(conteudo) }} />
                )}
            </div>

            <div className="mt-4 text-right">
                <button
                    disabled={!!saving || !canSave}
                    onClick={async () => {
                        setSaving(true);
                        const uid = (await supabase.auth.getUser()).data.user?.id;
                        await supabase.from('resumos').insert({
                            edital_id: edital, materia_id: materia, assunto_id: assunto,
                            titulo, conteudo, user_id: uid
                        });
                        setSaving(false);
                        setTitulo(''); setConteudo('');
                    }}
                    className="rounded bg-indigo-600 px-3 py-2 text-white disabled:opacity-50"
                >
                    {saving ? 'Salvando...' : 'Salvar resumo'}
                </button>
            </div>
        </div>
    );
}
