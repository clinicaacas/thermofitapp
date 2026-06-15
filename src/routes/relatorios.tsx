import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { reportsSummary } from "@/lib/thermofit-reports.functions";
import { Users, Bell, MessageSquare, ClipboardCheck } from "lucide-react";

export const Route = createFileRoute("/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — ThermoFit" }] }),
  component: Page,
});

type Range = "7d" | "30d" | "all";
const RANGES: { value: Range; label: string }[] = [
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "all", label: "Todo o período" },
];

function Page() {
  const fetchSummary = useServerFn(reportsSummary);
  const [range, setRange] = useState<Range>("30d");
  const { data, isLoading } = useQuery({
    queryKey: ["reports", range],
    queryFn: () => fetchSummary({ data: { range } }),
  });

  const totals = data?.totals ?? { clients: 0, alerts: 0, messages: 0, approvals: 0 };
  const clients = data?.clients ?? [];

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Relatórios</h1>
            <p className="text-sm text-muted-foreground">Visão consolidada do tenant.</p>
          </div>
          <div className="flex gap-1 rounded-md border border-border bg-card p-1">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={`rounded px-3 py-1.5 text-xs font-medium ${range === r.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </header>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={<Users className="h-5 w-5" />} label="Clientes" value={totals.clients} />
          <StatCard icon={<Bell className="h-5 w-5" />} label="Alertas" value={totals.alerts} />
          <StatCard icon={<MessageSquare className="h-5 w-5" />} label="Mensagens" value={totals.messages} />
          <StatCard icon={<ClipboardCheck className="h-5 w-5" />} label="Aprovações" value={totals.approvals} />
        </div>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Engajamento por cliente</h2>
          {clients.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Nenhuma cliente cadastrada.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Cliente</th>
                    <th className="px-4 py-2 font-medium">Plano</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Início</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c: any) => (
                    <tr key={c.id} className="border-t border-border">
                      <td className="px-4 py-2 font-medium text-foreground">{c.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{c.plan}</td>
                      <td className="px-4 py-2">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700">{c.status}</span>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{c.startDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}
