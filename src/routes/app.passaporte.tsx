import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClientAppShell } from "@/components/client-app-shell";
import {
  getClientHome,
  getClientMiles,
  listClientMissions,
} from "@/lib/thermofit-client-app.functions";
import { Plane, CheckCircle2, Lock } from "lucide-react";

export const Route = createFileRoute("/app/passaporte")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

type Phase = {
  key: string;
  label: string;
  min: number;
  description: string;
};

const PHASES: Phase[] = [
  { key: "checkin", label: "Check-in", min: 0, description: "Embarque no Plano de Voo." },
  { key: "decolagem", label: "Decolagem", min: 100, description: "Primeiras conquistas no ar." },
  { key: "subida", label: "Subida", min: 300, description: "Ganhando altitude com consistência." },
  { key: "altitude", label: "Altitude", min: 600, description: "Voando firme no seu ritmo." },
  { key: "pontob", label: "Ponto B", min: 1000, description: "Chegada ao destino." },
];

function weeksFrom(startDate?: string | null): number {
  if (!startDate) return 0;
  const start = new Date(startDate).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((Date.now() - start) / (7 * 24 * 60 * 60 * 1000)));
}

function Page() {
  const { clientId } = useSearch({ from: "/app/passaporte" });
  const fetchHome = useServerFn(getClientHome);
  const fetchMiles = useServerFn(getClientMiles);
  const fetchMissions = useServerFn(listClientMissions);

  const { data: homeData } = useQuery({
    queryKey: ["client-home", clientId],
    queryFn: () => fetchHome({ data: { clientId } }),
    enabled: !!clientId,
  });
  const { data: milesData } = useQuery({
    queryKey: ["client-miles", clientId],
    queryFn: () => fetchMiles({ data: { clientId } }),
    enabled: !!clientId,
  });
  const { data: missionsData } = useQuery({
    queryKey: ["client-missions", clientId],
    queryFn: () => fetchMissions({ data: { clientId } }),
    enabled: !!clientId,
  });

  const client = homeData?.client;
  const earned = milesData?.earned ?? 0;
  const balance = milesData?.balance ?? 0;
  const week = weeksFrom(client?.startDate) + 1;
  const missionsDone = (missionsData?.missions ?? []).filter((m: any) => m.completed).length;

  const currentIdx = (() => {
    let idx = 0;
    PHASES.forEach((p, i) => {
      if (earned >= p.min) idx = i;
    });
    return idx;
  })();
  const current = PHASES[currentIdx];
  const next = PHASES[currentIdx + 1];
  const toNext = next ? Math.max(0, next.min - earned) : 0;
  const span = next ? next.min - current.min : 1;
  const pct = next ? Math.min(100, Math.round(((earned - current.min) / span) * 100)) : 100;

  return (
    <ClientAppShell title="Passaporte" subtitle="Sua jornada no Método ThermoFit">
      <div className="space-y-4">
        <div className="rounded-2xl border border-[#E5D6BD] bg-gradient-to-br from-[#F8F1E6] to-[#F3E8D2] p-5 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#8A6A3D] text-white">
            <Plane className="h-6 w-6" />
          </div>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[#7A6A52]">
            Fase atual
          </p>
          <p className="text-xl font-bold text-[#3D2E1C]">{current.label}</p>
          <p className="mt-1 text-xs text-[#7A6A52]">{current.description}</p>

          {next && (
            <div className="mt-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-white">
                <div
                  className="h-full rounded-full bg-[#8A6A3D] transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-[#7A6A52]">
                {toNext} milhas para <span className="font-semibold text-[#5C4528]">{next.label}</span>
              </p>
            </div>
          )}

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Stat label="Milhas totais" value={earned} />
            <Stat label="Saldo" value={balance} />
            <Stat label="Semana" value={week} />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7A6A52]">
            Selos do Plano de Voo
          </p>
          <ul className="space-y-3">
            {PHASES.map((p, i) => {
              const unlocked = i <= currentIdx;
              const isCurrent = i === currentIdx;
              return (
                <li
                  key={p.key}
                  className={`flex items-center gap-3 rounded-2xl border p-3 ${
                    isCurrent
                      ? "border-[#8A6A3D] bg-[#F8F1E6]"
                      : unlocked
                        ? "border-[#E5D6BD] bg-white"
                        : "border-[#EEE2CC] bg-[#FAF5EC] opacity-70"
                  }`}
                >
                  <div
                    className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${
                      unlocked ? "bg-[#8A6A3D] text-white" : "bg-[#E5D6BD] text-[#7A6A52]"
                    }`}
                  >
                    {unlocked ? <CheckCircle2 className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-[#3D2E1C]">{p.label}</p>
                      <span className="text-[10px] font-medium text-[#7A6A52]">
                        {p.min} milhas
                      </span>
                    </div>
                    <p className="text-xs text-[#7A6A52]">{p.description}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-2xl border border-[#E5D6BD] bg-white p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7A6A52]">
            Conquistas de hoje
          </p>
          <p className="text-sm text-[#3D2E1C]">
            {missionsDone > 0
              ? `${missionsDone} missão${missionsDone === 1 ? "" : "es"} concluída${
                  missionsDone === 1 ? "" : "s"
                } hoje.`
              : "Nenhuma missão concluída hoje ainda — bora começar?"}
          </p>
        </div>
      </div>
    </ClientAppShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/70 p-2">
      <p className="text-lg font-bold text-[#3D2E1C]">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-[#7A6A52]">{label}</p>
    </div>
  );
}
