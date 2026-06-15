import type { ReactNode } from "react";
import { Link, useRouterState, useSearch } from "@tanstack/react-router";
import { Home, Video, Droplet, MessageCircle, Award } from "lucide-react";

const nav = [
  { to: "/app", label: "Início", icon: Home },
  { to: "/app/videos", label: "Vídeos", icon: Video },
  { to: "/app/agua", label: "Água", icon: Droplet },
  { to: "/app/premios", label: "Prêmios", icon: Award },
  { to: "/app/falar", label: "Equipe", icon: MessageCircle },
] as const;

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

  return (
    <div className="min-h-screen w-full bg-slate-50">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-white shadow-sm">
        <header className="sticky top-0 z-10 border-b bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-4 text-white">
          <p className="text-xs opacity-80">ThermoFit</p>
          <h1 className="text-lg font-semibold leading-tight">{title ?? "Início"}</h1>
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
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    search={(prev: Record<string, unknown>) => prev}
                    className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${
                      active ? "text-indigo-600" : "text-slate-500"
                    }`}
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
