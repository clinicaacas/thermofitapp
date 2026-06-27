import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Check } from "lucide-react";
import { useRef, useState } from "react";
import { getWeeklyPhotoState, submitWeeklyPhoto } from "@/lib/thermofit-missions.functions";
import { invalidateClientMissionData } from "@/hooks/use-missions-realtime";

async function fileToBase64(file: File): Promise<{ b64: string; mime: "image/jpeg" | "image/png" | "image/webp" }> {
  const buf = await file.arrayBuffer();
  let mime: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg";
  if (file.type === "image/png") mime = "image/png";
  else if (file.type === "image/webp") mime = "image/webp";
  // base64 encode
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { b64: btoa(binary), mime };
}

export function WeeklyPhotoCard({ clientId }: Props) {
  const qc = useQueryClient();
  const fetchState = useServerFn(getWeeklyPhotoState);
  const submitFn = useServerFn(submitWeeklyPhoto);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const { data } = useQuery({
    queryKey: ["weekly-photo-state", clientId],
    queryFn: () => fetchState({ data: { clientId } }),
    enabled: !!clientId,
    staleTime: 0,
  });

  const mut = useMutation({
    mutationFn: (vars: { contentBase64: string; mimeHint: "image/jpeg" | "image/png" | "image/webp"; note?: string }) =>
      submitFn({ data: { clientId, ...vars } }),
    onSuccess: () => {
      invalidateClientMissionData(qc, clientId);
      setNote("");
    },
  });

  const completed = !!data?.completed;
  const weekLabel = data?.week ? `Semana ${data.week}` : "Semana da jornada";

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error("Arquivo maior que 8MB.");
      const { b64, mime } = await fileToBase64(file);
      await mut.mutateAsync({ contentBase64: b64, mimeHint: mime, note: note.trim() || undefined });
    } catch (err: any) {
      setError(err?.message ?? "Falha ao enviar.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <section
      className="mt-3 rounded-2xl bg-white p-4"
      style={{ border: "1px solid #E5D6BD" }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold" style={{ color: "#1F2933" }}>
            Foto de evolução — {weekLabel}
          </h3>
          <p className="text-xs" style={{ color: "#6B7280" }}>
            {completed ? "Enviada nesta semana da jornada." : "Envie 1 foto por semana • +15 Milhas"}
          </p>
        </div>
        {completed ? (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: "#E8F2E5", color: "#3F7A3A" }}
          >
            <Check className="h-3 w-3" /> Concluída
          </span>
        ) : (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: "#F3E8D2", color: "#8A6A3D" }}
          >
            +15
          </span>
        )}
      </div>

      {!completed && (
        <>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            placeholder="Observação (opcional)"
            rows={2}
            className="mt-3 w-full rounded-xl px-3 py-2 text-sm"
            style={{ border: "1px solid #E5D6BD", background: "#FFFDF8", color: "#1F2933" }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy || mut.isPending}
            className="mt-2 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold"
            style={{ background: "#C9A24A", color: "#FFFFFF" }}
          >
            <Camera className="h-4 w-4" />
            {busy || mut.isPending ? "Enviando…" : "Tirar foto ou escolher"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="user"
            className="hidden"
            onChange={onPick}
          />
        </>
      )}
      {error && (
        <p className="mt-2 text-xs" style={{ color: "#B23A48" }}>{error}</p>
      )}
    </section>
  );
}

type Props = { clientId: string };
