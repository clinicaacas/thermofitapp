import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { listAlerts, resolveAlert } from "@/lib/thermofit-data.functions";

export const Route = createFileRoute("/alertas")({
  head: () => ({ meta: [{ title: "Alertas — ThermoFit" }] }),
  component: Page,
});

function Page() {
  const fetcher = useServerFn(listAlerts);
  const resolve = useServerFn(resolveAlert);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => fetcher(),
  });

  const alerts = (data?.alerts ?? []).filter((a) => !a.resolvedAt);

  async function handleResolve(id: string) {
    await resolve({ data: { id } });
    await qc.invalidateQueries({ queryKey: ["alerts"] });
    await qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-foreground">Alertas de Turbulência</h1>
          <p className="text-sm text-muted-foreground">Clientes que precisam de atenção da equipe</p>
        </header>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!isLoading && alerts.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Nenhum alerta aberto no momento.
          </div>
        )}

        <ul className="space-y-3">
          {alerts.map((a) => (
            <li key={a.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {a.clientName || "Sem cliente"}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${severityClass(a.severity)}`}>
                      {a.severity}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{a.type}</div>
                  {a.description && <p className="mt-2 text-sm text-foreground">{a.description}</p>}
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    {new Date(a.createdAt).toLocaleString("pt-BR")}
                  </div>
                </div>
                <button
                  onClick={() => handleResolve(a.id)}
                  className="shrink-0 rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent"
                >
                  Marcar como resolvido
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}

function severityClass(s: string) {
  if (s === "alta") return "bg-red-100 text-red-700";
  if (s === "media") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-700";
}
