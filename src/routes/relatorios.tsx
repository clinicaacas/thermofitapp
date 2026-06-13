import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — ThermoFit" }] }),
  component: Page,
});

function Page() {
  return <AppShell title="Relatórios" />;
}
