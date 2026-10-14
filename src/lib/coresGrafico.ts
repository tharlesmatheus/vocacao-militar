/*
 * Cores dos gráficos (por disciplina, por fatia). Família fria, alinhada ao
 * azul da marca, distinta o bastante para 12 séries e legível nos dois temas.
 * Verde/vermelho ficam reservados para acerto/erro e não entram aqui.
 */
export const CORES_GRAFICO = [
    "#3b82f6", // azul da marca
    "#22d3ee", // ciano
    "#818cf8", // índigo claro
    "#2dd4bf", // turquesa
    "#60a5fa", // azul claro
    "#a78bfa", // violeta
    "#0ea5e9", // celeste
    "#94a3b8", // cinza azulado
    "#1d4ed8", // azul escuro
    "#67e8f9", // ciano claro
    "#6366f1", // índigo
    "#cbd5e1", // cinza claro
];

export function corGrafico(indice: number) {
    return CORES_GRAFICO[((indice % CORES_GRAFICO.length) + CORES_GRAFICO.length) % CORES_GRAFICO.length];
}

export const COR_ACERTO = "#10b981";
export const COR_ERRO = "#ef4444";
