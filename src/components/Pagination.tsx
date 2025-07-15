interface PaginationProps {
    total: number;
    perPage: number;
    page: number;
    setPage: (n: number) => void;
}

export function Pagination({ total, perPage, page, setPage }: PaginationProps) {
    const pages = Math.ceil(total / perPage);

    if (pages <= 1) return null;

    // Mostra até 5 páginas próximas
    const maxShow = 5;
    let start = Math.max(1, page - Math.floor(maxShow / 2));
    let end = Math.min(pages, start + maxShow - 1);
    if (end - start < maxShow - 1) start = Math.max(1, end - maxShow + 1);

    return (
        <div className="flex justify-center gap-1 mt-7">
            <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="px-3 py-1 rounded-lg border text-xs bg-white text-[#425179] border-[#E3E8F3] disabled:opacity-50"
            >
                Anterior
            </button>
            {[...Array(end - start + 1)].map((_, i) => {
                const p = start + i;
                return (
                    <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`px-3 py-1 rounded-lg border text-xs border-[#E3E8F3]
              ${p === page ? "bg-[#6a88d7] text-white font-bold" : "bg-white text-[#425179] hover:bg-[#f5f7fa]"}
            `}
                    >
                        {p}
                    </button>
                );
            })}
            <button
                onClick={() => setPage(page + 1)}
                disabled={page === pages}
                className="px-3 py-1 rounded-lg border text-xs bg-white text-[#425179] border-[#E3E8F3] disabled:opacity-50"
            >
                Próxima
            </button>
        </div>
    );
}
