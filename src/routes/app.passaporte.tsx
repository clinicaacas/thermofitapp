import { createFileRoute } from "@tanstack/react-router";
import { ClientAppShell } from "@/components/client-app-shell";
import { Plane } from "lucide-react";

export const Route = createFileRoute("/app/passaporte")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: () => (
    <ClientAppShell title="Passaporte de conquistas">
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        <Plane className="mx-auto mb-2 h-8 w-8 text-slate-400" />
        Selos de cada etapa do Plano de Voo — em breve.
      </div>
    </ClientAppShell>
  ),
});
