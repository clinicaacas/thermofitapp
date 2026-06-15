import { useEffect, type ReactNode } from "react";
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";

const PUBLIC_PATHS = ["/login", "/esqueci-senha", "/setup-admin"];

export function AuthGate({ children }: { children?: ReactNode }) {
  const { user, loading } = useAuth();
  const { tenant } = useTenant();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const isPublic = PUBLIC_PATHS.includes(pathname);
  const isChangePwd = pathname === "/trocar-senha";
  const isSetup = pathname === "/setup-admin";
  const hasUsers = tenant.team.length > 0;

  useEffect(() => {
    if (loading) return;
    // No users yet → force setup
    if (!hasUsers) {
      if (!isSetup) navigate({ to: "/setup-admin" });
      return;
    }
    if (!user && !isPublic) {
      navigate({ to: "/login" });
    } else if (user && user.mustChangePassword && !isChangePwd) {
      navigate({ to: "/trocar-senha" });
    } else if (user && !user.mustChangePassword && (isPublic || isChangePwd)) {
      navigate({ to: "/dashboard" });
    }
  }, [user, loading, pathname, isPublic, isChangePwd, isSetup, hasUsers, navigate]);

  if (loading) return null;
  if (!hasUsers && !isSetup) return null;
  if (hasUsers && !user && !isPublic) return null;
  if (user && user.mustChangePassword && !isChangePwd) return null;

  return <>{children ?? <Outlet />}</>;
}
