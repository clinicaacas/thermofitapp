import { createFileRoute } from "@tanstack/react-router";
import { ClientAppShell } from "@/components/client-app-shell";
import { Activity } from "lucide-react";

export const Route = createFileRoute("/app/vacuum")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: () => (
    <ClientAppShell title="Cintura Ativa" subtitle="Core de dentro pra fora — protocolo completo">
      <div
        className="rounded-2xl bg-white p-8 text-center text-sm"
        style={{ border: "1px solid #E5E0D8", color: "#6B7280" }}
      >
        <Activity className="mx-auto mb-2 h-8 w-8" style={{ color: "#C8A15A" }} />
        Protocolo Vacuum em preparação.
        <p className="mt-1 text-xs">Em breve: aba Praticar e Guia Completo.</p>
      </div>
    </ClientAppShell>
  ),
});
