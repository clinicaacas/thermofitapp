import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClientAppShell } from "@/components/client-app-shell";
import { listClientVideos } from "@/lib/thermofit-client-app.functions";
import { PlayCircle } from "lucide-react";

export const Route = createFileRoute("/app/videos")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

function Page() {
  const { clientId } = useSearch({ from: "/app/videos" });
  const fetchVideos = useServerFn(listClientVideos);
  const { data, isLoading } = useQuery({
    queryKey: ["client-videos", clientId],
    queryFn: () => fetchVideos({ data: { clientId } }),
    enabled: !!clientId,
  });

  const videos = data?.videos ?? [];

  return (
    <ClientAppShell title="Vídeos">
      {isLoading && <p className="text-sm text-slate-500">Carregando…</p>}
      {!isLoading && videos.length === 0 && (
        <p className="text-sm text-slate-500">Nenhum vídeo disponível ainda.</p>
      )}
      <ul className="space-y-3">
        {videos.map((v: any) => (
          <li key={v.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-indigo-100 text-indigo-600">
              <PlayCircle className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{v.title}</p>
              <p className="text-xs text-slate-500">Dia {v.release_day ?? "—"} · {v.miles_on_complete ?? 0} milhas</p>
            </div>
          </li>
        ))}
      </ul>
    </ClientAppShell>
  );
}
