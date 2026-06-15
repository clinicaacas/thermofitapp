import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { listClients } from "@/lib/thermofit-data.functions";
import { Plus, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/clientes")({
  head: () => ({ meta: [{ title: "Clientes — ThermoFit" }] }),
  component: Page,
});

function Page() {
  const fetchClients = useServerFn(listClients);
  const { data, isLoading, error } = useQuery({
    queryKey: ["clients"],
    queryFn: () => fetchClients(),
  });

  const clients = data?.clients ?? [];

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Clientes</h1>
            <p className="text-sm text-muted-foreground">
              {clients.length} cliente{clients.length === 1 ? "" : "s"} cadastrada{clients.length === 1 ? "" : "s"}
            </p>
          </div>
          <Link
            to="/clientes/nova"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nova cliente
          </Link>
        </header>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {error && (
          <p className="text-sm text-red-600">Erro ao carregar clientes.</p>
        )}
        {!isLoading && clients.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma cliente cadastrada ainda.</p>
            <Link
              to="/clientes/nova"
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> Cadastrar primeira cliente
            </Link>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {clients.map((c) => {
            const days = Math.max(
              0,
              Math.floor(
                (Date.now() - new Date(c.startDate).getTime()) / (1000 * 60 * 60 * 24),
              ),
            );
            return (
              <Link
                key={c.id}
                to="/clientes/$id"
                params={{ id: c.id }}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/50"
              >
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary font-semibold">
                  {c.avatarInitial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {days} dia{days === 1 ? "" : "s"} de acompanhamento
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                      {c.plan}
                    </span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">
                      {c.status}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
