import type { ReactNode } from "react";
import { Link, useRouterState, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Home, Video, Droplet, MessageCircle, Award } from "lucide-react";
import { getAppSettingsForClient } from "@/lib/thermofit-client-app.functions";

const nav = [
  { to: "/app", key: "inicio", label: "Início", icon: Home },
  { to: "/app/videos", key: "videos", label: "Vídeos", icon: Video },
  { to: "/app/agua", key: "agua", label: "Água", icon: Droplet },
  { to: "/app/premios", key: "premios", label: "Prêmios", icon: Award },
  { to: "/app/falar", key: "falar", label: "Equipe", icon: MessageCircle },
] as const;

export function useAppSettings(clientId?: string) {
  const fetchAll = useServerFn(getAppSettingsForClient);
  return useQuery({
    queryKey: ["app-settings", clientId],
    queryFn: () => fetchAll({ data: { clientId: clientId! } }),
    enabled: !!clientId,
  });
}


export function ClientAppShell({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const search = useSearch({ strict: false }) as { clientId?: string };
  const clientId = search?.clientId;
  const { data } = useAppSettings(clientId);
  const s = data?.settings;
  const modules = data?.modules ?? [];
  const enabledKeys = new Set(modules.filter((m: any) => m.enabled).map((m: any) => m.key));

  const primary = s?.primary_color || "#5b6cff";
  const accent = s?.accent_color || "#7c83ff";

  return (
    <div className="min-h-screen w-full bg-slate-50">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-white shadow-sm">
        <header
          className="sticky top-0 z-10 border-b px-4 py-4 text-white"
          style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}
        >
          <p className="text-xs opacity-80">{s?.app_name ?? "ThermoFit"}</p>
          <h1 className="text-lg font-semibold leading-tight">{title ?? s?.app_subtitle ?? "Início"}</h1>
          {subtitle && <p className="mt-0.5 text-xs opacity-80">{subtitle}</p>}
        </header>

        <main className="flex-1 overflow-y-auto px-4 pb-24 pt-4 text-slate-800">
          {!clientId ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Adicione <code>?clientId=...</code> na URL para abrir como uma cliente.
            </div>
          ) : (
            children
          )}
        </main>

        <nav className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md border-t bg-white">
          <ul className="grid grid-cols-5">
            {nav.map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;
              const disabled = data && !enabledKeys.has(item.key);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    search={(prev: Record<string, unknown>) => prev}
                    disabled={disabled}
                    className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${
                      disabled ? "pointer-events-none opacity-30" : ""
                    }`}
                    style={{ color: active ? primary : "#64748b" }}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
