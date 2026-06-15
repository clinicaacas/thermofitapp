import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { listApprovals, decideApproval } from "@/lib/thermofit-data.functions";

export const Route = createFileRoute("/aprovacoes")({
  head: () => ({ meta: [{ title: "Aprovações — ThermoFit" }] }),
  component: Page,
});

function Page() {
  const fetcher = useServerFn(listApprovals);
  const decide = useServerFn(decideApproval);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["approvals"], queryFn: () => fetcher() });

  const items = (data?.approvals ?? []).filter((a) => a.status === "pendente");

  async function act(id: string, decision: "aprovada" | "reprovada") {
    await decide({ data: { id, decision, reason: "" } });
    await qc.invalidateQueries({ queryKey: ["approvals"] });
    await qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-foreground">Aprovações</h1>
          <p className="text-sm text-muted-foreground">Fila de aprovações da equipe</p>
        </header>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

        {!isLoading && items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Tudo em dia — nenhuma aprovação pendente.
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((a) => (
              <li key={a.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      {a.clientName || "Sem cliente"} · {a.type}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Criada em {new Date(a.createdAt).toLocaleString("pt-BR")}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => act(a.id, "aprovada")}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                    >
                      Aprovar
                    </button>
                    <button
                      onClick={() => act(a.id, "reprovada")}
                      className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent"
                    >
                      Reprovar
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
