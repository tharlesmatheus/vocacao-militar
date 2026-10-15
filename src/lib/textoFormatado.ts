/*
 * Texto com negrito/itálico/sublinhado vindo do acervo (questoes.enunciado_fmt e
 * questoes.alternativas_fmt). O publicador do VM3 grava só <b>, <i> e <u>; todo o
 * resto vem escapado (&lt; &gt; &amp;). Aqui NÃO se usa innerHTML: o texto é
 * quebrado em pedaços e o React monta os elementos, então nada além dessas três
 * marcações vira HTML.
 */

export type Marca = "b" | "i" | "u";
export type Pedaco = { texto: string; marcas: Marca[] };

const ENTIDADES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#x27;": "'", "&#39;": "'" };

function desescapar(t: string): string {
    return t.replace(/&(amp|lt|gt|quot|#x27|#39);/g, (m) => ENTIDADES[m] ?? m);
}

/** Quebra o texto formatado em pedaços com as marcas ativas em cada um. */
export function pedacosFormatados(fmt: string): Pedaco[] {
    const saida: Pedaco[] = [];
    const ativas: Marca[] = [];
    const re = /<(\/?)([biu])>/g;
    let ultimo = 0;
    let m: RegExpExecArray | null;
    const empurrar = (bruto: string) => {
        if (!bruto) return;
        saida.push({ texto: desescapar(bruto), marcas: [...ativas] });
    };
    while ((m = re.exec(fmt))) {
        empurrar(fmt.slice(ultimo, m.index));
        const marca = m[2] as Marca;
        if (m[1]) {
            const i = ativas.lastIndexOf(marca);
            if (i >= 0) ativas.splice(i, 1);
        } else if (!ativas.includes(marca)) {
            ativas.push(marca);
        }
        ultimo = re.lastIndex;
    }
    empurrar(fmt.slice(ultimo));
    return saida;
}

/** Texto puro equivalente (sem as marcas). */
export function textoSemFormatacao(fmt: string): string {
    return pedacosFormatados(fmt).map((p) => p.texto).join("");
}

const NOMES: Record<Marca, string> = { u: "sublinhado", b: "negrito", i: "itálico" };

/**
 * Versão para a IA: cada trecho destacado vira [sublinhado: ...], [negrito: ...]
 * ou [itálico: ...], para a explicação saber de qual palavra a questão fala.
 * Itálico sozinho em trecho longo (citação) é ignorado: é só estilo do texto.
 */
export function paraIA(fmt: string | null | undefined, puro: string | null | undefined): string {
    if (!fmt) return puro ?? "";
    return pedacosFormatados(fmt)
        .map((p) => {
            const marcas = p.marcas.filter((mk) => !(mk === "i" && p.marcas.length === 1 && p.texto.length > 60));
            if (!marcas.length || !p.texto.trim()) return p.texto;
            const ordem = (["u", "b", "i"] as Marca[]).filter((mk) => marcas.includes(mk));
            return `[${ordem.map((mk) => NOMES[mk]).join(" e ")}: ${p.texto}]`;
        })
        .join("");
}
