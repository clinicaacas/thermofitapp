import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { ClientAppShell } from "@/components/client-app-shell";
import {
  listClientPhotos,
  uploadClientPhoto,
  deleteClientPhoto,
} from "@/lib/thermofit-client-app.functions";
import { useClientPhotosRealtime } from "@/hooks/use-client-photos-realtime";
import { invalidateClientMissionData } from "@/hooks/use-missions-realtime";
import { Camera, Check, Plus, Trash2, X } from "lucide-react";

export const Route = createFileRoute("/app/fotos")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

const TOTAL_WEEKS = 12;

function Page() {
  const { clientId } = useSearch({ from: "/app/fotos" });
  const qc = useQueryClient();
  const fetchPhotos = useServerFn(listClientPhotos);
  const uploadFn = useServerFn(uploadClientPhoto);
  const deleteFn = useServerFn(deleteClientPhoto);

  const { data, isLoading } = useQuery({
    queryKey: ["client-photos", clientId],
    queryFn: () => fetchPhotos({ data: { clientId } }),
    enabled: !!clientId,
  });

  // Realtime: invalida fotos e missões sem refresh manual.
  useClientPhotosRealtime(clientId || null, () => {
    invalidateClientMissionData(qc, clientId);
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [futureMsg, setFutureMsg] = useState<string | null>(null);

  const currentWeek: number = data?.currentWeek ?? 0;
  const journeyCompleted: boolean = !!data?.journeyCompleted;
  const hasStartDate: boolean = data?.hasStartDate !== false;
  const weekPhotoCounts: Record<number, number> = data?.weekPhotoCounts ?? {};
  const legacyCount: number = data?.legacyPhotoCount ?? 0;
  const photos: any[] = data?.photos ?? [];

  // Initial selection
  useEffect(() => {
    if (!data || selectedWeek !== null) return;
    if (!hasStartDate) {
      setSelectedWeek(null);
      return;
    }
    if (journeyCompleted) {
      let last = TOTAL_WEEKS;
      for (let w = TOTAL_WEEKS; w >= 1; w--) {
        if ((weekPhotoCounts[w] ?? 0) > 0) {
          last = w;
          break;
        }
      }
      setSelectedWeek(last);
    } else if (currentWeek >= 1 && currentWeek <= TOTAL_WEEKS) {
      setSelectedWeek(currentWeek);
    }
  }, [data, hasStartDate, journeyCompleted, currentWeek, weekPhotoCounts, selectedWeek]);

  const weekPhotos = useMemo(
    () => photos.filter((p) => typeof p.week === "number" && p.week === selectedWeek),
    [photos, selectedWeek],
  );
  const legacyPhotos = useMemo(
    () =>
      photos.filter(
        (p) => typeof p.week !== "number" || p.week < 1 || p.week > TOTAL_WEEKS,
      ),
    [photos],
  );

  const uploadMut = useMutation({
    mutationFn: (form: FormData) => uploadFn({ data: form }),
    onSuccess: () => {
      setFile(null);
      setPreview(null);
      setNotes("");
      setErr(null);
      setOkMsg("Foto enviada para sua evolução.");
      if (fileRef.current) fileRef.current.value = "";
      invalidateClientMissionData(qc, clientId);
    },
    onError: (e: any) => {
      setOkMsg(null);
      setErr(e?.message ?? "Não foi possível enviar a foto. Tente novamente.");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (photoId: string) => deleteFn({ data: { clientId, photoId } }),
    onSuccess: () => invalidateClientMissionData(qc, clientId),
  });

  function onPickFile(f: File | null) {
    setFile(f);
    setErr(null);
    setOkMsg(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  function submit() {
    if (!file) return;
    const fd = new FormData();
    fd.append("clientId", clientId);
    fd.append("file", file);
    if (notes) fd.append("notes", notes);
    uploadMut.mutate(fd);
  }

  function onClickWeek(w: number) {
    setFutureMsg(null);
    if (w > currentWeek && !journeyCompleted) {
      setSelectedWeek(w);
      setFutureMsg("Esta semana ainda não está disponível.");
      return;
    }
    setSelectedWeek(w);
  }

  const canUpload = hasStartDate && !journeyCompleted;
  const showingFuture = selectedWeek !== null && selectedWeek > currentWeek && !journeyCompleted;
  const showingCurrent = selectedWeek === currentWeek && !journeyCompleted;

  let emptyMsg = "Nenhuma foto registrada nesta semana.";
  if (showingFuture) emptyMsg = "Esta semana ainda não está disponível.";
  else if (showingCurrent) emptyMsg = "Você ainda não enviou sua foto desta semana.";

  return (
    <ClientAppShell title="Fotos de evolução">
      <div className="space-y-4">
        {journeyCompleted && (
          <div className="rounded-xl border border-[#E5D6BD] bg-[#FBF4E6] p-3 text-xs text-[#7A4A1F]">
            Sua jornada de 12 semanas foi concluída. Para novos registros, fale com a equipe.
          </div>
        )}
        {!hasStartDate && (
          <div className="rounded-xl border border-[#E5D6BD] bg-[#FBF4E6] p-3 text-xs text-[#7A4A1F]">
            Sua data de início ainda não foi definida. Fale com a equipe para liberar o envio de fotos.
          </div>
        )}

        {canUpload && (
          <div className="rounded-2xl border border-[#E5D6BD] bg-white p-3">
            {preview ? (
              <div className="relative mb-2 overflow-hidden rounded-lg bg-[#F3E8D2]">
                <img src={preview} alt="" className="max-h-28 w-full object-contain" />
                <button
                  onClick={() => onPickFile(null)}
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"
                  aria-label="Remover imagem"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="mb-2 flex h-[96px] w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#E5D6BD] bg-[#F8F1E6] px-3 text-[#8A6A3D] transition hover:border-[#8A6A3D]"
              >
                <Camera className="h-5 w-5" />
                <span className="text-sm font-medium">Tirar / escolher foto</span>
              </button>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1 flex h-9 items-center justify-center rounded-lg border border-[#E5D6BD] bg-[#F8F1E6] px-2 text-xs font-medium text-[#7A6A52]">
                Semana {currentWeek || "—"}
              </div>
              <input
                type="text"
                placeholder="Observação (opcional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={120}
                className="col-span-2 h-9 rounded-lg border border-[#E5D6BD] bg-white px-3 text-sm text-[#3D2E1C]"
              />
            </div>

            {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
            {okMsg && !err && <p className="mt-2 text-xs text-green-700">{okMsg}</p>}

            <button
              onClick={submit}
              disabled={!file || uploadMut.isPending}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#8A6A3D] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {uploadMut.isPending ? "Enviando…" : "Enviar foto"}
            </button>
          </div>
        )}

        {/* Linha do tempo de semanas */}
        {hasStartDate && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7A6A52]">
              Linha do tempo
            </p>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map((w) => {
                const count = weekPhotoCounts[w] ?? 0;
                const isFuture = !journeyCompleted && w > currentWeek;
                const isCurrent = !journeyCompleted && w === currentWeek;
                const isDone = count > 0;
                const isSelected = selectedWeek === w;
                const base =
                  "relative shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition";
                let cls = "border-[#E5D6BD] bg-white text-[#7A6A52]";
                if (isCurrent) cls = "border-[#8A6A3D] bg-[#FBF4E6] text-[#7A4A1F]";
                if (isFuture) cls = "border-[#EFE6D2] bg-[#F8F1E6] text-[#B8A98A]";
                if (isSelected)
                  cls = "border-[#8A6A3D] bg-[#8A6A3D] text-white";
                return (
                  <button
                    key={w}
                    onClick={() => onClickWeek(w)}
                    className={`${base} ${cls}`}
                    aria-pressed={isSelected}
                  >
                    Semana {w}
                    {isDone && (
                      <span
                        className={`ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full ${
                          isSelected ? "bg-white/25" : "bg-[#8A6A3D]/15"
                        }`}
                        aria-label="Concluída"
                      >
                        <Check className={`h-2.5 w-2.5 ${isSelected ? "text-white" : "text-[#8A6A3D]"}`} />
                      </span>
                    )}
                    {isCurrent && count === 0 && !isSelected && (
                      <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[#C8541E] align-middle" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Galeria filtrada */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#7A6A52]">
              Minhas fotos{selectedWeek ? ` — Semana ${selectedWeek}` : ""}
            </p>
          </div>
          {isLoading && <p className="text-sm text-[#7A6A52]">Carregando…</p>}
          {futureMsg && (
            <p className="mb-2 rounded-lg border border-[#E5D6BD] bg-[#F8F1E6] p-2 text-xs text-[#7A6A52]">
              {futureMsg}
            </p>
          )}
          {!isLoading && selectedWeek !== null && weekPhotos.length === 0 && (
            <div className="rounded-xl border border-dashed border-[#E5D6BD] bg-white p-6 text-center text-sm text-[#7A6A52]">
              {emptyMsg}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {weekPhotos.map((p: any) => (
              <PhotoCard
                key={p.id}
                p={p}
                onOpen={(u) => setViewing(u)}
                onDelete={(id) => {
                  if (confirm("Excluir esta foto?")) deleteMut.mutate(id);
                }}
              />
            ))}
          </div>
        </div>

        {/* Fotos anteriores (legadas) */}
        {legacyCount > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7A6A52]">
              Fotos anteriores
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {legacyPhotos.map((p: any) => (
                <PhotoCard
                  key={p.id}
                  p={p}
                  onOpen={(u) => setViewing(u)}
                  onDelete={(id) => {
                    if (confirm("Excluir esta foto?")) deleteMut.mutate(id);
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {viewing && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
          onClick={() => setViewing(null)}
        >
          <img src={viewing} alt="" className="max-h-[90vh] max-w-full rounded-xl object-contain" />
          <button
            onClick={() => setViewing(null)}
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-black/60 text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </ClientAppShell>
  );
}

function PhotoCard({
  p,
  onOpen,
  onDelete,
}: {
  p: any;
  onOpen: (url: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-[#E5D6BD] bg-[#F3E8D2]">
      <div className="aspect-square">
        {p.url ? (
          <button onClick={() => onOpen(p.url)} className="block h-full w-full">
            <img src={p.url} alt="" className="h-full w-full object-cover" />
          </button>
        ) : (
          <div className="grid h-full w-full place-items-center text-xs text-[#7A6A52]">
            Indisponível
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-[10px] text-white">
        {typeof p.week === "number" && p.week >= 1 && p.week <= TOTAL_WEEKS
          ? `Semana ${p.week} · `
          : ""}
        {new Date(p.taken_at).toLocaleDateString("pt-BR")}
        {p.notes ? <div className="mt-0.5 line-clamp-1 opacity-90">{p.notes}</div> : null}
      </div>
      <button
        onClick={() => onDelete(p.id)}
        className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
        aria-label="Excluir foto"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
