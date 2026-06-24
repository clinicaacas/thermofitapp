import { createFileRoute, useSearch, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { ClientAppShell } from "@/components/client-app-shell";
import { Target, Check, Play, X } from "lucide-react";
import {
  listClientMissions,
  toggleMissionCompletion,
  listTodayVideoMissions,
  getClientVideoPlayback,
  saveVideoProgress,
} from "@/lib/thermofit-client-app.functions";
import { useClientPhotosRealtime } from "@/hooks/use-client-photos-realtime";

export const Route = createFileRoute("/app/missoes")({
  validateSearch: (s: Record<string, unknown>) => ({
    clientId: (s.clientId as string) || "",
    video: (s.video as string) || undefined,
  }),
  component: Page,
});

function youtubeId(url: string): string | null {
  const m =
    url.match(/youtu\.be\/([^?&]+)/) ||
    url.match(/youtube\.com\/watch\?v=([^?&]+)/) ||
    url.match(/youtube\.com\/embed\/([^?&]+)/);
  return m ? m[1] : null;
}

function Page() {
  const { clientId, video: videoParam } = useSearch({ from: "/app/missoes" });
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

  useClientPhotosRealtime(clientId || null, () => {
    qc.invalidateQueries({ queryKey: ["client-missions", clientId] });
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
  const videosDone = videoMissions.filter((v: any) => v.is_completed).length;
  const done = missions.filter((m: any) => m.completed).length + videosDone;
  const total = missions.length + videoMissions.length;
  const pct = total > 0 ? (done / total) * 100 : 0;

  const openVideoId = videoParam || null;
  const openVideoMeta = openVideoId
    ? videoMissions.find((v: any) => v.id === openVideoId) ?? null
    : null;


  const openVideo = (id: string) => {
    navigate({
      to: "/app/missoes",
      search: { clientId, video: id },
      replace: false,
    });
  };
  const closeVideo = () => {
    navigate({ to: "/app/missoes", search: { clientId }, replace: true });
  };

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
                  onClick={() => openVideo(v.id)}
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

      {openVideoId && (
        <MissionVideoPlayer
          clientId={clientId}
          videoId={openVideoId}
          title={openVideoMeta?.title}
          onClose={closeVideo}
        />
      )}
    </ClientAppShell>
  );
}

function MissionVideoPlayer({
  clientId,
  videoId,
  title,
  onClose,
}: {
  clientId: string;
  videoId: string;
  title?: string;
  onClose: () => void;
}) {
  const fetchPlayback = useServerFn(getClientVideoPlayback);
  const saveProgress = useServerFn(saveVideoProgress);
  const qc = useQueryClient();
  const [reloadKey, setReloadKey] = useState(0);

  const playback = useQuery({
    queryKey: ["client-video-playback", clientId, videoId, reloadKey],
    queryFn: () => fetchPlayback({ data: { clientId, videoId } }),
    enabled: !!clientId && !!videoId,
    staleTime: 0,
  });

  const saveMut = useMutation({
    mutationFn: (vars: { positionSeconds: number; durationSeconds: number }) =>
      saveProgress({ data: { clientId, videoId, ...vars } }),
    onSuccess: (res: any) => {
      if (res?.completed) {
        qc.invalidateQueries({ queryKey: ["client-video-missions", clientId] });
        qc.invalidateQueries({ queryKey: ["client-missions", clientId] });
        qc.invalidateQueries({ queryKey: ["client-home", clientId] });
      }
    },
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSavedRef = useRef(0);
  const triedRefreshRef = useRef(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onTime = () => {
      const now = Date.now();
      if (now - lastSavedRef.current < 10_000) return;
      if (!el.duration || isNaN(el.duration)) return;
      lastSavedRef.current = now;
      saveMut.mutate({ positionSeconds: el.currentTime, durationSeconds: el.duration });
    };
    const onEnd = () => {
      if (!el.duration || isNaN(el.duration)) return;
      saveMut.mutate({ positionSeconds: el.duration, durationSeconds: el.duration });
    };
    const onError = () => {
      if (!triedRefreshRef.current) {
        triedRefreshRef.current = true;
        setReloadKey((k) => k + 1);
      }
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnd);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnd);
      el.removeEventListener("error", onError);
    };
  }, [playback.data?.playUrl]);

  const data = playback.data;
  const hasError = !!playback.error || (data && !data.playUrl);

  const retry = () => {
    triedRefreshRef.current = false;
    setReloadKey((k) => k + 1);
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-black"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-[#1a1208] px-4 py-2 text-white">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-white/60">Vídeo do dia</p>
            <p className="truncate text-sm font-medium">{data?.title ?? title ?? "Vídeo"}</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="aspect-video w-full bg-black">
          {playback.isLoading && (
            <div className="grid h-full w-full place-items-center text-xs text-white/60">
              Carregando…
            </div>
          )}
          {!playback.isLoading && hasError && (
            <div className="grid h-full w-full place-items-center gap-2 px-4 text-center text-xs text-white/80">
              <p>Não foi possível carregar este vídeo agora. Tente novamente.</p>
              <button
                onClick={retry}
                className="rounded-full bg-[#8A6A3D] px-4 py-1.5 text-xs font-semibold text-white"
              >
                Tentar novamente
              </button>
            </div>
          )}
          {!playback.isLoading && !hasError && data?.playUrl && data.kind === "youtube" && (() => {
            const id = youtubeId(data.playUrl);
            if (!id) return null;
            return (
              <iframe
                title="video"
                src={`https://www.youtube.com/embed/${id}?autoplay=1&rel=0&playsinline=1`}
                className="h-full w-full"
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            );
          })()}
          {!playback.isLoading && !hasError && data?.playUrl && data.kind === "file" && (
            <video
              key={reloadKey}
              ref={videoRef}
              src={data.playUrl}
              controls
              autoPlay
              playsInline
              className="h-full w-full"
            />
          )}
          {!playback.isLoading && !hasError && data?.playUrl && data.kind !== "youtube" && data.kind !== "file" && (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center text-white">
              <p className="text-sm">Não foi possível carregar este vídeo agora. Tente novamente.</p>
              <button
                onClick={retry}
                className="rounded-full bg-[#8A6A3D] px-4 py-2 text-sm font-semibold"
              >
                Tentar novamente
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
