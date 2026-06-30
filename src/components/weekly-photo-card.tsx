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
      className="mt-2 rounded-2xl bg-white p-2.5"
      style={{ border: "1px solid #E5D6BD" }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-semibold leading-tight" style={{ color: "#1F2933" }}>
            Foto de evolução · {weekLabel}
          </h3>
          <p className="truncate text-[10px] leading-tight" style={{ color: "#6B7280" }}>
            {completed ? "Enviada nesta semana." : "1 foto por semana · +15"}
          </p>
        </div>
        {completed ? (
          <span
            className="shrink-0 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
            style={{ background: "#E8F2E5", color: "#3F7A3A" }}
          >
            <Check className="h-3 w-3" /> Concluída
          </span>
        ) : (
          <span
            className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
            style={{ background: "#F3E8D2", color: "#8A6A3D" }}
          >
            +15
          </span>
        )}
      </div>

      {!completed && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            placeholder="Observação (opcional)"
            className="min-w-0 flex-1 rounded-lg px-2 py-1 text-[11px]"
            style={{ border: "1px solid #E5D6BD", background: "#FFFDF8", color: "#1F2933" }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy || mut.isPending}
            className="shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: "#C9A24A", color: "#FFFFFF" }}
          >
            <Camera className="h-3 w-3" />
            {busy || mut.isPending ? "Enviando…" : "Enviar"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="user"
            className="hidden"
            onChange={onPick}
          />
        </div>
      )}
      {error && (
        <p className="mt-1 text-[10px]" style={{ color: "#B23A48" }}>{error}</p>
      )}
    </section>
  );
}

type Props = { clientId: string };

