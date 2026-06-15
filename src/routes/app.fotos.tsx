import { createFileRoute } from "@tanstack/react-router";
import { ClientAppShell } from "@/components/client-app-shell";
import { Camera } from "lucide-react";

export const Route = createFileRoute("/app/fotos")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: () => (
    <ClientAppShell title="Fotos de evolução">
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        <Camera className="mx-auto mb-2 h-8 w-8 text-slate-400" />
        Em breve você poderá enviar suas fotos quinzenais aqui.
      </div>
    </ClientAppShell>
  ),
});
