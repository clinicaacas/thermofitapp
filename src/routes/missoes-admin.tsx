import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  listMissionsCentral,
  getMissionsOverview,
  listMissionSettings,
  updateMissionSetting,
} from "@/lib/thermofit-missions-admin.functions";
import { listClients } from "@/lib/thermofit-data.functions";
import { Loader2, Filter, Settings as SettingsIcon, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/missoes-admin")({
  head: () => ({ meta: [{ title: "Missões — ThermoFit" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    tab: (s.tab as string) === "configuracoes" ? "configuracoes" : "central",
    clientId: typeof s.clientId === "string" ? s.clientId : "",
    type: typeof s.type === "string" ? s.type : "",
    status: typeof s.status === "string" ? s.status : "",
    date: typeof s.date === "string" ? s.date : "",
  }),
  component: Page,
});

const TYPE_OPTIONS = [
  ["", "Todos os tipos"],
  ["video_complete", "Vídeo"],
  ["post_video_task", "Tarefa pós-vídeo"],
  ["daily_checkin", "Check-in"],
  ["daily_meal", "Alimentação"],
  ["daily_workout", "Treino"],
  ["workout_photo", "Foto do treino"],
  ["hydration_goal", "Hidratação"],
  ["weekly_photo", "Foto de evolução"],
  ["manual", "Missão manual"],
] as const;

const STATUS_OPTIONS = [
  ["", "Todos os status"],
  ["completed", "Concluída"],
  ["pending", "Pendente"],
  ["late", "Atrasada"],
  ["blocked", "Bloqueada"],
] as const;

function Page() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const tab = search.tab;

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Missões</h1>
            <p className="text-sm text-muted-foreground">Central administrativa consolidada</p>
          </div>
          <nav className="flex items-center gap-1 rounded-md border border-input bg-card p-1 text-xs">
            <button
              onClick={() => navigate({ search: (s: any) => ({ ...s, tab: "central" }) })}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 ${tab === "central" ? "bg-accent" : "hover:bg-accent"}`}
            >
              <BarChart3 className="h-3.5 w-3.5" /> Central
            </button>
            <button
              onClick={() => navigate({ search: (s: any) => ({ ...s, tab: "configuracoes" }) })}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 ${tab === "configuracoes" ? "bg-accent" : "hover:bg-accent"}`}
            >
              <SettingsIcon className="h-3.5 w-3.5" /> Configurações
            </button>
          </nav>
        </header>

        {tab === "central" ? <Central /> : <Configuracoes />}
      </div>
    </AppShell>
  );
}

