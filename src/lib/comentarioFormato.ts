/*
 * Organiza o texto do comentário "Por Vocação Militar" em blocos legíveis.
 *
 * Alguns modelos devolvem tudo num parágrafo só ("...sociais. A) Incorreta ... B) ...
 * Ponto-chave: ... Pegadinha: ..."). Aqui cada alternativa vai para a própria linha,
 * "Ponto-chave", "Pegadinha", "Dica" e "Como a banca mudaria" viram parágrafos, e a
 * conclusão ("Portanto, ...") fica antes desses fechos. Não muda nenhuma palavra.
 *
 * Usado na tela (vale para os comentários já gravados) e ao gravar comentários novos.
 * A mesma regra existe no VM3 (comentarios_ia.py, organizar_comentario): mude os dois.
 */

const FECHOS = "Ponto[- ]chave|Pegadinha|Dica|Como a banca mudaria";
/** Fechos que vêm DEPOIS da conclusão ("Como a banca mudaria" fica antes dela). */
const FECHOS_FINAIS = "Ponto[- ]chave|Pegadinha|Dica";
const FIM_DE_FRASE = `[.!?;:)"”'’]`;

export function organizarComentario(texto: string): string {
    let t = String(texto ?? "").replace(/\r\n/g, "\n");

    // Fechos e conclusão em parágrafo próprio.
    t = t.replace(new RegExp(`(${FIM_DE_FRASE})[ \\t]*\\n?[ \\t]*(${FECHOS})\\s*:`, "gi"), "$1\n\n$2:");
    t = t.replace(new RegExp(`(${FIM_DE_FRASE})[ \\t]*\\n?[ \\t]*(Portanto, (?:a alternativa correta|o item está))`, "g"), "$1\n\n$2");

    // Cada alternativa na própria linha ("... sociais. B) Incorreta: ...").
    t = t.replace(new RegExp(`(${FIM_DE_FRASE})[ \\t]+([A-E])\\)[ \\t]+`, "g"), "$1\n$2) ");
    // Linha em branco entre a explicação e a lista de alternativas.
    t = t.replace(/([^\n])\n(A\) )/, "$1\n\n$2");

    // Conclusão antes de Ponto-chave/Pegadinha/Dica.
    const blocos = t.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
    const ehFecho = (b: string) => new RegExp(`^(${FECHOS_FINAIS})\\s*:`, "i").test(b);
    const conclusoes = blocos.filter((b) => /^Portanto,/.test(b));
    if (conclusoes.length) {
        const resto = blocos.filter((b) => !/^Portanto,/.test(b));
        const i = resto.findIndex(ehFecho);
        const pos = i >= 0 ? i : resto.length;
        resto.splice(pos, 0, ...conclusoes);
        return resto.join("\n\n").replace(/[ \t]+\n/g, "\n").trim();
    }
    return blocos.join("\n\n").replace(/[ \t]+\n/g, "\n").trim();
}
