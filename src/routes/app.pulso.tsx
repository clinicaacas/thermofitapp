import { createFileRoute } from "@tanstack/react-router";
import { ClientAppShell } from "@/components/client-app-shell";
import { HeartPulse } from "lucide-react";

export const Route = createFileRoute("/app/pulso")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: () => (
    <ClientAppShell title="Pulso semanal">
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        <HeartPulse className="mx-auto mb-2 h-8 w-8 text-slate-400" />
        Um termômetro rápido da sua semana — em breve.
      </div>
    </ClientAppShell>
  ),
});
