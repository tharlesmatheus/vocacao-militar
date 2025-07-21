"use client";
import React, { useState } from "react";
import ClientesList from "./components/ClientesList";
import QuestoesList from "./components/QuestoesList";
import NovoClienteForm from "./components/NovoClienteForm";
import NovaQuestaoForm from "./components/NovaQuestaoForm";
import { User, BookOpen, PlusCircle } from "lucide-react";

export default function AdminDashboard() {
    const [tab, setTab] = useState("clientes");
    return (
        <div className="w-full max-w-6xl mx-auto px-2 py-8">
            <h1 className="text-3xl font-bold mb-8 text-center">Painel Administrativo</h1>
            <div className="flex gap-2 mb-6 justify-center">
                <button onClick={() => setTab("clientes")} className={`px-4 py-2 rounded-full font-bold flex items-center gap-2 ${tab === "clientes" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>
                    <User /> Clientes
                </button>
                <button onClick={() => setTab("questoes")} className={`px-4 py-2 rounded-full font-bold flex items-center gap-2 ${tab === "questoes" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>
                    <BookOpen /> Questões
                </button>
                <button onClick={() => setTab("novo-cliente")} className={`px-4 py-2 rounded-full font-bold flex items-center gap-2 ${tab === "novo-cliente" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>
                    <PlusCircle /> Novo Cliente
                </button>
                <button onClick={() => setTab("nova-questao")} className={`px-4 py-2 rounded-full font-bold flex items-center gap-2 ${tab === "nova-questao" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>
                    <PlusCircle /> Nova Questão
                </button>
            </div>
            {tab === "clientes" && <ClientesList />}
            {tab === "questoes" && <QuestoesList />}
            {tab === "novo-cliente" && <NovoClienteForm />}
            {tab === "nova-questao" && <NovaQuestaoForm />}
        </div>
    );
}
