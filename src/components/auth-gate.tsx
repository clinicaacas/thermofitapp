import { useEffect, type ReactNode } from "react";
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

const PUBLIC_PATHS = ["/login", "/esqueci-senha", "/reset-password"];

export function AuthGate({ children }: { children?: ReactNode }) {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const isPublic = PUBLIC_PATHS.includes(pathname);
  const isClientApp = pathname === "/app" || pathname.startsWith("/app/");

  useEffect(() => {
    if (loading) return;
    if (!user && !isPublic) {
      navigate({ to: "/login" });
      return;
    }
    if (user && isPublic) {
      navigate({ to: user.kind === "client" ? "/app" : "/dashboard" });
      return;
    }
    if (user?.kind === "client" && !isClientApp) {
      navigate({ to: "/app" });
      return;
    }
    if (user && user.kind !== "client" && isClientApp) {
      // admin/equipe can only stay in /app if explicitly previewing
      const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
      if (!params.get("previewClientId") && !params.get("clientId")) {
        navigate({ to: "/dashboard" });
      }
    }
  }, [user, loading, pathname, isPublic, isClientApp, navigate]);

  if (loading) return null;
  if (!user && !isPublic) return null;

  return <>{children ?? <Outlet />}</>;
}
