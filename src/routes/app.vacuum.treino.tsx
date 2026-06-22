import { createFileRoute, useSearch, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { ClientAppShell } from "@/components/client-app-shell";
import {
  getVacuumDataForClient,
  logExerciseCompletion,
} from "@/lib/thermofit-vacuum.functions";
import { Play, Pause, ChevronRight, CheckCircle2, Image as ImageIcon, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/app/vacuum/treino")({
  validateSearch: (s: Record<string, unknown>) => ({
    clientId: (s.clientId as string) || "",
    start: typeof s.start === "number" ? s.start : s.start ? Number(s.start) || 0 : 0,
  }),
  component: Page,
});

type Exercise = {
  id: string;
  name: string;
  short_description: string | null;
  prescription_text: string | null;
  instruction_text: string | null;
  media_signed_url: string | null;
  media_type: string | null;
  thumbnail_signed_url: string | null;
  duration_seconds: number | null;
  sets: number | null;
  reps: number | null;
  miles_reward: number | null;
};

function Page() {
  const { clientId, start } = useSearch({ from: "/app/vacuum/treino" });
  const navigate = useNavigate();
  const fetchData = useServerFn(getVacuumDataForClient);
  const logDone = useServerFn(logExerciseCompletion);

  const { data, isLoading } = useQuery({
    queryKey: ["vacuum-client", clientId],
    queryFn: () => fetchData({ data: { clientId } }),
    enabled: !!clientId,
  });

  const exercises: Exercise[] = (data?.exercises ?? []) as any;
  const [idx, setIdx] = useState(0);
  // Apply initial start index once exercises load
  useEffect(() => {
    if (exercises.length > 0 && start > 0 && start < exercises.length) {
      setIdx(start);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises.length]);
  const current = exercises[idx];

  const completeMut = useMutation({
    mutationFn: (vars: { exerciseId: string; durationSeconds: number }) =>
      logDone({ data: { clientId, ...vars } }),
  });

  function goNext(durationDone: number) {
    if (!current) return;
    completeMut.mutate({ exerciseId: current.id, durationSeconds: durationDone });
    if (idx < exercises.length - 1) {
      setIdx(idx + 1);
    } else {
      setTimeout(() => navigate({ to: "/app/vacuum", search: { clientId } }), 600);
    }
  }

  return (
    <ClientAppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate({ to: "/app/vacuum", search: { clientId } })}
            className="flex items-center gap-1 text-xs"
            style={{ color: "#8A6A3D" }}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
          </button>
          <span className="text-xs" style={{ color: "#6B7280" }}>
            {exercises.length > 0 ? `${idx + 1} / ${exercises.length}` : ""}
          </span>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "#F3E8D2" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${exercises.length > 0 ? ((idx + 1) / exercises.length) * 100 : 0}%`,
              background: "#C9A24A",
            }}
          />
        </div>

        {isLoading && !current ? (
          <p className="text-sm" style={{ color: "#6B7280" }}>Carregando…</p>
        ) : !current ? (
          <div className="rounded-2xl bg-white p-6 text-center text-sm" style={{ border: "1px solid #E5D6BD", color: "#6B7280" }}>
            Nenhum exercício configurado.
          </div>
        ) : (
          <ExerciseStep
            key={current.id}
            ex={current}
            onDone={(dur) => goNext(dur)}
            isLast={idx === exercises.length - 1}
          />
        )}
      </div>
    </ClientAppShell>
  );
}

function ExerciseStep({
  ex,
  onDone,
  isLast,
}: {
  ex: Exercise;
  onDone: (durationSeconds: number) => void;
  isLast: boolean;
}) {
  const totalSeconds = Math.max(1, (ex.duration_seconds ?? 60) * Math.max(1, ex.sets ?? 1));
  const [remaining, setRemaining] = useState(totalSeconds);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    setRemaining(totalSeconds);
    setRunning(false);
    setFinished(false);
    startedAt.current = null;
  }, [ex.id, totalSeconds]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(t);
          setRunning(false);
          setFinished(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running]);

  // breathing cycle (4s inspire / 6s expire) for diafragmática
  const isBreathing = /respira/i.test(ex.name);
  const cycle = 10; // seconds
  const elapsed = totalSeconds - remaining;
  const phase = isBreathing ? (elapsed % cycle < 4 ? "Inspire" : "Expire") : null;

  const pct = (elapsed / totalSeconds) * 100;
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;

  function handleFinish() {
    onDone(totalSeconds - remaining);
  }

  const mediaType = ex.media_type ?? "image";

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1F2933" }}>{ex.name}</h1>
        {(ex.short_description || ex.prescription_text) && (
          <p className="text-xs" style={{ color: "#6B7280" }}>
            {[ex.short_description, ex.prescription_text].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      <div
        className="relative grid w-full place-items-center overflow-hidden rounded-2xl bg-white"
        style={{ border: "1px solid #E5D6BD", aspectRatio: "4/3" }}
      >
        {ex.media_signed_url ? (
          mediaType === "video" ? (
            <video
              src={ex.media_signed_url}
              className="h-full w-full object-cover"
              muted
              loop
              autoPlay
              playsInline
            />
          ) : (
            <img
              src={ex.media_signed_url}
              alt={ex.name}
              className="h-full w-full object-cover"
            />
          )
        ) : ex.thumbnail_signed_url ? (
          <img src={ex.thumbnail_signed_url} alt={ex.name} className="h-full w-full object-cover" />
        ) : (
          <div className="grid place-items-center p-6 text-center text-xs" style={{ color: "#6B7280" }}>
            <ImageIcon className="mx-auto mb-2 h-8 w-8" style={{ color: "#C9A24A" }} />
            Mídia ainda não publicada para este exercício.
          </div>
        )}

        {isBreathing && running && (
          <div className="absolute inset-0 grid place-items-center bg-black/30">
            <div
              className="rounded-full px-6 py-3 text-2xl font-bold transition-all"
              style={{
                background: phase === "Inspire" ? "#C9A24A" : "#3D2E1C",
                color: "#FFFFFF",
                transform: phase === "Inspire" ? "scale(1.15)" : "scale(1)",
              }}
            >
              {phase}
            </div>
          </div>
        )}
      </div>

      {ex.instruction_text && (
        <div className="rounded-xl p-3 text-sm" style={{ background: "#F8F1E6", color: "#3D2E1C" }}>
          {ex.instruction_text}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between text-xs" style={{ color: "#6B7280" }}>
          <span>{(ex.sets ?? 1) > 1 ? `${ex.sets}× ${ex.duration_seconds}s` : `${ex.duration_seconds}s`}</span>
          <span className="font-mono text-base font-semibold" style={{ color: "#3D2E1C" }}>
            {mm}:{String(ss).padStart(2, "0")}
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "#F3E8D2" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "#8A6A3D" }} />
        </div>
      </div>

      <div className="flex gap-2">
        {!finished ? (
          <button
            onClick={() => {
              if (!startedAt.current) startedAt.current = Date.now();
              setRunning((r) => !r);
            }}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold"
            style={{ background: "#8A6A3D", color: "#FFFFFF" }}
          >
            {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {running ? "Pausar" : remaining < totalSeconds ? "Continuar" : "Iniciar"}
          </button>
        ) : (
          <button
            onClick={handleFinish}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold"
            style={{ background: "#3D2E1C", color: "#FFFFFF" }}
          >
            <CheckCircle2 className="h-4 w-4" />
            {isLast ? "Concluir treino" : "Próximo exercício"}
          </button>
        )}
        {!finished && (
          <button
            onClick={() => onDone(totalSeconds - remaining)}
            className="inline-flex items-center justify-center gap-1 rounded-full border px-4 py-3 text-sm font-semibold"
            style={{ borderColor: "#E5D6BD", color: "#5C4528", background: "#FFFFFF" }}
          >
            Pular <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {(ex.miles_reward ?? 0) > 0 && (
        <p className="text-center text-xs" style={{ color: "#8A6A3D" }}>
          Ao concluir, você ganha +{ex.miles_reward} milhas hoje.
        </p>
      )}
    </div>
  );
}
