import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { ArrowLeft } from "lucide-react";
import { VideoForm } from "@/components/video-form";

export const Route = createFileRoute("/videos/nova")({
  head: () => ({ meta: [{ title: "Adicionar vídeo — ThermoFit" }] }),
  component: Page,
});

function Page() {
  const navigate = useNavigate();
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center gap-3">
          <Link
            to="/videos"
            aria-label="Voltar"
            className="grid h-9 w-9 place-items-center rounded-md border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Adicionar vídeo</h1>
            <p className="text-sm text-muted-foreground">
              Upload, YouTube ou link compartilhável
            </p>
          </div>
        </header>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <VideoForm
            mode="create"
            onSuccess={() => setTimeout(() => navigate({ to: "/videos" }), 400)}
            onCancel={() => navigate({ to: "/videos" })}
          />
        </div>
      </div>
    </AppShell>
  );
}
