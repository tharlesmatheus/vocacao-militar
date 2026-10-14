/*
 * Rótulos curtos para exibição. Os nomes completos continuam no banco
 * (são usados em filtros e no catálogo); aqui só encurtamos o que aparece
 * nas etiquetas da questão.
 */

/**
 * "Fundação para o Vestibular da Universidade Estadual Paulista - VUNESP" -> "VUNESP"
 * "Centro de Seleção ... UnB - CESPE/CEBRASPE" -> "CESPE/CEBRASPE"
 * "Instituto AOCP" -> "Instituto AOCP" (sem sigla no fim, mantém)
 */
export function rotuloBanca(nome?: string | null): string {
    const texto = String(nome ?? "").trim();
    const m = texto.match(/-\s*([^-]+?)\s*$/);
    if (!m) return texto;
    const sigla = m[1].trim();
    // Só aceita se parecer sigla: curta e quase toda em maiúsculas.
    const letras = sigla.replace(/[^A-Za-zÀ-ú]/g, "");
    const maiusculas = sigla.replace(/[^A-ZÀ-Ú]/g, "");
    if (sigla.length <= 20 && letras.length >= 2 && maiusculas.length / letras.length >= 0.6) return sigla;
    return texto;
}

/** "multipla escolha" / "Multipla Escolha" -> "Múltipla escolha"; "certo e errado" -> "Certo ou errado". */
export function rotuloModalidade(valor?: string | null): string {
    const texto = String(valor ?? "").trim();
    if (/^m[uú]ltipla\s+escolha$/i.test(texto)) return "Múltipla escolha";
    if (/^certo\s+(e|ou)\s+errado$/i.test(texto)) return "Certo ou errado";
    return texto;
}