function Central() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const fetchOverview = useServerFn(getMissionsOverview);
  const fetchRows = useServerFn(listMissionsCentral);
  const fetchClients = useServerFn(listClients);

  const overview = useQuery({ queryKey: ["missions-overview"], queryFn: () => fetchOverview() });
  const clients = useQuery({ queryKey: ["clients"], queryFn: () => fetchClients() });
  const rows = useQuery({
    queryKey: ["missions-central", search.clientId, search.type, search.status, search.date],
    queryFn: () => fetchRows({
      data: {
        clientId: search.clientId || null,
        type: search.type || null,
        status: search.status || null,
        from: search.date || undefined,
        to: search.date || undefined,
      },
    }),
  });

  const stats = overview.data;
  const list = rows.data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <KPI label="Jornadas ativas" value={stats?.activeJourneys ?? 0} />
        <KPI label="Missões hoje" value={stats?.missionsToday ?? 0} />
        <KPI label="Concluídas" value={stats?.completedToday ?? 0} />
        <KPI label="Pendentes" value={stats?.pendingToday ?? 0} />
        <KPI label="Milhas hoje" value={stats?.milesToday ?? 0} />
        <KPI label="Baixa adesão" value={stats?.lowAdherence ?? 0} />
      </div>

      <div className="rounded-md border border-input bg-card p-3">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> Filtros
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <select
            value={search.clientId}
            onChange={(e) => navigate({ search: (s: any) => ({ ...s, clientId: e.target.value }) })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Todas as clientes</option>
            {(clients.data?.clients ?? []).map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={search.type}
            onChange={(e) => navigate({ search: (s: any) => ({ ...s, type: e.target.value }) })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {TYPE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select
            value={search.status}
            onChange={(e) => navigate({ search: (s: any) => ({ ...s, status: e.target.value }) })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input
            type="date"
            value={search.date}
            onChange={(e) => navigate({ search: (s: any) => ({ ...s, date: e.target.value }) })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          />
        </div>
      </div>

      <div className="rounded-md border border-input bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <Th>Cliente</Th><Th>Dia</Th><Th>Sem.</Th><Th>Tipo</Th>
                <Th>Missão</Th><Th>Status</Th><Th>Data</Th><Th>Milhas</Th><Th>Origem</Th><Th>{" "}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.isLoading && (
                <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </td></tr>
              )}
              {!rows.isLoading && list.length === 0 && (
                <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">Nenhum registro.</td></tr>
              )}
              {list.map((r) => (
                <tr key={r.refId} className="border-t border-border hover:bg-accent/40">
                  <Td>
                    <Link to="/clientes/$id/missoes" params={{ id: r.clientId }} className="text-primary hover:underline">
                      {r.clientName}
                    </Link>
                  </Td>
                  <Td>{r.journeyDay ?? "—"}</Td>
                  <Td>{r.week ?? "—"}</Td>
                  <Td>{r.typeLabel}</Td>
                  <Td className="max-w-[280px] truncate">{r.title}</Td>
                  <Td><StatusBadge status={r.status} /></Td>
                  <Td>{r.date}</Td>
                  <Td>{r.miles}</Td>
                  <Td><span className="text-xs text-muted-foreground">{r.origin}</span></Td>
                  <Td>
                    <Link to="/clientes/$id/missoes" params={{ id: r.clientId }} className="text-xs text-primary hover:underline">
                      Abrir
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Configuracoes() {
  const fetcher = useServerFn(listMissionSettings);
  const updater = useServerFn(updateMissionSetting);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["mission-settings"], queryFn: () => fetcher() });
  const [edit, setEdit] = useState<Record<string, { label?: string; defaultMiles?: number }>>({});

  async function save(id: string, patch: any) {
    await updater({ data: { id, ...patch } });
    await qc.invalidateQueries({ queryKey: ["mission-settings"] });
    setEdit((p) => ({ ...p, [id]: {} }));
  }

  return (
    <div className="rounded-md border border-input bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr><Th>Tipo</Th><Th>Rótulo</Th><Th>Milhas padrão</Th><Th>Ativo</Th><Th>{" "}</Th></tr>
        </thead>
        <tbody>
          {isLoading && <tr><td colSpan={5} className="p-6 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></td></tr>}
          {(data?.settings ?? []).map((s: any) => {
            const e = edit[s.id] ?? {};
            return (
              <tr key={s.id} className="border-t border-border">
                <Td className="font-mono text-xs">{s.mission_kind}</Td>
                <Td>
                  <input
                    defaultValue={s.label ?? ""}
                    onChange={(ev) => setEdit((p) => ({ ...p, [s.id]: { ...p[s.id], label: ev.target.value } }))}
                    className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
                  />
                </Td>
                <Td>
                  <input
                    type="number" min={0}
                    defaultValue={s.default_miles}
                    onChange={(ev) => setEdit((p) => ({ ...p, [s.id]: { ...p[s.id], defaultMiles: Number(ev.target.value) } }))}
                    className="h-8 w-24 rounded border border-input bg-background px-2 text-sm"
                  />
                </Td>
                <Td>
                  <button
                    onClick={() => save(s.id, { active: !s.active })}
                    className={`rounded px-2 py-1 text-xs ${s.active ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"}`}
                  >
                    {s.active ? "Ativo" : "Inativo"}
                  </button>
                </Td>
                <Td>
                  <button
                    disabled={!e.label && e.defaultMiles === undefined}
                    onClick={() => save(s.id, e)}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
                  >
                    Salvar
                  </button>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-input bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-xl font-semibold">{value}</div>
    </div>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left font-medium">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 align-middle ${className}`}>{children}</td>;
}
function StatusBadge({ status }: { status: string }) {
  const m: Record<string, string> = {
    completed: "bg-green-100 text-green-800",
    pending: "bg-yellow-100 text-yellow-800",
    late: "bg-red-100 text-red-800",
    blocked: "bg-muted text-muted-foreground",
  };
  const l: Record<string, string> = { completed: "Concluída", pending: "Pendente", late: "Atrasada", blocked: "Bloqueada" };
  return <span className={`rounded px-2 py-0.5 text-xs ${m[status] ?? ""}`}>{l[status] ?? status}</span>;
}
