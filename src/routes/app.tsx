import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app")({
  head: () => ({ meta: [{ title: "App da Cliente — ThermoFit" }] }),
  component: AppLayout,
});

function AppLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { search, pathname } = useLocation();

  useEffect(() => {
    if (!user || user.kind !== "client" || !user.clientId) return;
    const params = new URLSearchParams(search);
    const current = params.get("clientId");
    // Force the URL to reflect the logged-in client (prevents reading another client by URL tampering).
    if (current !== user.clientId) {
      params.set("clientId", user.clientId);
      navigate({ to: pathname, search: Object.fromEntries(params) as any, replace: true });
    }
  }, [user, search, pathname, navigate]);

  return <Outlet />;
}
