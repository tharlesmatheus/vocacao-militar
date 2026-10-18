/*
 * Regras do edital automático (página /edital). Funções puras, sem banco:
 * recebem o que o RPC edital_progresso devolve e calculam situação e progresso.
 *
 * Um assunto fica DOMINADO quando o aluno respondeu pelo menos META_QUESTOES
 * questões dele (ou todas que existem no acervo, se houver menos) com
 * ACERTO_DOMINIO ou mais de acerto na última resposta de cada questão.
 * Revisão vencida passa na frente: o assunto fica "Revisar" até ela ser feita.
 */

export const META_QUESTOES = 10;
export const ACERTO_DOMINIO = 0.7;

export type AssuntoEdital = {
    disciplina: string;
    assunto: string;
    /** Questões desse assunto no cargo do edital (é o peso do assunto). */
    n_cargo: number;
    /** Questões desse assunto no acervo inteiro (todas as instituições). */
    n_acervo: number;
    /** Questões do assunto que o aluno já respondeu (qualquer instituição). */
    feitas: number;
    /** Dessas, quantas a última resposta foi certa. */
    acertos: number;
    /** Respondidas entre as do próprio cargo. */
    feitas_cargo: number;
    flashcards: number;
    resumos: number;
    revisoes: number;
    revisoes_vencidas: number;
    tempo_seg: number;
    ultima_atividade: string | null;
};

export type DadosEdital = {
    instituicao: string;
    cargo: string;
    assuntos: AssuntoEdital[];
    tempo_disciplina: Record<string, number>;
};

export type Situacao = "nao_iniciado" | "em_estudo" | "revisar" | "dominado";

export const SITUACOES: { id: Situacao; nome: string }[] = [
    { id: "nao_iniciado", nome: "Não iniciado" },
    { id: "em_estudo", nome: "Em estudo" },
    { id: "revisar", nome: "Revisar" },
    { id: "dominado", nome: "Dominado" },
];

export const NOME_SITUACAO: Record<Situacao, string> = Object.fromEntries(
    SITUACOES.map((s) => [s.id, s.nome])
) as Record<Situacao, string>;

/** Quantas questões o assunto pede para ser considerado dominado. */
export function metaDoAssunto(a: Pick<AssuntoEdital, "n_acervo" | "n_cargo">): number {
    const existentes = Math.max(a.n_acervo || 0, a.n_cargo || 0);
    return Math.max(1, Math.min(META_QUESTOES, existentes));
}

export function taxaAcerto(a: Pick<AssuntoEdital, "feitas" | "acertos">): number | null {
    return a.feitas > 0 ? a.acertos / a.feitas : null;
}

/** 0 a 1: quanto do caminho até "dominado" o aluno já fez (volume × acerto). */
export function progressoDoAssunto(a: AssuntoEdital): number {
    if (a.feitas <= 0) return 0;
    const volume = Math.min(a.feitas / metaDoAssunto(a), 1);
    const qualidade = Math.min((a.acertos / a.feitas) / ACERTO_DOMINIO, 1);
    return volume * qualidade;
}

export function situacaoDoAssunto(a: AssuntoEdital): Situacao {
    if (a.revisoes_vencidas > 0) return "revisar";
    const acerto = taxaAcerto(a);
    if (acerto !== null && a.feitas >= metaDoAssunto(a) && acerto >= ACERTO_DOMINIO) return "dominado";
    const mexeu = a.feitas + a.flashcards + a.resumos + a.revisoes > 0 || a.tempo_seg > 0;
    return mexeu ? "em_estudo" : "nao_iniciado";
}

export type ResumoGrupo = {
    /** 0 a 100, ponderado pelo peso (questões no cargo) de cada assunto. */
    progresso: number;
    assuntos: number;
    porSituacao: Record<Situacao, number>;
    questoesCargo: number;
    feitasCargo: number;
    feitas: number;
    acertos: number;
    revisoesVencidas: number;
};

export function resumir(assuntos: AssuntoEdital[]): ResumoGrupo {
    const porSituacao: Record<Situacao, number> = { nao_iniciado: 0, em_estudo: 0, revisar: 0, dominado: 0 };
    let peso = 0;
    let feito = 0;
    let questoesCargo = 0;
    let feitasCargo = 0;
    let feitas = 0;
    let acertos = 0;
    let revisoesVencidas = 0;
    for (const a of assuntos) {
        const p = Math.max(1, a.n_cargo);
        peso += p;
        feito += p * progressoDoAssunto(a);
        porSituacao[situacaoDoAssunto(a)] += 1;
        questoesCargo += a.n_cargo;
        feitasCargo += Math.min(a.feitas_cargo, a.n_cargo);
        feitas += a.feitas;
        acertos += a.acertos;
        revisoesVencidas += a.revisoes_vencidas;
    }
    return {
        progresso: peso ? Math.round((feito / peso) * 100) : 0,
        assuntos: assuntos.length,
        porSituacao,
        questoesCargo,
        feitasCargo,
        feitas,
        acertos,
        revisoesVencidas,
    };
}

export type Disciplina = { nome: string; assuntos: AssuntoEdital[]; resumo: ResumoGrupo; tempoSeg: number };

/** Agrupa por disciplina, as que mais caem primeiro. */
export function porDisciplina(d: DadosEdital): Disciplina[] {
    const grupos = new Map<string, AssuntoEdital[]>();
    for (const a of d.assuntos) grupos.set(a.disciplina, [...(grupos.get(a.disciplina) ?? []), a]);
    return [...grupos.entries()]
        .map(([nome, assuntos]) => ({
            nome,
            assuntos: [...assuntos].sort((x, y) => y.n_cargo - x.n_cargo || x.assunto.localeCompare(y.assunto, "pt-BR")),
            resumo: resumir(assuntos),
            tempoSeg: d.tempo_disciplina?.[nome] ?? 0,
        }))
        .sort((x, y) => y.resumo.questoesCargo - x.resumo.questoesCargo || x.nome.localeCompare(y.nome, "pt-BR"));
}

export function formatarTempo(seg: number): string {
    const min = Math.round(seg / 60);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h}h ${m}min` : `${h}h`;
}

/** Link para resolver questões do assunto ("Geral" = questões sem assunto: filtra só a disciplina). */
export function linkQuestoes(a: Pick<AssuntoEdital, "disciplina" | "assunto">, ed?: { instituicao: string; cargo: string }) {
    const p = new URLSearchParams();
    if (ed) {
        p.set("instituicao", ed.instituicao);
        p.set("cargo", ed.cargo);
    }
    p.set("disciplina", a.disciplina);
    if (a.assunto !== "Geral") p.set("assunto", a.assunto);
    return `/questoes?${p.toString()}`;
}
