import { createFileRoute, useSearch, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClientAppShell } from "@/components/client-app-shell";
import { Target, Check, Play, X } from "lucide-react";
import {
  listClientMissions,
  toggleMissionCompletion,
  listTodayVideoMissions,
  getClientVideoPlayback,
  saveVideoProgress,
} from "@/lib/thermofit-client-app.functions";
import { getTodayMissionSummary, getJourneyProgress } from "@/lib/thermofit-missions.functions";
import { DailyRoutineCard } from "@/components/daily-routine-card";
import { WeeklyPhotoCard } from "@/components/weekly-photo-card";
import { PostVideoTaskCard } from "@/components/post-video-task-card";
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
  const fetchSummary = useServerFn(getTodayMissionSummary);
  const fetchProgress = useServerFn(getJourneyProgress);
  const toggleFn = useServerFn(toggleMissionCompletion);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["client-missions", clientId],
    queryFn: () => fetchList({ data: { clientId } }),
    enabled: !!clientId,
  });

  useClientPhotosRealtime(clientId || null, () => {
    qc.invalidateQueries({ queryKey: ["client-missions", clientId] });
    qc.invalidateQueries({ queryKey: ["mission-summary", clientId] });
  });

  const { data: videoData, isLoading: videoLoading } = useQuery({
    queryKey: ["client-video-missions", clientId],
    queryFn: () => fetchVideoMissions({ data: { clientId } }),
    enabled: !!clientId,
  });

  const { data: summary } = useQuery({
    queryKey: ["mission-summary", clientId],
    queryFn: () => fetchSummary({ data: { clientId } }),
    enabled: !!clientId,
    staleTime: 0,
  });

  const { data: progress } = useQuery({
    queryKey: ["journey-progress", clientId],
    queryFn: () => fetchProgress({ data: { clientId } }),
    enabled: !!clientId,
    staleTime: 0,
  });

  const toggle = useMutation({
    mutationFn: (v: { missionId: string; done: boolean }) =>
      toggleFn({ data: { clientId, ...v } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-missions", clientId] });
      qc.invalidateQueries({ queryKey: ["client-home", clientId] });
      qc.invalidateQueries({ queryKey: ["mission-summary", clientId] });
    },
  });

  // Filtra da lista genérica os tipos que já possuem componente próprio
  // (DailyRoutineCard, PostVideoTaskCard, WeeklyPhotoCard, e Vídeos do dia).
  const HANDLED_TYPES = new Set([
    "daily_checkin",
    "daily_meal",
    "daily_workout",
    "hydration_goal",
    "video_complete",
    "post_video_task",
    "weekly_photo",
    "workout_photo",
  ]);
  const allMissions = data?.missions ?? [];
  const missions = allMissions.filter(
    (m: any) => !m.mission_type || !HANDLED_TYPES.has(m.mission_type),
  );
  const videoMissions = videoData?.missions ?? [];
  const journeyDay = videoData?.journeyDay ?? 0;
  // Contador único: usa o resumo oficial do backend (fonte única de verdade).
  const done = (summary as any)?.completed ?? 0;
  const total = (summary as any)?.total ?? 0;
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
                  {v.is_completed ? (
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold inline-flex items-center gap-1"
                      style={{ background: "#E8F2E5", color: "#3F7A3A" }}
                    >
                      <Check className="h-3 w-3" /> Concluído
                    </span>
                  ) : (
                    v.miles_on_complete > 0 && (
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ background: "#F3E8D2", color: "#8A6A3D" }}
                      >
                        +{v.miles_on_complete}
                      </span>
                    )
                  )}

                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {clientId && <PostVideoTaskCard clientId={clientId} />}
      {clientId && <DailyRoutineCard clientId={clientId} />}
      {clientId && <WeeklyPhotoCard clientId={clientId} />}

      {progress && (progress as any).journeyId && (
        <SealsAndMilestonesPanel progress={progress as any} />
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
  const [isBuffering, setIsBuffering] = useState(false);
  const [ended, setEnded] = useState(false);
  const [friendlyError, setFriendlyError] = useState<string | null>(null);
  const [detectedDuration, setDetectedDuration] = useState<number | null>(null);
  const [completedInSession, setCompletedInSession] = useState(false);

  const playback = useQuery({
    queryKey: ["client-video-playback", clientId, videoId, reloadKey],
    queryFn: () => fetchPlayback({ data: { clientId, videoId } }),
    enabled: !!clientId && !!videoId,
    staleTime: 55 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const completedOnceRef = useRef(false);
  const endedRef = useRef(false);
  const pendingCompletionRefreshRef = useRef(false);
  const latestPositionRef = useRef(0);
  const latestDurationRef = useRef(0);
  const shouldResumeRef = useRef(false);
  const userWantsPlaybackRef = useRef(true);
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef<{ positionSeconds: number; durationSeconds: number } | null>(null);

  const runPostCompletionRefresh = useCallback(() => {
    window.setTimeout(() => {
      qc.invalidateQueries({ queryKey: ["client-video-missions", clientId] });
      qc.invalidateQueries({ queryKey: ["client-missions", clientId] });
      qc.invalidateQueries({ queryKey: ["client-home", clientId] });
    }, 350);
  }, [clientId, qc]);

  const saveMut = useMutation({
    mutationFn: (vars: { positionSeconds: number; durationSeconds: number }) =>
      saveProgress({ data: { clientId, videoId, ...vars } }),
    onSuccess: (res: any) => {
      if (res?.completed && !completedOnceRef.current) {
        completedOnceRef.current = true;
        setCompletedInSession(true);
        if (endedRef.current) runPostCompletionRefresh();
        else pendingCompletionRefreshRef.current = true;
      }
    },
  });

  const queueProgressSave = useCallback(
    (vars: { positionSeconds: number; durationSeconds: number }) => {
      if (!vars.durationSeconds || isNaN(vars.durationSeconds)) return;
      if (saveInFlightRef.current) {
        saveQueuedRef.current = vars;
        return;
      }
      saveInFlightRef.current = true;
      saveMut.mutate(vars, {
        onSettled: () => {
          saveInFlightRef.current = false;
          const queued = saveQueuedRef.current;
          saveQueuedRef.current = null;
          if (queued) queueProgressSave(queued);
        },
      });
    },
    [saveMut],
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSavedRef = useRef(0);
  const triedRefreshRef = useRef(false);
  const currentUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (currentUrlRef.current !== playback.data?.playUrl) {
      currentUrlRef.current = playback.data?.playUrl ?? null;
      setFriendlyError(null);
      setIsBuffering(false);
      if (shouldResumeRef.current && latestPositionRef.current > 0) {
        const resumeAt = latestPositionRef.current;
        const resume = () => {
          if (Number.isFinite(el.duration) && resumeAt < el.duration) {
            el.currentTime = Math.max(0, Math.min(resumeAt, el.duration - 0.5));
          }
          if (userWantsPlaybackRef.current) void el.play().catch(() => {});
          shouldResumeRef.current = false;
        };
        if (el.readyState >= 1) resume();
        else el.addEventListener("loadedmetadata", resume, { once: true });
      }
    }
    const onTime = () => {
      const now = Date.now();
      latestPositionRef.current = el.currentTime || 0;
      latestDurationRef.current = Number.isFinite(el.duration) ? el.duration : latestDurationRef.current;
      if (now - lastSavedRef.current < 10_000) return;
      if (!el.duration || isNaN(el.duration)) return;
      lastSavedRef.current = now;
      queueProgressSave({ positionSeconds: el.currentTime, durationSeconds: el.duration });
    };
    const onEnd = () => {
      if (!el.duration || isNaN(el.duration)) return;
      latestPositionRef.current = el.duration;
      latestDurationRef.current = el.duration;
      endedRef.current = true;
      setIsBuffering(false);
      setEnded(true);
      if (pendingCompletionRefreshRef.current || completedOnceRef.current) {
        pendingCompletionRefreshRef.current = false;
        runPostCompletionRefresh();
      }
      queueProgressSave({ positionSeconds: el.duration, durationSeconds: el.duration });
    };
    const onLoadedMetadata = () => {
      if (Number.isFinite(el.duration)) {
        latestDurationRef.current = el.duration;
        setDetectedDuration(el.duration);
      }
    };
    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => setIsBuffering(false);
    const onLoadedData = () => setIsBuffering(false);
    const onPlay = () => {
      userWantsPlaybackRef.current = true;
      if (!el.ended) {
        endedRef.current = false;
        setEnded(false);
      }
    };
    const onPause = () => {
      if (!el.ended) userWantsPlaybackRef.current = false;
    };
    const onError = () => {
      latestPositionRef.current = el.currentTime || latestPositionRef.current;
      shouldResumeRef.current = true;
      setIsBuffering(false);
      if (!triedRefreshRef.current) {
        triedRefreshRef.current = true;
        setReloadKey((k) => k + 1);
        return;
      }
      setFriendlyError("Não foi possível continuar este vídeo agora.");
    };
    el.addEventListener("loadedmetadata", onLoadedMetadata);
    el.addEventListener("waiting", onWaiting);
    el.addEventListener("stalled", onWaiting);
    el.addEventListener("canplay", onCanPlay);
    el.addEventListener("loadeddata", onLoadedData);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnd);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("loadedmetadata", onLoadedMetadata);
      el.removeEventListener("waiting", onWaiting);
      el.removeEventListener("stalled", onWaiting);
      el.removeEventListener("canplay", onCanPlay);
      el.removeEventListener("loadeddata", onLoadedData);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnd);
      el.removeEventListener("error", onError);
    };
  }, [playback.data?.playUrl, queueProgressSave]);


  const data = playback.data;
  const hasError = !!playback.error || (data && !data.playUrl);

  const retry = () => {
    triedRefreshRef.current = false;
    shouldResumeRef.current = true;
    setFriendlyError(null);
    setIsBuffering(false);
    setReloadKey((k) => k + 1);
  };

  const watchAgain = () => {
    const el = videoRef.current;
    if (!el) return;
    setEnded(false);
    endedRef.current = false;
    setFriendlyError(null);
    setIsBuffering(false);
    userWantsPlaybackRef.current = true;
    el.currentTime = 0;
    latestPositionRef.current = 0;
    void el.play().catch(() => {});
  };

  const expectedDuration = data?.durationSeconds ?? 0;
  const showDurationMismatch =
    expectedDuration > 0 && detectedDuration != null && Math.abs(expectedDuration - detectedDuration) > 2;
  const sourceType = data?.kind === "file" ? "video/mp4" : undefined;

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
          {!playback.isLoading && (hasError || friendlyError) && (
            <div className="grid h-full w-full place-items-center gap-2 px-4 text-center text-xs text-white/80">
              <p>{friendlyError ?? "Não foi possível carregar este vídeo agora. Tente novamente."}</p>
              <button
                onClick={retry}
                className="rounded-full bg-[#8A6A3D] px-4 py-1.5 text-xs font-semibold text-white"
              >
                Tentar novamente
              </button>
            </div>
          )}
          {!playback.isLoading && !hasError && !friendlyError && data?.playUrl && data.kind === "youtube" && (() => {
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
          {!playback.isLoading && !hasError && !friendlyError && data?.playUrl && data.kind === "file" && (
            <div className="relative h-full w-full">
              <video
                key={reloadKey}
                ref={videoRef}
                controls
                autoPlay
                muted
                playsInline
                preload="auto"
                controlsList="nodownload"
                className="h-full w-full"
              >
                {sourceType ? (
                  <source src={data.playUrl} type={sourceType} />
                ) : (
                  <source src={data.playUrl} />
                )}
              </video>
              {isBuffering && !ended && !friendlyError && (
                <div className="pointer-events-none absolute inset-x-0 top-2 mx-auto w-fit rounded-full bg-black/70 px-3 py-1 text-xs text-white/80">
                  Carregando vídeo...
                </div>
              )}
              {showDurationMismatch && !friendlyError && (
                <div className="pointer-events-none absolute inset-x-2 bottom-2 rounded-md bg-black/70 px-3 py-2 text-[11px] text-white/80">
                  O arquivo salvo tem duração diferente da cadastrada. A conclusão usa a duração detectada no player.
                </div>
              )}
              {ended && !friendlyError && (
                <div className="absolute inset-x-0 bottom-3 flex justify-center">
                  <button
                    type="button"
                    onClick={watchAgain}
                    className="rounded-full bg-[#8A6A3D] px-4 py-2 text-xs font-semibold text-white shadow-lg"
                  >
                    Assistir novamente
                  </button>
                </div>
              )}
            </div>
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

const SEAL_META: Record<string, { label: string; miles: number }> = {
  streak_7: { label: "7 dias de constância", miles: 20 },
  streak_14: { label: "14 dias de constância", miles: 40 },
  streak_21: { label: "21 dias de constância", miles: 70 },
  program_complete: { label: "Programa Completo", miles: 100 },
};
const MILESTONE_ORDER = [300, 600, 900, 1300];

function SealsAndMilestonesPanel({ progress }: { progress: any }) {
  const milesTotal: number = progress.milesTotal ?? 0;
  const streakDays: number = progress.streakDays ?? 0;
  const sealsEarned: Set<string> = new Set((progress.seals ?? []).map((s: any) => s.code));
  const milestonesEarned: Set<number> = new Set((progress.milestones ?? []).map((m: any) => m.threshold));
  const nextMilestone = MILESTONE_ORDER.find((t) => milesTotal < t);
  const milestonePct = nextMilestone ? Math.min(100, (milesTotal / nextMilestone) * 100) : 100;

  return (
    <section className="mt-4 rounded-2xl bg-white p-3" style={{ border: "1px solid #E5D6BD" }}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "#8A6A3D" }}>
          Selos e Marcos
        </h3>
        <span className="text-xs" style={{ color: "#8A6A3D" }}>
          {milesTotal} Milhas · {streakDays}d seguidos
        </span>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-2">
        {(["streak_7", "streak_14", "streak_21", "program_complete"] as const).map((code) => {
          const meta = SEAL_META[code];
          const earned = sealsEarned.has(code);
          return (
            <div
              key={code}
              className="flex flex-col items-center rounded-xl p-2 text-center"
              style={{
                background: earned ? "#FFF7E6" : "#F8F1E2",
                border: `1px solid ${earned ? "#C9A24A" : "#E5D6BD"}`,
                opacity: earned ? 1 : 0.55,
              }}
            >
              <div className="text-base">{earned ? "🏅" : "🔒"}</div>
              <div className="mt-1 text-[10px] font-semibold leading-tight" style={{ color: "#5C3F1A" }}>
                {meta.label}
              </div>
              <div className="text-[10px]" style={{ color: "#8A6A3D" }}>+{meta.miles}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px]" style={{ color: "#8A6A3D" }}>
          <span>Próximo marco</span>
          <span>{nextMilestone ? `${milesTotal}/${nextMilestone}` : "Todos conquistados"}</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full" style={{ background: "#F3E8D2" }}>
          <div className="h-full rounded-full" style={{ width: `${milestonePct}%`, background: "#C9A24A" }} />
        </div>
        <div className="mt-2 flex justify-between gap-1">
          {MILESTONE_ORDER.map((t) => {
            const reached = milestonesEarned.has(t) || milesTotal >= t;
            return (
              <div
                key={t}
                className="flex-1 rounded-lg py-1 text-center text-[10px] font-semibold"
                style={{
                  background: reached ? "#C9A24A" : "#F3E8D2",
                  color: reached ? "#FFFFFF" : "#8A6A3D",
                }}
              >
                {t}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
