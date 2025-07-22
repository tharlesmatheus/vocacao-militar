// src/app/admin/layout.tsx
export default function AdminLayout({ children }: { children: React.ReactNode }) {
    // layout limpo, sem menu/lateral, só renderiza o conteúdo da página
    return <>{children}</>;
}
