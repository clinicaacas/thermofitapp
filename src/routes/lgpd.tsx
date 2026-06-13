import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/lgpd")({
  head: () => ({ meta: [{ title: "LGPD — ThermoFit" }] }),
  component: Page,
});

function Page() {
  return <AppShell title="LGPD" />;
}
