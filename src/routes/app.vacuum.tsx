import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app/vacuum")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: () => <Outlet />,
});