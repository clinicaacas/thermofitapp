import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminListClientPhotos,
  adminUploadClientPhoto,
  adminUpdateClientPhoto,
  adminDeleteClientPhoto,
} from "@/lib/thermofit-admin-photos.functions";
import { useClientPhotosRealtime } from "@/hooks/use-client-photos-realtime";
import { Camera, Check, EyeOff, Pencil, Plus, Trash2, Upload, X } from "lucide-react";

const TOTAL_WEEKS = 12;

export function AdminClientPhotosPanel({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const fetchPhotos = useServerFn(adminListClientPhotos);
  const uploadFn = useServerFn(adminUploadClientPhoto);
  const updateFn = useServerFn(adminUpdateClientPhoto);
  const deleteFn = useServerFn(adminDeleteClientPhoto);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-client-photos", clientId],
    queryFn: () => fetchPhotos({ data: { clientId } }),
    enabled: !!clientId,
  });

  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const currentWeek: number = data?.currentWeek ?? 0;
  const journeyCompleted: boolean = !!data?.journeyCompleted;
  const hasStartDate: boolean = data?.hasStartDate !== false;
  const weekPhotoCounts: Record<number, number> = data?.weekPhotoCounts ?? {};
  const photos: any[] = data?.photos ?? [];

  useEffect(() => {
    if (!data || selectedWeek !== null) return;
    if (journeyCompleted) {
      let last = TOTAL_WEEKS;
      for (let w = TOTAL_WEEKS; w >= 1; w--) {
        if ((weekPhotoCounts[w] ?? 0) > 0) {
          last = w;
          break;
        }
      }
      setSelectedWeek(last);
    } else if (hasStartDate && currentWeek >= 1 && currentWeek <= TOTAL_WEEKS) {
      setSelectedWeek(currentWeek);
    } else {
      setSelectedWeek(1);
    }
  }, [data, journeyCompleted, hasStartDate, currentWeek, weekPhotoCounts, selectedWeek]);

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
      setShowUpload(false);
      qc.invalidateQueries({ queryKey: ["admin-client-photos", clientId] });
      qc.invalidateQueries({ queryKey: ["client-stats", clientId] });
    },
  });
  const updateMut = useMutation({
    mutationFn: (input: { photoId: string; patch: any }) =>
      updateFn({ data: { clientId, photoId: input.photoId, ...input.patch } }),
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-client-photos", clientId] });
    },
  });
  const deleteMut = useMutation({
    mutationFn: (photoId: string) => deleteFn({ data: { clientId, photoId } }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admin-client-photos", clientId] }),
  });

  const defaultUploadWeek = journeyCompleted
    ? TOTAL_WEEKS
    : hasStartDate && currentWeek >= 1 && currentWeek <= TOTAL_WEEKS
      ? currentWeek
      : null;

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Fotos de evolução</h2>
          <p className="text-xs text-muted-foreground">
            {hasStartDate
              ? journeyCompleted
                ? `Jornada concluída · semana real ${data?.actualJourneyWeek ?? "—"}`
                : `Semana atual da cliente: ${currentWeek || "—"}`
              : "Cliente sem data de início definida"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowUpload(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Adicionar foto
        </button>
      </div>

      {/* Linha do tempo */}
      <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map((w) => {
          const count = weekPhotoCounts[w] ?? 0;
          const isCurrent = !journeyCompleted && w === currentWeek;
          const isDone = count > 0;
          const isSelected = selectedWeek === w;
          let cls = "border-input bg-card text-foreground";
          if (isCurrent) cls = "border-primary bg-primary/10 text-foreground";
          if (isSelected) cls = "border-primary bg-primary text-primary-foreground";
          return (
            <button
              key={w}
              type="button"
              onClick={() => setSelectedWeek(w)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${cls}`}
              aria-pressed={isSelected}
            >
              Semana {w}
              {isDone && (
                <span
                  className={`ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full ${isSelected ? "bg-white/25" : "bg-primary/15"}`}
                >
                  <Check className={`h-2.5 w-2.5 ${isSelected ? "text-white" : "text-primary"}`} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Fotos da semana {selectedWeek ?? "—"}
        </p>
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!isLoading && weekPhotos.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nenhuma foto nesta semana.
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {weekPhotos.map((p) => (
            <AdminPhotoCard
              key={p.id}
              p={p}
              onOpen={(u) => setViewing(u)}
              onEdit={() => setEditing(p)}
              onToggleVisibility={() =>
                updateMut.mutate({
                  photoId: p.id,
                  patch: { visibleToClient: !p.visible_to_client },
                })
              }
              onDelete={() => {
                if (
                  confirm(
                    "Excluir esta foto removerá o registro e o arquivo associado. Esta ação não poderá ser desfeita.",
                  )
                )
                  deleteMut.mutate(p.id);
              }}
            />
          ))}
        </div>
      </div>

      {legacyPhotos.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Fotos anteriores
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {legacyPhotos.map((p) => (
              <AdminPhotoCard
                key={p.id}
                p={p}
                onOpen={(u) => setViewing(u)}
                onEdit={() => setEditing(p)}
                onToggleVisibility={() =>
                  updateMut.mutate({
                    photoId: p.id,
                    patch: { visibleToClient: !p.visible_to_client },
                  })
                }
                onDelete={() => {
                  if (
                    confirm(
                      "Excluir esta foto removerá o registro e o arquivo associado. Esta ação não poderá ser desfeita.",
                    )
                  )
                    deleteMut.mutate(p.id);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {showUpload && (
        <UploadDialog
          clientId={clientId}
          defaultWeek={defaultUploadWeek}
          onClose={() => setShowUpload(false)}
          onSubmit={(fd) => uploadMut.mutate(fd)}
          submitting={uploadMut.isPending}
          error={(uploadMut.error as any)?.message ?? null}
        />
      )}

      {editing && (
        <EditDialog
          photo={editing}
          onClose={() => setEditing(null)}
          onSubmit={(patch) => updateMut.mutate({ photoId: editing.id, patch })}
          submitting={updateMut.isPending}
          error={(updateMut.error as any)?.message ?? null}
        />
      )}

      {viewing && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
          onClick={() => setViewing(null)}
        >
          <img src={viewing} alt="" className="max-h-[90vh] max-w-full rounded-xl object-contain" />
          <button
            type="button"
            onClick={() => setViewing(null)}
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-black/60 text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </section>
  );
}

function AdminPhotoCard({
  p,
  onOpen,
  onEdit,
  onToggleVisibility,
  onDelete,
}: {
  p: any;
  onOpen: (u: string) => void;
  onEdit: () => void;
  onToggleVisibility: () => void;
  onDelete: () => void;
}) {
  const isAdmin = p.source === "admin_upload";
  const hidden = p.visible_to_client === false;
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-muted/20">
      <div className="relative aspect-square bg-muted">
        {p.url ? (
          <button
            type="button"
            onClick={() => onOpen(p.url)}
            className="block h-full w-full"
          >
            <img src={p.url} alt="" className="h-full w-full object-cover" />
          </button>
        ) : (
          <div className="grid h-full w-full place-items-center text-xs text-muted-foreground">
            Indisponível
          </div>
        )}
        {hidden && (
          <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white">
            <EyeOff className="h-3 w-3" /> Oculta
          </span>
        )}
      </div>
      <div className="space-y-1 p-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">
            {new Date(p.taken_at).toLocaleDateString("pt-BR")}
          </span>
          <span
            className={
              "rounded-full px-1.5 py-0.5 text-[10px] " +
              (isAdmin
                ? "bg-blue-100 text-blue-700"
                : "bg-emerald-100 text-emerald-700")
            }
          >
            {isAdmin ? "Enviada pela equipe" : "Enviada pela cliente"}
          </span>
        </div>
        {p.notes ? (
          <p className="line-clamp-2 text-foreground/80">{p.notes}</p>
        ) : (
          <p className="italic text-muted-foreground">Sem observação</p>
        )}
        <div className="flex gap-1 pt-1">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-input bg-card px-2 py-1 hover:bg-accent"
          >
            <Pencil className="h-3 w-3" /> Editar
          </button>
          <button
            type="button"
            onClick={onToggleVisibility}
            className="inline-flex items-center justify-center gap-1 rounded border border-input bg-card px-2 py-1 hover:bg-accent"
            title={hidden ? "Mostrar para a cliente" : "Ocultar da cliente"}
          >
            <EyeOff className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center justify-center gap-1 rounded border border-red-200 bg-card px-2 py-1 text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function UploadDialog({
  clientId,
  defaultWeek,
  onClose,
  onSubmit,
  submitting,
  error,
}: {
  clientId: string;
  defaultWeek: number | null;
  onClose: () => void;
  onSubmit: (fd: FormData) => void;
  submitting: boolean;
  error: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [week, setWeek] = useState<number>(defaultWeek ?? 1);
  const [notes, setNotes] = useState("");
  const [visible, setVisible] = useState(true);

  function pick(f: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  function submit() {
    if (!file) return;
    const fd = new FormData();
    fd.append("clientId", clientId);
    fd.append("file", file);
    fd.append("week", String(week));
    if (notes) fd.append("notes", notes);
    fd.append("visibleToClient", visible ? "true" : "false");
    onSubmit(fd);
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-base font-semibold">Adicionar foto pela equipe</h3>

        {preview ? (
          <div className="relative mb-3 overflow-hidden rounded-md bg-muted">
            <img src={preview} alt="" className="max-h-48 w-full object-contain" />
            <button
              type="button"
              onClick={() => pick(null)}
              className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mb-3 flex h-28 w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-input text-sm text-muted-foreground hover:border-primary"
          >
            <Upload className="h-5 w-5" /> Escolher imagem
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />

        <label className="mb-3 block text-xs">
          <span className="mb-1 block text-muted-foreground">Semana *</span>
          <select
            value={week}
            onChange={(e) => setWeek(parseInt(e.target.value, 10))}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map((w) => (
              <option key={w} value={w}>
                Semana {w}
              </option>
            ))}
          </select>
        </label>

        <label className="mb-3 block text-xs">
          <span className="mb-1 block text-muted-foreground">Observação (opcional)</span>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>

        <label className="mb-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={visible}
            onChange={(e) => setVisible(e.target.checked)}
          />
          <span>Visível no App da Cliente</span>
        </label>

        {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-input px-3 py-2 text-sm hover:bg-accent"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!file || submitting}
            onClick={submit}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Camera className="h-4 w-4" />
            {submitting ? "Enviando…" : "Salvar foto"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditDialog({
  photo,
  onClose,
  onSubmit,
  submitting,
  error,
}: {
  photo: any;
  onClose: () => void;
  onSubmit: (patch: { week?: number | null; notes?: string | null; visibleToClient?: boolean }) => void;
  submitting: boolean;
  error: string | null;
}) {
  const initialWeek =
    typeof photo.week === "number" && photo.week >= 1 && photo.week <= TOTAL_WEEKS
      ? photo.week
      : "";
  const [week, setWeek] = useState<number | "">(initialWeek as any);
  const [notes, setNotes] = useState<string>(photo.notes ?? "");
  const [visible, setVisible] = useState<boolean>(photo.visible_to_client !== false);

  function submit() {
    const patch: any = {};
    if (week !== "" && week !== photo.week) patch.week = week;
    if ((notes || "") !== (photo.notes || "")) patch.notes = notes || null;
    if (visible !== (photo.visible_to_client !== false)) patch.visibleToClient = visible;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    onSubmit(patch);
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-base font-semibold">Editar foto</h3>

        {photo.url && (
          <div className="mb-3 overflow-hidden rounded-md bg-muted">
            <img src={photo.url} alt="" className="max-h-40 w-full object-contain" />
          </div>
        )}

        <label className="mb-3 block text-xs">
          <span className="mb-1 block text-muted-foreground">Semana</span>
          <select
            value={week === "" ? "" : String(week)}
            onChange={(e) =>
              setWeek(e.target.value === "" ? "" : (parseInt(e.target.value, 10) as any))
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— sem semana —</option>
            {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map((w) => (
              <option key={w} value={w}>
                Semana {w}
              </option>
            ))}
          </select>
        </label>

        <label className="mb-3 block text-xs">
          <span className="mb-1 block text-muted-foreground">Observação</span>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>

        <label className="mb-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={visible}
            onChange={(e) => setVisible(e.target.checked)}
          />
          <span>Visível no App da Cliente</span>
        </label>

        {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-input px-3 py-2 text-sm hover:bg-accent"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
