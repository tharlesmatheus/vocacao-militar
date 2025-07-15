export function QuestionFilters() {
    return (
        <div className="bg-white border border-[#E3E8F3] rounded-2xl shadow-sm p-6 md:p-8 my-2 max-w-full">
            <form className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {[
                    "Instituição",
                    "Cargo",
                    "Disciplina",
                    "Assunto",
                    "Modalidade",
                    "Banca"
                ].map((lbl) => (
                    <div key={lbl}>
                        <label className="block mb-2 text-sm font-medium text-[#425179]">{lbl}</label>
                        <select
                            className="w-full bg-white border border-[#D8DFEA] rounded-lg px-4 py-3 text-[#232939] text-base focus:ring-2 focus:ring-[#6a88d7] outline-none shadow-sm transition"
                            defaultValue=""
                        >
                            <option value="" disabled>Selecione</option>
                        </select>
                    </div>
                ))}

                {/* Excluir Questões */}
                <div className="col-span-full mt-2">
                    <fieldset className="flex items-center gap-4 border border-[#E3E8F3] bg-[#f9fbfd] rounded-xl px-4 py-3">
                        <legend className="text-[#425179] text-sm font-semibold mr-3">
                            Excluir Questões:
                        </legend>
                        <label className="flex items-center gap-2 text-sm font-medium text-[#232939] cursor-pointer select-none">
                            <input
                                type="checkbox"
                                className="form-checkbox accent-[#6a88d7] w-5 h-5 rounded border border-[#D8DFEA] transition"
                            />
                            Já Respondidas
                        </label>
                    </fieldset>
                </div>

                {/* Botões */}
                <div className="col-span-full flex flex-wrap gap-3 mt-4 justify-end">
                    <button
                        type="button"
                        className="bg-[#6a88d7] hover:bg-[#5272b4] text-white font-bold px-6 py-2 rounded-lg border border-[#6a88d7] shadow-sm text-sm transition"
                    >
                        Aplicar Filtros
                    </button>
                    <button
                        type="button"
                        className="bg-white hover:bg-[#f5f7fa] text-[#232939] font-semibold px-6 py-2 rounded-lg border border-[#D8DFEA] shadow-sm text-sm transition"
                    >
                        Limpar Filtros
                    </button>
                </div>
            </form>
        </div>
    );
}
