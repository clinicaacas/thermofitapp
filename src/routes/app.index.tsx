import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClientAppShell } from "@/components/client-app-shell";
import { getClientHome } from "@/lib/thermofit-client-app.functions";
import { Plane, Droplet, Target, Gift, Camera, HelpCircle, Shield, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/app/")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

const PHASES = ["Check-in", "Decolagem", "Subida", "Altitude", "Ponto B"];
const QUICK = [
  { to: "/app/premios", label: "Prêmios", icon: Gift },
  { to: "/app/fotos", label: "Fotos", icon: Camera },
  { to: "/app/ajuda", label: "Ajuda", icon: HelpCircle },
  { to: "/app/privacidade", label: "Privacidade", icon: Shield },
] as const;

function weekFrom(startDate?: string | null): number {
  if (!startDate) return 1;
  const start = new Date(startDate).getTime();
  if (Number.isNaN(start)) return 1;
  const diff = Date.now() - start;
  return Math.max(1, Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1);
}

function Page() {
  const { clientId } = useSearch({ from: "/app/" });
  const fetchHome = useServerFn(getClientHome);
  const { data } = useQuery({
    queryKey: ["client-home", clientId],
    queryFn: () => fetchHome({ data: { clientId } }),
    enabled: !!clientId,
  });
  const client = data?.client;
  const firstName = (client?.name ?? "").split(" ")[0] || "Cliente";
  const week = weekFrom(client?.startDate);
  const miles = 35;
  const milesNext = 100;
  const currentPhase = "Check-in";
  const hydration = 0;
  const hydrationGoal = client?.hydrationGoalMl ?? 2000;

  return (
    <ClientAppShell>
      {/* Greeting */}
      <section className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold" style={{ color: "#1F2933" }}>
            Olá, {firstName}
          </h1>
          <p className="mt-1 text-xs leading-snug" style={{ color: "#6B7280" }}>
            Toda rota tem turbulência. O importante é voltar para o plano de voo.
          </p>
        </div>
        <span
          className="shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold"
          style={{ background: "#F3E8D2", color: "#8A6A3D" }}
        >
          Semana {week}
        </span>
      </section>

      {/* Milhas card */}
      <section
        className="mt-4 rounded-2xl bg-white p-4"
        style={{ border: "1px solid #E5E0D8" }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold tracking-wider" style={{ color: "#8A6A3D" }}>
              MILHAS THERMOFIT
            </p>
            <p className="text-xs" style={{ color: "#6B7280" }}>
              Jornada da Transformação
            </p>
            <p className="mt-2 text-4xl font-bold leading-none" style={{ color: "#1F2933" }}>
              {miles}
              <span className="ml-1 text-sm font-normal" style={{ color: "#6B7280" }}>
                milhas
              </span>
            </p>
          </div>
          <div
            className="grid h-12 w-12 place-items-center rounded-xl"
            style={{ background: "#F3E8D2" }}
          >
            <Plane className="h-5 w-5" style={{ color: "#8A6A3D" }} />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs">
          <span className="font-semibold" style={{ color: "#1F2933" }}>
            {currentPhase}
          </span>
          <span style={{ color: "#6B7280" }}>{milesNext - miles} para Decolagem</span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full" style={{ background: "#F3E8D2" }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${(miles / milesNext) * 100}%`, background: "#D6A93F" }}
          />
        </div>
        <div className="mt-3 flex justify-between text-[10px]" style={{ color: "#6B7280" }}>
          {PHASES.map((p) => (
            <span key={p} style={{ color: p === currentPhase ? "#8A6A3D" : "#B7AFA0", fontWeight: p === currentPhase ? 600 : 400 }}>
              {p}
            </span>
          ))}
        </div>
      </section>

      {/* Missões de hoje */}
      <section
        className="mt-3 rounded-2xl bg-white p-4"
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
        <div className="mt-3 flex items-center gap-3">
          <div
            className="grid h-10 w-10 place-items-center rounded-xl"
            style={{ background: "#F3E8D2" }}
          >
            <Plane className="h-4 w-4" style={{ color: "#8A6A3D" }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: "#1F2933" }}>
              0 de 0 missões
            </p>
            <p className="text-xs" style={{ color: "#6B7280" }}>
              Nenhuma missão programada para hoje.
            </p>
          </div>
        </div>
      </section>

      {/* Hidratação */}
      <section
        className="mt-3 rounded-2xl bg-white p-4"
        style={{ border: "1px solid #E5E0D8" }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="grid h-10 w-10 place-items-center rounded-xl"
              style={{ background: "#DCEEFF" }}
            >
              <Droplet className="h-4 w-4" style={{ color: "#2F80ED" }} />
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-wider" style={{ color: "#2F80ED" }}>
                HIDRATAÇÃO
              </p>
              <p className="text-xl font-bold" style={{ color: "#1F2933" }}>
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
        <p className="mt-2 text-[11px]" style={{ color: "#6B7280" }}>
          meta {(hydrationGoal / 1000).toFixed(1).replace(".", ",")}L
        </p>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full" style={{ background: "#DCEEFF" }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.min(100, (hydration / hydrationGoal) * 100)}%`, background: "#2F80ED" }}
          />
        </div>
      </section>

      {/* Me conta sua jornada */}
      <section
        className="mt-3 rounded-2xl bg-white p-4"
        style={{ border: "1px solid #E5E0D8" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold tracking-wider" style={{ color: "#8A6A3D" }}>
              ME CONTA SUA JORNADA
            </p>
            <p className="mt-1 text-sm font-semibold" style={{ color: "#1F2933" }}>
              Como você está hoje?
            </p>
            <Link
              to="/app/ajuda"
              search={{ clientId }}
              className="mt-1 inline-flex text-xs font-medium"
              style={{ color: "#8A6A3D" }}
            >
              Registrar agora →
            </Link>
          </div>
          <div
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
            style={{ background: "#F3E8D2" }}
          >
            <Plane className="h-4 w-4" style={{ color: "#8A6A3D" }} />
          </div>
        </div>
      </section>

      {/* Acesso rápido */}
      <p className="mt-5 text-[10px] font-semibold tracking-wider" style={{ color: "#6B7280" }}>
        ACESSO RÁPIDO
      </p>
      <section className="mt-2 grid grid-cols-4 gap-2">
        {QUICK.map((m) => {
          const Icon = m.icon;
          return (
            <Link
              key={m.to}
              to={m.to}
              search={{ clientId }}
              className="flex flex-col items-center justify-center gap-1 rounded-xl bg-white px-2 py-3 text-center text-[11px] font-medium"
              style={{ border: "1px solid #E5E0D8", color: "#1F2933" }}
            >
              <Icon className="h-5 w-5" style={{ color: "#8A6A3D" }} />
              {m.label}
            </Link>
          );
        })}
      </section>
    </ClientAppShell>
  );
}
