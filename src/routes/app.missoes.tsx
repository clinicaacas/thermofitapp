import { createFileRoute, useSearch, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClientAppShell } from "@/components/client-app-shell";
import { Target, Check, Play } from "lucide-react";
import {
  listClientMissions,
  toggleMissionCompletion,
  listTodayVideoMissions,
} from "@/lib/thermofit-client-app.functions";
import { useClientPhotosRealtime } from "@/hooks/use-client-photos-realtime";

export const Route = createFileRoute("/app/missoes")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

function Page() {
  const { clientId } = useSearch({ from: "/app/missoes" });
  const navigate = useNavigate();
  const fetchList = useServerFn(listClientMissions);
  const fetchVideoMissions = useServerFn(listTodayVideoMissions);
  const toggleFn = useServerFn(toggleMissionCompletion);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["client-missions", clientId],
    queryFn: () => fetchList({ data: { clientId } }),
    enabled: !!clientId,
  });

  const { data: videoData, isLoading: videoLoading } = useQuery({
    queryKey: ["client-video-missions", clientId],
    queryFn: () => fetchVideoMissions({ data: { clientId } }),
    enabled: !!clientId,
  });

  const toggle = useMutation({
    mutationFn: (v: { missionId: string; done: boolean }) =>
      toggleFn({ data: { clientId, ...v } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-missions", clientId] });
      qc.invalidateQueries({ queryKey: ["client-home", clientId] });
    },
  });

  const missions = data?.missions ?? [];
  const videoMissions = videoData?.missions ?? [];
  const journeyDay = videoData?.journeyDay ?? 0;
  const done = missions.filter((m: any) => m.completed).length;
  const total = missions.length + videoMissions.length;
  const pct = total > 0 ? ((done + 0) / total) * 100 : 0;

  return (
    <ClientAppShell
      title="Missões de hoje"
      subtitle={`Dia ${String(journeyDay).padStart(2, "0")} · ${done} de ${total} concluídas`}
    >
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full" style={{ background: "#F3E8D2" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#C9A24A" }} />
      </div>

      {videoMissions.length > 0 && (
        <section className="mt-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: "#8A6A3D" }}>
            Vídeos do dia
          </h3>
          <ul className="space-y-2">
            {videoMissions.map((v: any) => (
              <li key={v.id}>
                <button
                  onClick={() => navigate({ to: "/app/videos", search: { clientId } })}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left"
                  style={{ border: "1px solid #E5D6BD" }}
                >
                  <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg" style={{ background: "#F3E8D2" }}>
                    {v.thumbnail_url ? (
                      <img src={v.thumbnail_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center">
                        <Play className="h-5 w-5" style={{ color: "#8A6A3D" }} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" style={{ color: "#1F2933" }}>
                      {v.title}
                    </p>
                    <p className="text-xs capitalize" style={{ color: "#6B7280" }}>
                      {v.category || "geral"} · assistir {v.min_completion_pct ?? 90}%
                    </p>
                  </div>
                  {v.miles_on_complete > 0 && (
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ background: "#F3E8D2", color: "#8A6A3D" }}
                    >
                      +{v.miles_on_complete}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-4">
        {missions.length > 0 && (
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: "#8A6A3D" }}>
            Missões
          </h3>
        )}
        {isLoading || videoLoading ? (
          <p className="mt-6 text-sm" style={{ color: "#6B7280" }}>Carregando…</p>
        ) : total === 0 ? (
          <div
            className="mt-6 rounded-2xl bg-white p-8 text-center text-sm"
            style={{ border: "1px solid #E5E0D8", color: "#6B7280" }}
          >
            <Target className="mx-auto mb-2 h-8 w-8" style={{ color: "#C8A15A" }} />
            Nenhuma missão programada para hoje.
            <p className="mt-1 text-xs">A equipe Acas preparará sua próxima missão em breve.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {missions.map((m: any) => (
              <li
                key={m.id}
                className="flex items-start gap-3 rounded-2xl bg-white p-3"
                style={{ border: "1px solid #E5E0D8" }}
              >
                <button
                  type="button"
                  onClick={() => toggle.mutate({ missionId: m.id, done: !m.completed })}
                  disabled={toggle.isPending}
                  aria-label={m.completed ? "Desmarcar" : "Concluir"}
                  className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md"
                  style={{
                    background: m.completed ? "#C8A15A" : "#FFFFFF",
                    border: `1px solid ${m.completed ? "#C8A15A" : "#E5E0D8"}`,
                  }}
                >
                  {m.completed && <Check className="h-4 w-4 text-white" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-sm font-semibold"
                    style={{
                      color: m.completed ? "#6B7280" : "#1F2933",
                      textDecoration: m.completed ? "line-through" : "none",
                    }}
                  >
                    {m.title}
                  </p>
                  {m.description && (
                    <p className="text-xs" style={{ color: "#6B7280" }}>{m.description}</p>
                  )}
                </div>
                {m.miles > 0 && (
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ background: "#F3E8D2", color: "#8A6A3D" }}
                  >
                    +{m.miles}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </ClientAppShell>
  );
}
