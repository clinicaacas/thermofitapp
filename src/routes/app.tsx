import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import { ClientAppRuntimeProvider } from "@/lib/client-app-runtime";
import { getClientIdentity } from "@/lib/thermofit-client-app.functions";

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

  // Resolve identidade (tenant + jornada) sem alterar as queries das views.
  // Em A2.1 o provider apenas expõe a identidade — as views continuam lendo
  // clientId via useSearch. A migração para useClientAppRuntime() é A2.2.
  const params = new URLSearchParams(search);
  const clientId = (user?.kind === "client" && user.clientId) || params.get("clientId") || null;

  const fetchIdentity = useServerFn(getClientIdentity);
  const identityQuery = useQuery({
    queryKey: ["client-app-runtime-identity", clientId],
    queryFn: () => fetchIdentity({ data: { clientId: clientId! } }),
    enabled: !!clientId,
    staleTime: 60_000,
  });

  return (
    <ClientAppRuntimeProvider
      mode="client"
      tenantId={identityQuery.data?.tenantId ?? null}
      clientId={clientId}
      journeyId={identityQuery.data?.journeyId ?? null}
      isResolving={!!clientId && identityQuery.isLoading}
    >
      <Outlet />
    </ClientAppRuntimeProvider>
  );
}
