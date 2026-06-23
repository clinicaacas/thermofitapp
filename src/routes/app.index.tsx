import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClientAppShell, useEnabledModules } from "@/components/client-app-shell";
import { getClientHome, listClientMissions, getHydrationToday, getClientMiles } from "@/lib/thermofit-client-app.functions";
import { Plane, Droplet, Target, Gift, Camera, HelpCircle, Shield, ChevronRight, Apple, Dumbbell, Mail } from "lucide-react";

export const Route = createFileRoute("/app/")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

const PHASES = ["Check-in", "Decolagem", "Subida", "Altitude", "Ponto B"];
const QUICK: { to: string; label: string; icon: any; moduleKey: string }[] = [
  { to: "/app/nutricao", label: "Nutrição", icon: Apple, moduleKey: "nutricao" },
  { to: "/app/treino", label: "Treino", icon: Dumbbell, moduleKey: "treino" },
  { to: "/app/cartas", label: "Cartas", icon: Mail, moduleKey: "cartas" },
  { to: "/app/premios", label: "Prêmios", icon: Gift, moduleKey: "premios" },
  { to: "/app/fotos", label: "Fotos", icon: Camera, moduleKey: "fotos" },
  { to: "/app/ajuda", label: "Ajuda", icon: HelpCircle, moduleKey: "falar" },
  { to: "/app/privacidade", label: "Privacidade", icon: Shield, moduleKey: "privacidade" },
];

function weekFrom(startDate?: string | null): number {
  if (!startDate) return 1;
  const start = new Date(startDate).getTime();
  if (Number.isNaN(start)) return 1;
  const diff = Date.now() - start;
  return Math.max(1, Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1);
}

