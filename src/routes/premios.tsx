import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/premios")({
  head: () => ({ meta: [{ title: "Prêmios — ThermoFit" }] }),
  component: Page,
});

function Page() {
  return <AppShell title="Prêmios" />;
}
