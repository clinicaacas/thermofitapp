import { createFileRoute } from "@tanstack/react-router";
import { ClientAppShell } from "@/components/client-app-shell";
import { Target } from "lucide-react";

export const Route = createFileRoute("/app/missoes")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: () => (
    <ClientAppShell title="Missões de hoje" subtitle="0 de 0 concluídas">
      <div
        className="rounded-2xl bg-white p-8 text-center text-sm"
        style={{ border: "1px solid #E5E0D8", color: "#6B7280" }}
      >
        <Target className="mx-auto mb-2 h-8 w-8" style={{ color: "#C8A15A" }} />
        Nenhuma missão programada para hoje.
        <p className="mt-1 text-xs">A equipe Acas preparará sua próxima missão em breve.</p>
      </div>
    </ClientAppShell>
  ),
});
