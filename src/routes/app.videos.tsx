import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ClientAppShell } from "@/components/client-app-shell";
import { listClientVideos, getClientVideoPlayback } from "@/lib/thermofit-client-app.functions";
import { PlayCircle, X, Clock } from "lucide-react";
import { VideoThumbnail, youtubeThumb } from "@/components/video-thumbnail";


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
  miles_on_complete: number;
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
  const categories = useMemo(() => {
    const set = new Set<string>();
    videos.forEach((v) => set.add(v.category || "geral"));
    return ["todas", ...Array.from(set)];
  }, [videos]);

  const [cat, setCat] = useState("todas");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = cat === "todas" ? videos : videos.filter((v) => (v.category || "geral") === cat);

  const playbackQuery = useQuery({
    queryKey: ["client-video-playback", clientId, openId],
    queryFn: () => fetchPlayback({ data: { clientId, videoId: openId! } }),
    enabled: !!openId && !!clientId,
  });

  return (
    <ClientAppShell title="Vídeos">
      <div className="space-y-4">
        {categories.length > 1 && (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium capitalize transition ${
                  cat === c
                    ? "border-[#8A6A3D] bg-[#8A6A3D] text-white"
                    : "border-[#E5D6BD] bg-white text-[#5C4528]"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {isLoading && <p className="text-sm text-[#7A6A52]">Carregando…</p>}
        {!isLoading && filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-[#E5D6BD] bg-white p-8 text-center">
            <p className="text-sm text-[#7A6A52]">Nenhum vídeo disponível ainda.</p>
          </div>
        )}

        <ul className="space-y-3">
          {filtered.map((v) => {
            const thumb =
              v.thumbnail_url ||
              (v.url ? youtubeThumb(v.url) : null) ||
              null;
            return (
              <li key={v.id}>
                <button
                  onClick={() => setOpenId(v.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-[#E5D6BD] bg-white p-3 text-left transition hover:border-[#8A6A3D]"
                >
                  <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-[#F3E8D2]">
                    {thumb ? (
                      <img src={thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-[#8A6A3D]">
                        <PlayCircle className="h-7 w-7" />
                      </div>
                    )}
                    <div className="absolute inset-0 grid place-items-center bg-black/20">
                      <PlayCircle className="h-7 w-7 text-white drop-shadow" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#3D2E1C]">{v.title}</p>
                    <p className="mt-0.5 text-xs capitalize text-[#7A6A52]">{v.category || "geral"}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-[#7A6A52]">
                      <Clock className="h-3 w-3" /> {fmtDuration(v.duration_seconds)}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
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
              {playbackQuery.data && <Player data={playbackQuery.data} />}
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

function Player({ data }: { data: { kind: string; playUrl: string | null } }) {
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
    return <video src={data.playUrl} controls autoPlay className="h-full w-full" />;
  }
  // external link (drive / outro): tentar iframe; se bloquear, oferecer link
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
