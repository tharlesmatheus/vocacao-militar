export function DashboardCards() {
    const items = [
        { title: "Total de Questões", value: "1234" },
        { title: "Respondidas", value: "789" },
        { title: "Taxa de Acerto", value: "86%" },
        { title: "Favoritas", value: "17" },
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-2">
            {items.map((i) => (
                <div
                    key={i.title}
                    className="bg-[#23293a] dark:bg-white rounded-2xl px-9 py-7 shadow-lg border border-[#232939]/40 dark:border-[#e3e8f3] flex flex-col gap-1"
                >
                    <span className="text-[#b1bad3] dark:text-[#a8b1c6] text-base">{i.title}</span>
                    <span className="text-3xl font-extrabold text-white dark:text-[#232939]">{i.value}</span>
                </div>
            ))}
        </div>
    );
}
  