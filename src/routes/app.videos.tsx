import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useRef, useEffect } from "react";
import { ClientAppShell } from "@/components/client-app-shell";
import {
  listClientVideos,
  getClientVideoPlayback,
  saveVideoProgress,
} from "@/lib/thermofit-client-app.functions";
import { X, Clock, CheckCircle2 } from "lucide-react";
import { VideoThumbnail, youtubeThumb } from "@/components/video-thumbnail";
import { useMissionsRealtime } from "@/hooks/use-missions-realtime";

export const Route = createFileRoute("/app/videos")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

type V = {
  id: string;
  title: string;
  description: string;
  url: string;
  thumbnail_url: string;
  duration_seconds: number;
  category: string;
  storage_key: string | null;
  video_type: string;
  phase: string | null;
  release_day: number | null;
  miles_on_complete: number;
  min_completion_pct: number;
  progress: { is_completed: boolean; progress_percent: number } | null;
};

function youtubeId(url: string): string | null {
  const m =
    url.match(/youtu\.be\/([^?&]+)/) ||
    url.match(/youtube\.com\/watch\?v=([^?&]+)/) ||
    url.match(/youtube\.com\/embed\/([^?&]+)/);
  return m ? m[1] : null;
}

function fmtDuration(sec: number): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Page() {
  const { clientId } = useSearch({ from: "/app/videos" });
  const fetchVideos = useServerFn(listClientVideos);
  const fetchPlayback = useServerFn(getClientVideoPlayback);
  const { data, isLoading } = useQuery({
    queryKey: ["client-videos", clientId],
    queryFn: () => fetchVideos({ data: { clientId } }),
    enabled: !!clientId,
  });

  const videos: V[] = (data?.videos ?? []) as V[];

  const grouped = useMemo(() => {
    const map = new Map<number, V[]>();
    for (const v of videos) {
      const d = v.release_day == null ? 0 : Number(v.release_day);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(v);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [videos]);

  const [openId, setOpenId] = useState<string | null>(null);

  const playbackQuery = useQuery({
    queryKey: ["client-video-playback", clientId, openId],
    queryFn: () => fetchPlayback({ data: { clientId, videoId: openId! } }),
    enabled: !!openId && !!clientId,
  });

  return (
    <ClientAppShell title="Vídeos">
      <div className="space-y-5">
        {isLoading && <p className="text-sm text-[#7A6A52]">Carregando…</p>}
        {!isLoading && videos.length === 0 && (
          <div className="rounded-xl border border-dashed border-[#E5D6BD] bg-white p-8 text-center">
            <p className="text-sm text-[#7A6A52]">
              Ainda não há vídeos liberados na sua jornada.
            </p>
          </div>
        )}

        {grouped.map(([day, list]) => (
          <section key={day}>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#8A6A3D]">
              Dia {String(day).padStart(2, "0")}
            </h3>
            <ul className="space-y-2">
              {list.map((v) => {
                const thumb = v.thumbnail_url || (v.url ? youtubeThumb(v.url) : null) || null;
                const completed = !!v.progress?.is_completed;
                return (
                  <li key={v.id}>
                    <button
                      onClick={() => setOpenId(v.id)}
                      className="flex w-full items-center gap-3 rounded-xl border border-[#E5D6BD] bg-white p-3 text-left transition hover:border-[#8A6A3D]"
                    >
                      <div className="relative h-16 w-24 shrink-0">
                        <VideoThumbnail src={thumb ?? ""} alt={v.title} className="h-full w-full" />
                        {completed && (
                          <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[#3D2E1C]">{v.title}</p>
                        <p className="mt-0.5 text-xs capitalize text-[#7A6A52]">{v.category || "geral"}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-[#7A6A52]">
                          <Clock className="h-3 w-3" /> {fmtDuration(v.duration_seconds)}
                          {v.progress && !completed && v.progress.progress_percent > 0 && (
                            <span className="ml-2">{v.progress.progress_percent}% assistido</span>
                          )}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {openId && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          onClick={() => setOpenId(null)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-black"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between bg-[#1a1208] px-4 py-2 text-white">
              <p className="truncate text-sm font-medium">{playbackQuery.data?.title ?? "Vídeo"}</p>
              <button onClick={() => setOpenId(null)} className="opacity-70 hover:opacity-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="aspect-video w-full bg-black">
              {playbackQuery.isLoading && (
                <div className="grid h-full w-full place-items-center text-xs text-white/60">
                  Carregando…
                </div>
              )}
              {playbackQuery.data && (
                <Player
                  data={playbackQuery.data}
                  clientId={clientId}
                  videoId={openId}
                />
              )}
              {playbackQuery.error && (
                <div className="grid h-full w-full place-items-center px-4 text-center text-xs text-white/70">
                  Não foi possível carregar este vídeo.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </ClientAppShell>
  );
}

function Player({
  data,
  clientId,
  videoId,
}: {
  data: { kind: string; playUrl: string | null };
  clientId: string;
  videoId: string;
}) {
  const saveProgress = useServerFn(saveVideoProgress);
  const saveMut = useMutation({
    mutationFn: (vars: { positionSeconds: number; durationSeconds: number }) =>
      saveProgress({ data: { clientId, videoId, ...vars } }),
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSavedRef = useRef(0);

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
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnd);
    };
  }, []);

  if (!data.playUrl) {
    return (
      <div className="grid h-full w-full place-items-center text-xs text-white/70">
        Vídeo indisponível.
      </div>
    );
  }
  if (data.kind === "youtube") {
    const id = youtubeId(data.playUrl);
    if (!id) return null;
    return (
      <iframe
        title="video"
        src={`https://www.youtube.com/embed/${id}?autoplay=1&rel=0`}
        className="h-full w-full"
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }
  if (data.kind === "file") {
    return (
      <video
        ref={videoRef}
        src={data.playUrl}
        controls
        autoPlay
        className="h-full w-full"
      />
    );
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center text-white">
      <p className="text-sm">Este vídeo abre em uma janela externa.</p>
      <a
        href={data.playUrl}
        target="_blank"
        rel="noreferrer"
        className="rounded-full bg-[#8A6A3D] px-4 py-2 text-sm font-semibold"
      >
        Abrir vídeo
      </a>
    </div>
  );
}
