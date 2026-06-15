import { useEffect, type ReactNode } from "react";
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

const PUBLIC_PATHS = ["/login", "/esqueci-senha", "/setup-admin"];

export function AuthGate({ children }: { children?: ReactNode }) {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const isPublic = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    if (loading) return;
    if (!user && !isPublic) {
      navigate({ to: "/login" });
    } else if (user && isPublic) {
      navigate({ to: "/dashboard" });
    }
  }, [user, loading, pathname, isPublic, navigate]);

  if (loading) return null;
  if (!user && !isPublic) return null;

  return <>{children ?? <Outlet />}</>;
}
