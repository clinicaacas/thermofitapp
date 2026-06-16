import type { ReactNode } from "react";
import { Link, useRouterState, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Home, Video, Droplet, Target, Activity, Bell, Plane } from "lucide-react";
import { getAppSettingsForClient } from "@/lib/thermofit-client-app.functions";

const nav = [
  { to: "/app", key: "inicio", label: "Início", icon: Home },
  { to: "/app/missoes", key: "missoes", label: "Missões", icon: Target },
  { to: "/app/videos", key: "videos", label: "Vídeos", icon: Video },
  { to: "/app/agua", key: "agua", label: "Água", icon: Droplet },
  { to: "/app/vacuum", key: "vacuum", label: "Vacuum", icon: Activity },
] as const;

const PATH_TO_MODULE: Record<string, string> = {
  "/app": "inicio",
  "/app/missoes": "missoes",
  "/app/videos": "videos",
  "/app/agua": "agua",
  "/app/vacuum": "vacuum",
  "/app/nutricao": "nutricao",
  "/app/treino": "treino",
  "/app/cartas": "cartas",
  "/app/premios": "premios",
  "/app/fotos": "fotos",
  "/app/pulso": "pulso",
  "/app/passaporte": "passaporte",
  "/app/ajuda": "falar",
  "/app/falar": "falar",
  "/app/privacidade": "privacidade",
};

export function useAppSettings(clientId?: string) {
  const fetchAll = useServerFn(getAppSettingsForClient);
  return useQuery({
    queryKey: ["app-settings", clientId],
    queryFn: () => fetchAll({ data: { clientId: clientId! } }),
    enabled: !!clientId,
  });
}

export function useEnabledModules(clientId?: string) {
  const { data } = useAppSettings(clientId);
  const map = new Map<string, boolean>();
  for (const m of data?.modules ?? []) map.set(m.key, m.enabled);
  return {
    isEnabled: (key: string) => (map.has(key) ? !!map.get(key) : true),
  };
}

function formatDate() {
  const d = new Date();
  return d.toLocaleDateString("pt-BR");
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
  const { isEnabled } = useEnabledModules(clientId);
  const currentModule = PATH_TO_MODULE[pathname];
  const moduleDisabled = !!currentModule && !isEnabled(currentModule);

  return (
    <div className="min-h-screen w-full" style={{ background: "#F8F1E6" }}>
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col" style={{ background: "#F8F1E6" }}>
        <header
          className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
          style={{ background: "#F8F1E6", borderBottom: "1px solid #E5E0D8" }}
        >
          <div className="flex items-center gap-2">
            <div
              className="grid h-9 w-9 place-items-center rounded-xl"
              style={{ background: "#8A6A3D" }}
            >
              <Plane className="h-4 w-4 text-white" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold" style={{ color: "#8A6A3D" }}>
                ThermoFit
              </p>
              <p className="text-[11px]" style={{ color: "#6B7280" }}>
                {formatDate()}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-full"
            style={{ background: "#FFFFFF", border: "1px solid #E5E0D8" }}
            aria-label="Notificações"
          >
            <Bell className="h-4 w-4" style={{ color: "#8A6A3D" }} />
          </button>
        </header>

        {(title || subtitle) && (
          <div className="px-4 pt-4">
            {title && (
              <h1 className="text-lg font-semibold" style={{ color: "#1F2933" }}>
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs" style={{ color: "#6B7280" }}>
                {subtitle}
              </p>
            )}
          </div>
        )}

        <main className="flex-1 overflow-y-auto px-4 pb-24 pt-4" style={{ color: "#1F2933" }}>
          {!clientId ? (
            <div
              className="rounded-md px-3 py-2 text-sm"
              style={{ background: "#F3E8D2", color: "#8A6A3D", border: "1px solid #E5E0D8" }}
            >
              Adicione <code>?clientId=...</code> na URL para abrir como uma cliente.
            </div>
          ) : moduleDisabled ? (
            <div
              className="rounded-2xl bg-white p-6 text-center text-sm"
              style={{ border: "1px solid #E5E0D8", color: "#6B7280" }}
            >
              Este módulo está desativado para o seu workspace.
            </div>
          ) : (
            children
          )}
        </main>

        <nav
          className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md"
          style={{ background: "#FFFFFF", borderTop: "1px solid #E5E0D8" }}
        >
          <ul className="grid grid-cols-5">
            {nav.map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    search={(prev: Record<string, unknown>) => prev}
                    className="flex flex-col items-center gap-0.5 py-2 text-[11px]"
                    style={{
                      background: active ? "#F3E8D2" : "transparent",
                      color: active ? "#8A6A3D" : "#6B7280",
                      fontWeight: active ? 600 : 400,
                    }}
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
