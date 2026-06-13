import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/clientes")({
  head: () => ({ meta: [{ title: "Clientes — ThermoFit" }] }),
  component: Page,
});

function Page() {
  return <AppShell title="Clientes" />;
}
