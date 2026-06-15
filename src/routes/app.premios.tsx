import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClientAppShell } from "@/components/client-app-shell";
import { listClientRewards } from "@/lib/thermofit-client-app.functions";
import { Award } from "lucide-react";

export const Route = createFileRoute("/app/premios")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

function Page() {
  const { clientId } = useSearch({ from: "/app/premios" });
  const fetchRewards = useServerFn(listClientRewards);
  const { data, isLoading } = useQuery({
    queryKey: ["client-rewards", clientId],
    queryFn: () => fetchRewards({ data: { clientId } }),
    enabled: !!clientId,
  });
  const rewards = data?.rewards ?? [];

  return (
    <ClientAppShell title="Prêmios">
      {isLoading && <p className="text-sm text-slate-500">Carregando…</p>}
      {!isLoading && rewards.length === 0 && (
        <p className="text-sm text-slate-500">Nenhum prêmio ativo ainda.</p>
      )}
      <ul className="space-y-3">
        {rewards.map((r: any) => (
          <li key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-600">
              <Award className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{r.name}</p>
              <p className="text-xs text-slate-500">{r.miles_cost} milhas · {r.type ?? "—"}</p>
            </div>
            <button className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white">
              Resgatar
            </button>
          </li>
        ))}
      </ul>
    </ClientAppShell>
  );
}
