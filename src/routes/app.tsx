import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app")({
  head: () => ({ meta: [{ title: "App da Cliente — ThermoFit" }] }),
  component: () => <Outlet />,
});
