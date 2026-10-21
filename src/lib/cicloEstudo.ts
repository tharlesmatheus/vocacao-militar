/*
 * Ciclo de estudos (página /cronograma). Funções puras: o estado fica em
 * cronograma.blocos (jsonb) no formato abaixo; a página só lê, chama estas
 * funções e grava o resultado.
 *
 * O ciclo é uma fila de disciplinas sem data: "Concluir" passa para a próxima;
 * depois da última, volta para a primeira e conta uma volta.
 */

export type Ciclo = {
    version: 5;
    /** Edital (instituição + cargo) usado no "Estudar" para filtrar as questões. */
    instituicao: string | null;
    cargo: string | null;
    materias: string[];
    /** Posição da matéria da vez em `materias`. */
    atual: number;
    voltas: number;
};

export const CICLO_VAZIO: Ciclo = { version: 5, instituicao: null, cargo: null, materias: [], atual: 0, voltas: 0 };

/** Lê o que estiver gravado. Formato antigo (tabela de ciclos) vira ciclo vazio. */
export function lerCiclo(bruto: unknown): Ciclo {
    const r = (bruto ?? {}) as Partial<Ciclo>;
    if (r.version !== 5 || !Array.isArray(r.materias)) return { ...CICLO_VAZIO };
    const materias = r.materias.filter((m): m is string => typeof m === "string" && m.trim() !== "");
    const atual = Number.isInteger(r.atual) ? (r.atual as number) : 0;
    return {
        version: 5,
        instituicao: typeof r.instituicao === "string" ? r.instituicao : null,
        cargo: typeof r.cargo === "string" ? r.cargo : null,
        materias,
        atual: materias.length ? Math.min(Math.max(atual, 0), materias.length - 1) : 0,
        voltas: Number.isInteger(r.voltas) && (r.voltas as number) > 0 ? (r.voltas as number) : 0,
    };
}

/** Matérias na ordem em que vão aparecer, começando pela da vez. */
export function ordemAPartirDaAtual(c: Ciclo): { materia: string; indice: number }[] {
    const n = c.materias.length;
    return Array.from({ length: n }, (_, k) => {
        const indice = (c.atual + k) % n;
        return { materia: c.materias[indice], indice };
    });
}

export function concluir(c: Ciclo): Ciclo {
    if (!c.materias.length) return c;
    const proxima = c.atual + 1;
    return proxima >= c.materias.length ? { ...c, atual: 0, voltas: c.voltas + 1 } : { ...c, atual: proxima };
}

export function definirAtual(c: Ciclo, indice: number): Ciclo {
    if (indice < 0 || indice >= c.materias.length) return c;
    return { ...c, atual: indice };
}

/** Move a matéria do índice `de` uma posição para cima (-1) ou para baixo (+1). A da vez continua a da vez. */
export function mover(c: Ciclo, de: number, passo: -1 | 1): Ciclo {
    const para = de + passo;
    if (de < 0 || para < 0 || para >= c.materias.length) return c;
    const materias = [...c.materias];
    [materias[de], materias[para]] = [materias[para], materias[de]];
    const atual = c.atual === de ? para : c.atual === para ? de : c.atual;
    return { ...c, materias, atual };
}

export function remover(c: Ciclo, indice: number): Ciclo {
    if (indice < 0 || indice >= c.materias.length) return c;
    const materias = c.materias.filter((_, i) => i !== indice);
    let atual = c.atual > indice ? c.atual - 1 : c.atual;
    if (atual >= materias.length) atual = 0;
    return { ...c, materias, atual };
}

export function adicionar(c: Ciclo, materia: string): Ciclo {
    const m = materia.trim();
    if (!m) return c;
    return { ...c, materias: [...c.materias, m] };
}

/**
 * Monta o ciclo pelo edital: disciplinas na ordem do que mais cai no cargo
 * (`pesos` = questões do cargo por disciplina). Zera a posição e as voltas.
 */
export function montarPeloEdital(instituicao: string, cargo: string, pesos: Record<string, number>): Ciclo {
    const materias = Object.entries(pesos)
        .filter(([nome, n]) => nome.trim() && nome !== "Sem disciplina" && n > 0)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
        .map(([nome]) => nome);
    return { version: 5, instituicao, cargo, materias, atual: 0, voltas: 0 };
}

/** Link do "Estudar": questões da matéria, no cargo do edital do ciclo. */
export function linkEstudar(c: Ciclo, materia: string): string {
    const p = new URLSearchParams();
    if (c.instituicao) p.set("instituicao", c.instituicao);
    if (c.cargo) p.set("cargo", c.cargo);
    p.set("disciplina", materia);
    return `/questoes?${p.toString()}`;
}
