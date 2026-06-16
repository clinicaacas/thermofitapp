import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { getClient, adminClientStats } from "@/lib/thermofit-data.functions";
import { ArrowLeft, Edit, KeyRound, Camera, Apple, Dumbbell, Mail, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/clientes/$id")({
  head: () => ({ meta: [{ title: "Perfil da cliente — ThermoFit" }] }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const fetcher = useServerFn(getClient);
  const fetchStats = useServerFn(adminClientStats);
  const { data, isLoading, error } = useQuery({
    queryKey: ["client", id],
    queryFn: () => fetcher({ data: { id } }),
  });
  const { data: stats } = useQuery({
    queryKey: ["client-stats", id],
    queryFn: () => fetchStats({ data: { clientId: id } }),
  });

  if (isLoading) {
    return <AppShell><p className="text-sm text-muted-foreground">Carregando…</p></AppShell>;
  }
  if (error || !data) {
    return <AppShell><p className="text-sm text-red-600">Cliente não encontrada.</p></AppShell>;
  }

  const c = data.client;
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(c.startDate).getTime()) / (1000 * 60 * 60 * 24)),
  );
  const week = Math.floor(days / 7) + 1;

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/clientes" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary text-lg font-semibold">
              {c.avatarInitial}
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">{c.name}</h1>
              <div className="mt-1 flex gap-2 text-xs">
                <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{c.plan}</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">{c.status}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent">
              <Edit className="h-4 w-4" /> Editar
            </button>
            <button className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent">
              <KeyRound className="h-4 w-4" /> Reset senha
            </button>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="Dias" value={days} />
          <Stat label="Semana" value={week} />
          <Stat label="Milhas" value={stats?.miles ?? 0} />
          <Stat label="Missões hoje" value={`${stats?.missionsDoneToday ?? 0}/${stats?.missionsToday ?? 0}`} />
        </div>

        <div className="grid gap-3 sm:grid-cols-5">
          <Action icon={<Camera className="h-4 w-4" />} label="Fotos" />
          <ActionLink to="/clientes/$id/conteudos" params={{ id }} icon={<Apple className="h-4 w-4" />} label="Nutrição" />
          <ActionLink to="/clientes/$id/conteudos" params={{ id }} icon={<Dumbbell className="h-4 w-4" />} label="Treino" />
          <ActionLink to="/clientes/$id/conteudos" params={{ id }} icon={<Mail className="h-4 w-4" />} label="Cartas" />
          <Action icon={<MessageCircle className="h-4 w-4" />} label="WhatsApp" />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Contato">
            <Row label="Email" value={c.email || "—"} />
            <Row label="Telefone" value={c.phone || "—"} />
            <Row label="Nascimento" value={c.birthDate || "—"} />
            <Row label="Início" value={c.startDate} />
          </Card>
          <Card title="Objetivo e queixa">
            <Row label="Objetivo" value={c.goal || "—"} />
            <Row label="Queixa" value={c.complaint || "—"} />
            <Row label="Notas clínicas" value={c.clinicalNotes || "—"} />
            <Row label="Hidratação" value={`${c.hydrationGoalMl} ml/dia`} />
          </Card>
          <Card title="Missões de hoje">
            <p className="text-sm text-muted-foreground">Nenhuma missão atribuída hoje.</p>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function Action({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="flex items-center justify-center gap-2 rounded-md border border-input bg-card px-3 py-3 text-sm hover:bg-accent">
      {icon} {label}
    </button>
  );
}

function ActionLink({
  to,
  params,
  icon,
  label,
}: {
  to: string;
  params: Record<string, string>;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to as any}
      params={params as any}
      className="flex items-center justify-center gap-2 rounded-md border border-input bg-card px-3 py-3 text-sm hover:bg-accent"
    >
      {icon} {label}
    </Link>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-sm">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-foreground">{value}</div>
    </div>
  );
}
