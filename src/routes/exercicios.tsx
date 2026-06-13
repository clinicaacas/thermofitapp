import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/exercicios")({
  head: () => ({ meta: [{ title: "Exercícios — ThermoFit" }] }),
  component: Page,
});

function Page() {
  return <AppShell title="Exercícios" />;
}
