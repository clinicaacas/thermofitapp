import { useEffect, type ReactNode } from "react";
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

const PUBLIC_PATHS = ["/login", "/esqueci-senha", "/reset-password"];

export function AuthGate({ children }: { children?: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { pathname, search } = location;
  const navigate = useNavigate();

  const isPublic = PUBLIC_PATHS.includes(pathname);
  const isClientApp = pathname === "/app" || pathname.startsWith("/app/");
  const isPreviewApp = pathname.startsWith("/preview/app/");

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
      // Admin em /app só é permitido em modo Preview (previewClientId/clientId
      // na querystring). LEITURA CANÔNICA via router (useLocation.search) —
      // nunca window.location.search, que é assíncrono em relação ao
      // TanStack Router e causava falso-negativo que jogava o iframe do
      // Preview no Dashboard administrativo.
      const s = (search ?? {}) as Record<string, unknown>;
      const hasPreview = typeof s.previewClientId === "string" && (s.previewClientId as string).length > 0;
      const hasClient = typeof s.clientId === "string" && (s.clientId as string).length > 0;
      if (!hasPreview && !hasClient) {
        navigate({ to: "/dashboard" });
      }
    }
    // /preview/app/* nunca é redirecionado aqui — a própria rota
    // (preview.app.cliente.$clientId.$) valida sessão administrativa e
    // acesso à cliente server-side antes de renderizar.
    void isPreviewApp;
  }, [user, loading, pathname, search, isPublic, isClientApp, isPreviewApp, navigate]);

  if (loading) return null;
  if (!user && !isPublic) return null;

  return <>{children ?? <Outlet />}</>;
}
