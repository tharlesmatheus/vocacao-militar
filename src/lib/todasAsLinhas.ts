/**
 * O Supabase devolve no máximo 1000 linhas por consulta (max_rows padrão).
 * Para listas que podem passar disso (tentativas de questões, sessões,
 * itens do caderno), buscamos em páginas até acabar.
 *
 * A consulta PRECISA ter .order(...) estável, senão as páginas podem se repetir.
 */
type Resposta<T> = { data: T[] | null; error: { message: string } | null };

export async function todasAsLinhas<T = any>(
    consulta: { range: (de: number, ate: number) => PromiseLike<Resposta<T>> },
    tamanho = 1000,
    maxPaginas = 50
): Promise<Resposta<T>> {
    const todas: T[] = [];
    for (let pagina = 0; pagina < maxPaginas; pagina++) {
        const { data, error } = await consulta.range(pagina * tamanho, (pagina + 1) * tamanho - 1);
        if (error) return { data: pagina === 0 ? null : todas, error };
        const lote = data ?? [];
        todas.push(...lote);
        if (lote.length < tamanho) break;
    }
    return { data: todas, error: null };
}
