import { createFileRoute } from "@tanstack/react-router";
import { ClientAppShell } from "@/components/client-app-shell";
import { MessageCircle } from "lucide-react";

export const Route = createFileRoute("/app/ajuda")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: () => (
    <ClientAppShell
      title="Falar com a equipe"
      subtitle="A equipe Acas está aqui para você. Não estamos aqui para cobrar — estamos aqui para ajudar."
    >
      <div
        className="rounded-2xl p-4 text-sm"
        style={{ background: "#DBEAFE", color: "#1e3a8a", border: "1px solid #BFDBFE" }}
      >
        <MessageCircle className="mb-1 h-4 w-4" />
        Sua mensagem vai direto para nossa equipe. Respondemos o mais rápido possível.
      </div>
    </ClientAppShell>
  ),
});
