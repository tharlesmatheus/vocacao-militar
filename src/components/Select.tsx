'use client'
export default function Select(
    { label, value, onChange, options, placeholder = "Selecione" }:
        { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string }
) {
    return (
        <label className="block">
            <span className="mb-1 block text-sm text-gray-600">{label}</span>
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white p-2 outline-none focus:ring"
            >
                <option value="">{placeholder}</option>
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        </label>
    );
}
