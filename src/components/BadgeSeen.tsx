export default function BadgeSeen({ count }: { count: number }) {
    const color =
        count === 0 ? 'bg-red-500/10 text-red-700 dark:text-red-300' :
            count < 7 ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-300' :
                'bg-green-500/10 text-green-700 dark:text-green-300';
    return <span className={`rounded px-2 py-0.5 text-xs ${color}`}>{count}x</span>;
}
