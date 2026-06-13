import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/mensagens")({
  head: () => ({ meta: [{ title: "Mensagens — ThermoFit" }] }),
  component: Page,
});

function Page() {
  return <AppShell title="Mensagens" />;
}
