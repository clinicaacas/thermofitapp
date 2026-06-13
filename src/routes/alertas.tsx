import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/alertas")({
  head: () => ({ meta: [{ title: "Alertas — ThermoFit" }] }),
  component: Page,
});

function Page() {
  return <AppShell title="Alertas" />;
}
