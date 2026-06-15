import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClientAppShell, useAppSettings } from "@/components/client-app-shell";
import { getClientHome } from "@/lib/thermofit-client-app.functions";
import { Droplet, Video, MessageCircle, Award, Camera, BookOpen, HeartPulse, Plane } from "lucide-react";

export const Route = createFileRoute("/app/")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

const modules = [
  { key: "videos", to: "/app/videos", label: "Vídeos", icon: Video },
  { key: "agua", to: "/app/agua", label: "Hidratação", icon: Droplet },
  { key: "premios", to: "/app/premios", label: "Prêmios", icon: Award },
  { key: "falar", to: "/app/falar", label: "Falar com a equipe", icon: MessageCircle },
  { key: "fotos", to: "/app/fotos", label: "Fotos", icon: Camera },
  { key: "pulso", to: "/app/pulso", label: "Pulso", icon: HeartPulse },
  { key: "passaporte", to: "/app/passaporte", label: "Passaporte", icon: Plane },
  { key: "privacidade", to: "/app/privacidade", label: "Privacidade", icon: BookOpen },
] as const;

function Page() {
  const { clientId } = useSearch({ from: "/app/" });
  const fetchHome = useServerFn(getClientHome);
  const { data } = useQuery({
    queryKey: ["client-home", clientId],
    queryFn: () => fetchHome({ data: { clientId } }),
    enabled: !!clientId,
  });
  const { data: settings } = useAppSettings();
  const client = data?.client;
  const enabled = new Set(
    (settings?.modules ?? []).filter((m: any) => m.enabled).map((m: any) => m.key),
  );
  const visible = modules.filter((m) => !settings || enabled.has(m.key));
  const welcome = settings?.settings?.welcome_text;

  return (
    <ClientAppShell title={client?.name ?? "Plano de Voo"} subtitle={client?.plan}>
      <section className="rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 p-4 text-white">
        <p className="text-xs opacity-90">{welcome || "Sua jornada"}</p>
        <h2 className="mt-1 text-xl font-semibold">{client?.goal || "Plano de Voo da Transformação"}</h2>
        <p className="mt-2 text-xs opacity-90">Meta de hidratação: {client?.hydrationGoalMl ?? 2000} ml/dia</p>
      </section>

      <section className="mt-6 grid grid-cols-3 gap-3">
        {visible.map((m) => {
          const Icon = m.icon;
          return (
            <Link
              key={m.to}
              to={m.to}
              search={{ clientId }}
              className="flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-3 text-center text-[11px] font-medium text-slate-700 hover:bg-slate-50"
            >
              <Icon className="h-5 w-5 text-indigo-600" />
              {m.label}
            </Link>
          );
        })}
      </section>
    </ClientAppShell>
  );
}
