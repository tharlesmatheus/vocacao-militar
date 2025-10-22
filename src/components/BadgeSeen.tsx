export default function BadgeSeen({ count }: { count: number }) {
    const color =
        count === 0 ? 'bg-red-100 text-red-700' :
            count < 7 ? 'bg-yellow-100 text-yellow-700' :
                'bg-green-100 text-green-700';
    return <span className={`rounded px-2 py-0.5 text-xs ${color}`}>{count}x</span>;
}
