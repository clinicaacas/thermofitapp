import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { dashboardSummary } from "@/lib/thermofit-data.functions";
import { Users, AlertTriangle, CheckSquare } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — ThermoFit" }] }),
  component: Page,
});

function Page() {
  const fetchSummary = useServerFn(dashboardSummary);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => fetchSummary(),
  });

  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground capitalize">{today}</p>
        </header>

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Clientes ativas"
            value={data?.activeClients ?? 0}
            icon={<Users className="h-5 w-5" />}
            loading={isLoading}
          />
          <StatCard
            label="Alertas abertos"
            value={data?.openAlerts ?? 0}
            icon={<AlertTriangle className="h-5 w-5" />}
            loading={isLoading}
          />
          <StatCard
            label="Aprovações pendentes"
            value={data?.pendingApprovals ?? 0}
            icon={<CheckSquare className="h-5 w-5" />}
            loading={isLoading}
          />
        </div>

        <section className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Alertas recentes</h2>
            <Link to="/alertas" className="text-sm text-primary hover:underline">
              Ver todos
            </Link>
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (data?.recentAlerts.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum alerta aberto.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data!.recentAlerts.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {a.clientName || "Sem cliente"} · {a.type}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{a.description}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${severityClass(a.severity)}`}>
                    {a.severity}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  icon,
  loading,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-3xl font-semibold text-foreground">
        {loading ? "—" : value}
      </div>
    </div>
  );
}

function severityClass(s: string) {
  if (s === "alta") return "bg-red-100 text-red-700";
  if (s === "media") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-700";
}
