import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/videos")({
  head: () => ({ meta: [{ title: "Vídeos — ThermoFit" }] }),
  component: Page,
});

function Page() {
  return <AppShell title="Vídeos" />;
}
