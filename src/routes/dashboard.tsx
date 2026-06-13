import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — ThermoFit" }] }),
  component: Page,
});

function Page() {
  return <AppShell title="Dashboard" />;
}