function Page() {
  const { clientId } = useSearch({ from: "/app/" });
  const { isEnabled, getLabel } = useEnabledModules(clientId);
  const quickItems = QUICK.filter((m) => isEnabled(m.moduleKey)).map((m) => ({ ...m, label: getLabel(m.moduleKey, m.label) }));
  const fetchHome = useServerFn(getClientHome);
  const fetchMissions = useServerFn(listClientMissions);
  const fetchHydration = useServerFn(getHydrationToday);
  const fetchMiles = useServerFn(getClientMiles);
  const { data } = useQuery({
    queryKey: ["client-home", clientId],
    queryFn: () => fetchHome({ data: { clientId } }),
    enabled: !!clientId,
  });
  const { data: missionsData } = useQuery({
    queryKey: ["client-missions", clientId],
    queryFn: () => fetchMissions({ data: { clientId } }),
    enabled: !!clientId,
  });
  const { data: hydrationData } = useQuery({
    queryKey: ["client-hydration", clientId],
    queryFn: () => fetchHydration({ data: { clientId } }),
    enabled: !!clientId,
  });
  const { data: milesData } = useQuery({
    queryKey: ["client-miles", clientId],
    queryFn: () => fetchMiles({ data: { clientId } }),
    enabled: !!clientId,
  });
  const missions = missionsData?.missions ?? [];
  const missionsDone = missions.filter((m: any) => m.completed).length;
  const missionsTotal = missions.length;
  const client = data?.client;
  const firstName = (client?.name ?? "").split(" ")[0] || "Cliente";
  const week = weekFrom(client?.startDate);
  const miles = milesData?.balance ?? 0;
  const milesNext = miles < 100 ? 100 : miles < 300 ? 300 : miles < 600 ? 600 : miles < 1000 ? 1000 : Math.ceil((miles + 1) / 500) * 500;
  const currentPhase = "Check-in";
  const hydration = hydrationData?.total ?? 0;
  const hydrationGoal = hydrationData?.goal ?? client?.hydrationGoalMl ?? 2000;

  return (
    <ClientAppShell>
      {/* Greeting */}
      <section className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold" style={{ color: "#1F2933" }}>
            Olá, {firstName}
          </h1>
          <p className="mt-0.5 text-[11px] leading-snug" style={{ color: "#6B7280" }}>
            Toda rota tem turbulência. O importante é voltar para o plano de voo.
          </p>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
          style={{ background: "#F3E8D2", color: "#8A6A3D" }}
        >
          Semana {week}
        </span>
      </section>

      {/* Milhas card */}
      <section
        className="mt-3 rounded-2xl bg-white p-3"
        style={{ border: "1px solid #E5E0D8" }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold tracking-wider" style={{ color: "#8A6A3D" }}>
              MILHAS THERMOFIT
            </p>
            <p className="text-[11px]" style={{ color: "#6B7280" }}>
              Jornada da Transformação
            </p>
            <p className="mt-1 text-3xl font-bold leading-none" style={{ color: "#1F2933" }}>
              {miles}
              <span className="ml-1 text-sm font-normal" style={{ color: "#6B7280" }}>
                milhas
              </span>
            </p>
          </div>
          <div
            className="grid h-10 w-10 place-items-center rounded-xl"
            style={{ background: "#F3E8D2" }}
          >
            <Plane className="h-5 w-5" style={{ color: "#8A6A3D" }} />
          </div>
        </div>

        <div className="mt-2.5 flex items-center justify-between text-xs">
          <span className="font-semibold" style={{ color: "#1F2933" }}>
            {currentPhase}
          </span>
          <span style={{ color: "#6B7280" }}>{milesNext - miles} para Decolagem</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "#F3E8D2" }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${(miles / milesNext) * 100}%`, background: "#D6A93F" }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[10px]" style={{ color: "#6B7280" }}>
          {PHASES.map((p) => (
            <span key={p} style={{ color: p === currentPhase ? "#8A6A3D" : "#B7AFA0", fontWeight: p === currentPhase ? 600 : 400 }}>
              {p}
            </span>
          ))}
        </div>
      </section>

      {/* Missões de hoje */}
      <section
        className="mt-2 rounded-2xl bg-white p-3"
        style={{ border: "1px solid #E5E0D8" }}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: "#1F2933" }}>
            Missões de hoje
          </p>
          <Link
            to="/app/missoes"
            search={{ clientId }}
            className="inline-flex items-center gap-0.5 text-xs font-medium"
            style={{ color: "#8A6A3D" }}
          >
            Ver todas <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div
            className="grid h-9 w-9 place-items-center rounded-xl"
            style={{ background: "#F3E8D2" }}
          >
            <Plane className="h-4 w-4" style={{ color: "#8A6A3D" }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: "#1F2933" }}>
              {missionsDone} de {missionsTotal} missões
            </p>
            <p className="text-[11px]" style={{ color: "#6B7280" }}>
              {missionsTotal === 0
                ? "Nenhuma missão programada para hoje."
                : missionsDone === missionsTotal
                  ? "Tudo concluído!"
                  : "Toque em Ver todas para concluir."}
            </p>
          </div>
        </div>
      </section>

      {/* Hidratação */}
      <section
        className="mt-2 rounded-2xl bg-white p-3"
        style={{ border: "1px solid #E5E0D8" }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="grid h-9 w-9 place-items-center rounded-xl"
              style={{ background: "#DCEEFF" }}
            >
              <Droplet className="h-4 w-4" style={{ color: "#2F80ED" }} />
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-wider" style={{ color: "#2F80ED" }}>
                HIDRATAÇÃO
              </p>
              <p className="text-lg font-bold leading-tight" style={{ color: "#1F2933" }}>
                {hydration}ml
              </p>
            </div>
          </div>
          <Link
            to="/app/agua"
            search={{ clientId }}
            className="inline-flex items-center gap-0.5 text-xs font-medium"
            style={{ color: "#2F80ED" }}
          >
            Registrar <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        <p className="mt-1.5 text-[11px]" style={{ color: "#6B7280" }}>
          meta {(hydrationGoal / 1000).toFixed(1).replace(".", ",")}L
        </p>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "#DCEEFF" }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.min(100, (hydration / hydrationGoal) * 100)}%`, background: "#2F80ED" }}
          />
        </div>
      </section>

      {/* Me conta sua jornada */}
      <section
        className="mt-2 rounded-2xl bg-white p-3"
        style={{ border: "1px solid #E5E0D8" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold tracking-wider" style={{ color: "#8A6A3D" }}>
              ME CONTA SUA JORNADA
            </p>
            <p className="mt-0.5 text-sm font-semibold" style={{ color: "#1F2933" }}>
              Como você está hoje?
            </p>
            <Link
              to="/app/ajuda"
              search={{ clientId }}
              className="mt-0.5 inline-flex text-xs font-medium"
              style={{ color: "#8A6A3D" }}
            >
              Registrar agora →
            </Link>
          </div>
          <div
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
            style={{ background: "#F3E8D2" }}
          >
            <Plane className="h-4 w-4" style={{ color: "#8A6A3D" }} />
          </div>
        </div>
      </section>

      {/* Acesso rápido */}
      <p className="mt-3 text-[10px] font-semibold tracking-wider" style={{ color: "#6B7280" }}>
        ACESSO RÁPIDO
      </p>
      <section className="mt-1.5 grid grid-cols-4 gap-1.5">
        {quickItems.map((m) => {
          const Icon = m.icon;
          return (
            <Link
              key={m.to}
              to={m.to as any}
              search={{ clientId } as any}
              className="flex flex-col items-center justify-center gap-0.5 rounded-xl bg-white px-1.5 py-2 text-center text-[11px] font-medium"
              style={{ border: "1px solid #E5E0D8", color: "#1F2933" }}
            >
              <Icon className="h-4 w-4" style={{ color: "#8A6A3D" }} />
              {m.label}
            </Link>
          );
        })}
      </section>
    </ClientAppShell>
  );
}
