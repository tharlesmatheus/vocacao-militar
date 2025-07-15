// src/app/auth/layout.tsx
import "../globals.css";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
    // Só um div como wrapper!
    return (
        <div className="bg-red-400 min-h-screen flex items-center justify-center">
            {children}
        </div>
    );
}
