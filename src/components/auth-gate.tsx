import { useEffect, type ReactNode } from "react";
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

const PUBLIC_PATHS = ["/login", "/esqueci-senha", "/setup-admin"];

export function AuthGate({ children }: { children?: ReactNode }) {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const isPublic = PUBLIC_PATHS.includes(pathname);
  const isChangePwd = pathname === "/trocar-senha";

  useEffect(() => {
    if (loading) return;
    if (!user && !isPublic) {
      navigate({ to: "/login" });
    } else if (user && user.mustChangePassword && !isChangePwd) {
      navigate({ to: "/trocar-senha" });
    } else if (user && !user.mustChangePassword && (isPublic || isChangePwd)) {
      navigate({ to: "/dashboard" });
    }
  }, [user, loading, pathname, isPublic, isChangePwd, navigate]);

  if (loading) return null;
  if (!user && !isPublic) return null;
  if (user && user.mustChangePassword && !isChangePwd) return null;

  return <>{children ?? <Outlet />}</>;
}
