import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useTenant } from "@/lib/tenant-context";
import { useAuth } from "@/lib/auth-context";
import {
  LayoutGrid,
  Users,
  AlertTriangle,
  MessageCircle,
  CheckSquare,
  Video,
  Dumbbell,
  Gift,
  FileText,
  ShieldCheck,
  Settings,
  Flame,
  LogOut,
} from "lucide-react";

const items = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/alertas", label: "Alertas", icon: AlertTriangle },
  { to: "/mensagens", label: "Mensagens", icon: MessageCircle },
  { to: "/aprovacoes", label: "Aprovações", icon: CheckSquare },
  { to: "/videos", label: "Vídeos", icon: Video },
  { to: "/exercicios", label: "Exercícios", icon: Dumbbell },
  { to: "/premios", label: "Prêmios", icon: Gift },
  { to: "/relatorios", label: "Relatórios", icon: FileText },
  { to: "/lgpd", label: "LGPD", icon: ShieldCheck },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { tenant } = useTenant();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const displayName = user?.name ?? tenant.ownerName;
  const displayRole = user
    ? ({ super_admin: "Super Admin", dono: "Dono da Clínica", admin: "Admin da Clínica", equipe: "Equipe" } as const)[user.profile]
    : "Super Admin";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-foreground text-background">
          <Flame className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight">{tenant.systemName}</div>
          <div className="text-xs text-muted-foreground leading-tight">{tenant.systemSubtitle}</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {items.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={[
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-active text-sidebar-active-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-hover",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground text-xs font-semibold">
            {initials || "CA"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{displayName}</div>
            <div className="truncate text-xs text-muted-foreground">{displayRole}</div>
          </div>
          <button
            type="button"
            onClick={() => { signOut(); navigate({ to: "/login" }); }}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-sidebar-hover hover:text-foreground transition-colors"
            aria-label="Sair"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </button>
        </div>
      </div>
    </aside>
  );
}
