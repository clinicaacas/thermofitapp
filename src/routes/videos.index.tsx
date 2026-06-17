import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Plus, Trash2, Pencil, X } from "lucide-react";
import {
  listVideos,
  deleteVideo,
} from "@/lib/thermofit-content.functions";
import { VideoThumbnail } from "@/components/video-thumbnail";
import type { ThumbState } from "@/components/video-thumbnail-picker";
import { VideoForm, type VideoFormInitial } from "@/components/video-form";

export const Route = createFileRoute("/videos/")({
  head: () => ({ meta: [{ title: "Vídeos — ThermoFit" }] }),
  component: Page,
});

type V = {
  id: string;
  title: string;
  description: string;
  url: string;
  thumbnailUrl: string;
  thumbnailStorageKey: string;
  thumbnailSource: ThumbState["source"];
  durationSeconds: number;
  category: string;
  status: string;
  videoType: string;
  releaseDay: number | null;
  phase: string;
  milesOnComplete: number;
  minCompletionPct: number;
  fileName: string;
  storageKey: string;
};

function Page() {
  const qc = useQueryClient();
  const fetchAll = useServerFn(listVideos);
  const remove = useServerFn(deleteVideo);
  const { data, isLoading } = useQuery({ queryKey: ["videos"], queryFn: () => fetchAll() });
  const [editing, setEditing] = useState<V | null>(null);

  function openEdit(v: V) {
    setEditing(v);
  }
  function close() {
    setEditing(null);
  }

  async function onDelete(id: string) {
    if (!confirm("Excluir este vídeo?")) return;
    await remove({ data: { id } });
    await qc.invalidateQueries({ queryKey: ["videos"] });
  }

  const videos: V[] = data?.videos ?? [];

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Vídeos</h1>
            <p className="text-sm text-muted-foreground">
              {videos.length} vídeo{videos.length === 1 ? "" : "s"} na biblioteca
            </p>
          </div>
          <Link
            to="/videos/nova"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Novo vídeo
          </Link>
        </header>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

        {!isLoading && videos.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">Nenhum vídeo cadastrado ainda.</p>
            <Link
              to="/videos/nova"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Adicionar primeiro vídeo
            </Link>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {videos.map((v) => {
            const source = sourceOf(v);
            return (
              <div key={v.id} className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="aspect-video w-full">
                  <VideoThumbnail src={v.thumbnailUrl} alt={v.title} className="h-full w-full rounded-none" />
                </div>
                <div className="p-4">
                  <div className="truncate text-sm font-semibold text-foreground">{v.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {v.category} • {source} • {v.status}
                  </div>
                  {v.description && (
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{v.description}</p>
                  )}
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      onClick={() => openEdit(v)}
                      className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent"
                    >
                      <Pencil className="h-3 w-3" /> Editar
                    </button>
                    <button
                      onClick={() => onDelete(v.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3" /> Excluir
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <Dialog onClose={close} title="Editar vídeo">
          <VideoForm
            mode="edit"
            initial={editing as VideoFormInitial}
            onCancel={close}
            onSuccess={async () => {
              await qc.invalidateQueries({ queryKey: ["videos"] });
              close();
            }}
          />
        </Dialog>
      )}
    </AppShell>
  );
}

function Dialog({
  children,
  title,
  onClose,
}: {
  children: React.ReactNode;
  title: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-card p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function sourceOf(v: V): string {
  if (v.storageKey) return "Upload";
  const url: string = v.url ?? "";
  if (/youtube\.com|youtu\.be/i.test(url)) return "YouTube";
  if (/drive\.google\.com/i.test(url)) return "Drive";
  if (url) return "Link externo";
  return "—";
}

