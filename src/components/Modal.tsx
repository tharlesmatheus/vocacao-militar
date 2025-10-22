'use client'
import React from 'react';

export default function Modal(
    { open, onClose, title, children }:
        { open: boolean; onClose: () => void; title: string; children: React.ReactNode }
) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-xl rounded-lg bg-white p-4 shadow-lg">
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-lg font-semibold">{title}</h3>
                    <button onClick={onClose} className="rounded px-2 py-1 text-sm hover:bg-gray-100">✕</button>
                </div>
                {children}
            </div>
        </div>
    );
}
