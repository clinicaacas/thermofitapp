import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Camera } from "lucide-react";
import { useRef, useState } from "react";
import {
  getDailyRoutine,
  submitCheckin,
  submitMeal,
  submitWorkout,
  submitWorkoutPhoto,
} from "@/lib/thermofit-missions.functions";
import { invalidateClientMissionData } from "@/hooks/use-missions-realtime";

type Props = { clientId: string };

const MEALS: Array<{ value: "otima" | "ok" | "dificil"; label: string }> = [
  { value: "otima", label: "Ótima" },
  { value: "ok", label: "Ok" },
  { value: "dificil", label: "Difícil" },
];

const WORKOUTS: Array<{
  value: "musc_cardio" | "cardio" | "descanso";
  label: string;
}> = [
  { value: "musc_cardio", label: "Musculação + cardio" },
  { value: "cardio", label: "Só cardio" },
  { value: "descanso", label: "Hoje não treinei" },
];

export function DailyRoutineCard({ clientId }: Props) {
  const qc = useQueryClient();
  const fetchRoutine = useServerFn(getDailyRoutine);
  const submitCheckinFn = useServerFn(submitCheckin);
  const submitMealFn = useServerFn(submitMeal);
  const submitWorkoutFn = useServerFn(submitWorkout);
  const submitPhotoFn = useServerFn(submitWorkoutPhoto);
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ["daily-routine", clientId],
    queryFn: () => fetchRoutine({ data: { clientId } }),
    enabled: !!clientId,
    staleTime: 0,
  });

  const invalidate = () => {
    invalidateClientMissionData(qc, clientId);
  };

  const checkin = useMutation({
    mutationFn: () => submitCheckinFn({ data: { clientId } }),
    onSuccess: invalidate,
  });
  const meal = useMutation({
    mutationFn: (choice: "otima" | "ok" | "dificil") =>
      submitMealFn({ data: { clientId, choice } }),
    onSuccess: invalidate,
  });
  const workout = useMutation({
    mutationFn: (choice: "musc_cardio" | "cardio" | "descanso") =>
      submitWorkoutFn({ data: { clientId, choice } }),
    onSuccess: invalidate,
  });

  const onPickPhoto = async (file: File) => {
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const base64 = btoa(bin);
      const mime = (
        file.type === "image/png" || file.type === "image/webp"
          ? file.type
          : "image/jpeg"
      ) as "image/jpeg" | "image/png" | "image/webp";
      await submitPhotoFn({
        data: { clientId, contentBase64: base64, mimeType: mime, note: note || undefined },
      });
      invalidate();
      setNote("");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const checkinDone = !!data?.checkinDone;
  const mealChoice = data?.mealChoice ?? null;
  const workoutChoice = data?.workoutChoice ?? null;
  const workoutDone = workoutChoice === "musc_cardio" || workoutChoice === "cardio";
  const photoSent = !!data?.workoutPhotoPath;

  const Pill = ({
    active,
    children,
    onClick,
    disabled,
  }: {
    active?: boolean;
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60"
      style={{
        background: active ? "#C8A15A" : "#FFFFFF",
        color: active ? "#FFFFFF" : "#5B4A2E",
        border: "1px solid #E5D6BD",
      }}
    >
      {children}
    </button>
  );

  return (
    <section
      className="mt-4 rounded-2xl bg-white p-3"
      style={{ border: "1px solid #E5D6BD" }}
    >
      <h3
        className="mb-2 text-xs font-bold uppercase tracking-wider"
        style={{ color: "#8A6A3D" }}
      >
        Rotina de hoje
      </h3>

      {/* Check-in */}
      <div className="flex items-center justify-between gap-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: "#1F2933" }}>
            Me conta sua jornada
          </p>
          <p className="text-[11px]" style={{ color: "#6B7280" }}>
            Check-in diário · +5 milhas
          </p>
        </div>
        {checkinDone ? (
          <span
            className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: "#E8F2E5", color: "#3F7A3A" }}
          >
            <Check className="h-3 w-3" /> Check-in concluído · +5 milhas
          </span>
        ) : (
          <button
            type="button"
            disabled={checkin.isPending}
            onClick={() => checkin.mutate()}
            className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: "#C8A15A", color: "#FFFFFF" }}
          >
            Fazer check-in
          </button>
        )}
      </div>

      <div className="my-2 h-px" style={{ background: "#F3E8D2" }} />

      {/* Alimentação */}
      <div className="py-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: "#1F2933" }}>
              Como foi sua alimentação hoje?
            </p>
            <p className="text-[11px]" style={{ color: "#6B7280" }}>
              +5 milhas · pode editar no mesmo dia
            </p>
          </div>
          {mealChoice && (
            <span
              className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ background: "#E8F2E5", color: "#3F7A3A" }}
            >
              <Check className="h-3 w-3" /> +5 milhas
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {MEALS.map((m) => (
            <Pill
              key={m.value}
              active={mealChoice === m.value}
              disabled={meal.isPending}
              onClick={() => meal.mutate(m.value)}
            >
              {m.label}
            </Pill>
          ))}
        </div>
      </div>

      <div className="my-2 h-px" style={{ background: "#F3E8D2" }} />

      {/* Treino */}
      <div className="py-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: "#1F2933" }}>
              Como foi seu treino hoje?
            </p>
            <p className="text-[11px]" style={{ color: "#6B7280" }}>
              Realizado +10 · descanso sem pontuação
            </p>
          </div>
          {workoutChoice && (
            <span
              className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ background: "#E8F2E5", color: "#3F7A3A" }}
            >
              <Check className="h-3 w-3" />
              {workoutDone ? "+10 milhas" : "Registrado"}
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {WORKOUTS.map((w) => (
            <Pill
              key={w.value}
              active={workoutChoice === w.value}
              disabled={workout.isPending}
              onClick={() => workout.mutate(w.value)}
            >
              {w.label}
            </Pill>
          ))}
        </div>
      </div>

      {/* Foto do treino — só libera após treino realizado */}
      {workoutDone && (
        <>
          <div className="my-2 h-px" style={{ background: "#F3E8D2" }} />
          <div className="py-2">
            <p className="text-sm font-semibold" style={{ color: "#1F2933" }}>
              Envie uma foto do treino de hoje e ganhe mais 5 milhas
            </p>
            <p className="text-[11px]" style={{ color: "#6B7280" }}>
              A foto fica privada · concedido 1x por dia
            </p>
            {!photoSent && (
              <input
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                placeholder="Observação (opcional)"
                className="mt-2 w-full rounded-lg px-3 py-1.5 text-xs"
                style={{ border: "1px solid #E5D6BD", color: "#1F2933" }}
              />
            )}
            <div className="mt-2 flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPickPhoto(f);
                }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                style={{ background: "#C8A15A", color: "#FFFFFF" }}
              >
                <Camera className="h-3.5 w-3.5" />
                {busy ? "Enviando…" : photoSent ? "Reenviar foto" : "Enviar foto"}
              </button>
              {photoSent && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{ background: "#E8F2E5", color: "#3F7A3A" }}
                >
                  <Check className="h-3 w-3" /> Foto enviada
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
