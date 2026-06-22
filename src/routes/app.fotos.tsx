import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { ClientAppShell } from "@/components/client-app-shell";
import {
  listClientPhotos,
  uploadClientPhoto,
  deleteClientPhoto,
} from "@/lib/thermofit-client-app.functions";
import { Camera, Plus, Trash2, X } from "lucide-react";

export const Route = createFileRoute("/app/fotos")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

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

  const fileRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const currentWeek: number = data?.currentWeek ?? 0;
  const journeyCompleted: boolean = !!data?.journeyCompleted;
  const hasStartDate: boolean = data?.hasStartDate !== false;

  const uploadMut = useMutation({
    mutationFn: (form: FormData) => uploadFn({ data: form }),
    onSuccess: () => {
      setFile(null);
      setPreview(null);
      setNotes("");
      setErr(null);
      setOkMsg("Foto enviada para sua evolução.");
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["client-photos", clientId] });
    },
    onError: (e: any) => {
      setOkMsg(null);
      setErr(e?.message ?? "Não foi possível enviar a foto. Tente novamente.");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (photoId: string) => deleteFn({ data: { clientId, photoId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-photos", clientId] }),
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

  const photos = data?.photos ?? [];
  const canUpload = hasStartDate && !journeyCompleted;

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

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7A6A52]">
            Minhas fotos
          </p>
          {isLoading && <p className="text-sm text-[#7A6A52]">Carregando…</p>}
          {!isLoading && photos.length === 0 && (
            <div className="rounded-xl border border-dashed border-[#E5D6BD] bg-white p-8 text-center text-sm text-[#7A6A52]">
              Você ainda não enviou nenhuma foto.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((p: any) => (
              <div
                key={p.id}
                className="group relative aspect-square overflow-hidden rounded-xl border border-[#E5D6BD] bg-[#F3E8D2]"
              >
                {p.url ? (
                  <button
                    onClick={() => setViewing(p.url)}
                    className="block h-full w-full"
                  >
                    <img src={p.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ) : (
                  <div className="grid h-full w-full place-items-center text-xs text-[#7A6A52]">
                    Indisponível
                  </div>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-[10px] text-white">
                  {p.week ? `Semana ${p.week} · ` : ""}
                  {new Date(p.taken_at).toLocaleDateString("pt-BR")}
                </div>
                <button
                  onClick={() => {
                    if (confirm("Excluir esta foto?")) deleteMut.mutate(p.id);
                  }}
                  className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
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

