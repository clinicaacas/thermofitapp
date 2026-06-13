import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — ThermoFit" }] }),
  component: Page,
});

function Page() {
  return <AppShell title="Configurações" />;
}
