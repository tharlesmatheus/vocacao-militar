'use client'
import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import BadgeSeen from '@/components/BadgeSeen';
import { supabase } from '@/lib/supabaseClient';

type Edital = { id: string; nome: string };
type Materia = { id: string; nome: string };
type Assunto = { id: string; nome: string; visto_count: number };

export default function EditalPage() {
    const [editais, setEditais] = useState<Edital[]>([]);
    const [selEdital, setSelEdital] = useState('');
    const [materias, setMaterias] = useState<Materia[]>([]);
    const [assuntos, setAssuntos] = useState<Record<string, Assunto[]>>({});
    const [openNovo, setOpenNovo] = useState(false);
    const [openEditar, setOpenEditar] = useState(false);

    useEffect(() => {
        (async () => {
            const { data } = await supabase.from('editais').select('id,nome').order('created_at', { ascending: false });
            setEditais(data || []);
        })()
    }, []);

    useEffect(() => {
        (async () => {
            if (!selEdital) { setMaterias([]); setAssuntos({}); return; }
            const { data: mats } = await supabase.from('materias').select('id,nome').eq('edital_id', selEdital).order('nome');
            setMaterias(mats || []);
            const byMateria: Record<string, Assunto[]> = {};
            for (const m of (mats || [])) {
                const { data: ass } = await supabase
                    .from('assuntos').select('id,nome,visto_count')
                    .eq('materia_id', m.id).order('nome');
                byMateria[m.id] = ass || [];
            }
            setAssuntos(byMateria);
        })()
    }, [selEdital]);

    return (
        <div className="mx-auto max-w-5xl p-4">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-2xl font-semibold">Edital</h1>
                <div className="flex gap-2">
                    <button className="rounded-lg bg-indigo-600 px-3 py-2 text-white" onClick={() => setOpenNovo(true)}>+ Novo Edital</button>
                    <button className="rounded-lg bg-gray-200 px-3 py-2" onClick={() => setOpenEditar(true)}>Editar Matérias/Assuntos</button>
                </div>
            </div>

            <label className="mb-4 block text-sm text-gray-600">
                Selecione um edital
                <select className="mt-1 w-full rounded-lg border p-2" value={selEdital} onChange={e => setSelEdital(e.target.value)}>
                    <option value="">--</option>
                    {editais.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
            </label>

            {!selEdital && <p className="text-gray-500">Escolha um edital para ver matérias e assuntos.</p>}

            {!!selEdital && (
                <div className="space-y-6">
                    {materias.map(m => (
                        <div key={m.id} className="rounded-lg border p-3">
                            <div className="mb-2 text-lg font-medium">{m.nome}</div>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {(assuntos[m.id] || []).map(a => (
                                    <div key={a.id} className="flex items-center justify-between rounded bg-gray-50 p-2">
                                        <span className="truncate">{a.nome}</span>
                                        <div className="flex items-center gap-2">
                                            <span title="vezes visto">👁️</span>
                                            <BadgeSeen count={a.visto_count} />
                                        </div>
                                    </div>
                                ))}
                                {(!assuntos[m.id] || assuntos[m.id].length === 0) && (
                                    <div className="rounded bg-white p-2 text-sm text-gray-400">Sem assuntos ainda.</div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Modal open={openNovo} onClose={() => setOpenNovo(false)} title="Novo Edital">
                <NovoEdital onCreated={async (id) => {
                    setOpenNovo(false);
                    const { data } = await supabase.from('editais').select('id,nome').order('created_at', { ascending: false });
                    setEditais(data || []); setSelEdital(id);
                }} />
            </Modal>

            <Modal open={openEditar} onClose={() => setOpenEditar(false)} title="Editar matérias e assuntos">
                <EditarEstrutura editalId={selEdital} onChanged={async () => {
                    setOpenEditar(false);
                    const { data: mats } = await supabase.from('materias').select('id,nome').eq('edital_id', selEdital).order('nome');
                    setMaterias(mats || []);
                    const byMateria: Record<string, Assunto[]> = {};
                    for (const m of (mats || [])) {
                        const { data: ass } = await supabase.from('assuntos').select('id,nome,visto_count').eq('materia_id', m.id).order('nome');
                        byMateria[m.id] = ass || [];
                    }
                    setAssuntos(byMateria);
                }} />
            </Modal>
        </div>
    );
}

function NovoEdital({ onCreated }: { onCreated: (id: string) => void }) {
    const [nome, setNome] = useState(''); const [loading, setLoading] = useState(false);
    return (
        <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault(); setLoading(true);
            const uid = (await supabase.auth.getUser()).data.user?.id;
            const { data, error } = await supabase.from('editais').insert({ nome, user_id: uid }).select('id').single();
            setLoading(false); if (!error && data) onCreated(data.id);
        }}>
            <input className="w-full rounded border p-2" placeholder="Nome do edital" value={nome} onChange={e => setNome(e.target.value)} required />
            <div className="text-right">
                <button disabled={loading} className="rounded bg-indigo-600 px-3 py-2 text-white">{loading ? 'Salvando...' : 'Salvar'}</button>
            </div>
        </form>
    );
}

function EditarEstrutura({ editalId, onChanged }: { editalId: string; onChanged: () => void }) {
    const [materiaNome, setMateriaNome] = useState('');
    const [assuntoNome, setAssuntoNome] = useState('');
    const [materias, setMaterias] = useState<Materia[]>([]);
    const [selMateria, setSelMateria] = useState('');

    useEffect(() => {
        (async () => {
            if (!editalId) { setMaterias([]); return; }
            const { data } = await supabase.from('materias').select('id,nome').eq('edital_id', editalId).order('nome');
            setMaterias(data || []);
        })()
    }, [editalId]);

    const getUid = async () => (await supabase.auth.getUser()).data.user?.id;

    return (
        <div className="space-y-4">
            {!editalId && <p className="text-sm text-gray-500">Selecione um edital na tela principal.</p>}

            <div className="rounded border p-3">
                <div className="mb-2 font-medium">Adicionar Matéria</div>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <input className="flex-1 rounded border p-2" placeholder="Nome da matéria" value={materiaNome} onChange={e => setMateriaNome(e.target.value)} />
                    <button className="rounded bg-gray-800 px-3 py-2 text-white" onClick={async () => {
                        if (!editalId || !materiaNome) return;
                        await supabase.from('materias').insert({ edital_id: editalId, nome: materiaNome, user_id: await getUid() });
                        setMateriaNome(''); onChanged();
                    }}>Adicionar</button>
                </div>
            </div>

            <div className="rounded border p-3">
                <div className="mb-2 font-medium">Adicionar Assunto</div>
                <div className="mb-2">
                    <select className="w-full rounded border p-2" value={selMateria} onChange={e => setSelMateria(e.target.value)}>
                        <option value="">Selecione a matéria</option>
                        {materias.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                    </select>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <input className="flex-1 rounded border p-2" placeholder="Nome do assunto" value={assuntoNome} onChange={e => setAssuntoNome(e.target.value)} />
                    <button className="rounded bg-gray-800 px-3 py-2 text-white" onClick={async () => {
                        if (!selMateria || !assuntoNome) return;
                        const { data: mat } = await supabase.from('materias').select('edital_id').eq('id', selMateria).single();
                        await supabase.from('assuntos').insert({ materia_id: selMateria, edital_id: mat?.edital_id, nome: assuntoNome, user_id: await getUid() });
                        setAssuntoNome(''); onChanged();
                    }}>Adicionar</button>
                </div>
            </div>
        </div>
    );
}
