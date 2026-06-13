import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/aprovacoes")({
  head: () => ({ meta: [{ title: "Aprovações — ThermoFit" }] }),
  component: Page,
});

function Page() {
  return <AppShell title="Aprovações" />;
}
