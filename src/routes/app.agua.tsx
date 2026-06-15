import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ClientAppShell } from "@/components/client-app-shell";
import { getClientHome } from "@/lib/thermofit-client-app.functions";
import { Droplet, Plus, Minus } from "lucide-react";

export const Route = createFileRoute("/app/agua")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

function Page() {
  const { clientId } = useSearch({ from: "/app/agua" });
  const fetchHome = useServerFn(getClientHome);
  const { data } = useQuery({
    queryKey: ["client-home", clientId],
    queryFn: () => fetchHome({ data: { clientId } }),
    enabled: !!clientId,
  });
  const goal = data?.client?.hydrationGoalMl ?? 2000;
  const [ml, setMl] = useState(0);
  const pct = Math.min(100, Math.round((ml / goal) * 100));

  return (
    <ClientAppShell title="Hidratação">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <Droplet className="mx-auto h-10 w-10 text-indigo-500" />
        <p className="mt-2 text-3xl font-bold text-slate-800">{ml} <span className="text-base text-slate-500">/ {goal} ml</span></p>
        <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => setMl((v) => Math.max(0, v - 250))}
            className="grid h-12 w-12 place-items-center rounded-full border border-slate-200 text-slate-600"
          >
            <Minus className="h-5 w-5" />
          </button>
          <span className="text-sm text-slate-500">250 ml</span>
          <button
            onClick={() => setMl((v) => v + 250)}
            className="grid h-12 w-12 place-items-center rounded-full bg-indigo-600 text-white"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-4 text-xs text-slate-400">Registro local — persistência completa na próxima fase.</p>
      </div>
    </ClientAppShell>
  );
}
