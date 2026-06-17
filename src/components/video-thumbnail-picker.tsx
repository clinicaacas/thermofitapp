import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { VideoThumbnail, youtubeThumb } from "./video-thumbnail";
import { ImagePlus, Sparkles, Trash2 } from "lucide-react";

export type ThumbState = {
  url: string;
  storageKey: string;
  source: "auto_video_frame" | "manual_upload" | "youtube" | "external_default" | "none";
};

type Props = {
  value: ThumbState;
  onChange: (s: ThumbState) => void;
  tenantId: string;
  videoIdHint?: string; // for storage path
  /** Provide the currently selected upload-File so we can extract a frame */
  videoFile?: File | null;
  /** YouTube URL when source is YouTube */
  youtubeUrl?: string;
};

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX = 5 * 1024 * 1024;

async function captureFrame(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      const url = URL.createObjectURL(file);
      video.src = url;
      const cleanup = () => URL.revokeObjectURL(url);
      video.onloadedmetadata = () => {
        const t = Math.min(Math.max(video.duration * 0.1, 1), 3);
        video.currentTime = isFinite(t) ? t : 1;
      };
      video.onseeked = () => {
        const canvas = document.createElement("canvas");
        const w = video.videoWidth || 1280;
        const h = video.videoHeight || 720;
        const ratio = 1280 / w;
        canvas.width = Math.round(w * Math.min(1, ratio));
        canvas.height = Math.round(h * Math.min(1, ratio));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          resolve(null);
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (b) => {
            cleanup();
            resolve(b);
          },
          "image/jpeg",
          0.85,
        );
      };
      video.onerror = () => {
        cleanup();
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

export function VideoThumbnailPicker({
  value,
  onChange,
  tenantId,
  videoIdHint,
  videoFile,
  youtubeUrl,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function uploadBlob(blob: Blob, ext: string, source: ThumbState["source"]) {
    setErr(null);
    setBusy("Enviando capa...");
    try {
      const id = videoIdHint || crypto.randomUUID();
      const key = `${tenantId}/${id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("video-thumbnails")
        .upload(key, blob, { contentType: blob.type || `image/${ext}`, upsert: false });
      if (error) throw error;
      const { data: signed } = await supabase.storage
        .from("video-thumbnails")
        .createSignedUrl(key, 3600);
      onChange({ url: signed?.signedUrl ?? "", storageKey: key, source });
    } catch (e) {
      setErr("Não foi possível enviar a capa. Tente novamente.");
    } finally {
      setBusy(null);
    }
  }

  async function onPickFile(f: File) {
    if (!ACCEPT.split(",").includes(f.type)) {
      setErr("Envie uma imagem em JPG, PNG ou WebP.");
      return;
    }
    if (f.size > MAX) {
      setErr("A imagem deve ter no máximo 5MB.");
      return;
    }
    await uploadBlob(f, f.type.split("/")[1] || "jpg", "manual_upload");
  }

  async function onAutoFrame() {
    if (!videoFile) return;
    setBusy("Gerando capa...");
    setErr(null);
    const blob = await captureFrame(videoFile);
    if (!blob) {
      setBusy(null);
      setErr("Não foi possível gerar a capa automaticamente. Envie uma imagem de capa manualmente.");
      return;
    }
    await uploadBlob(blob, "jpg", "auto_video_frame");
  }

  function onUseYoutube() {
    if (!youtubeUrl) return;
    const t = youtubeThumb(youtubeUrl);
    if (!t) {
      setErr("Não foi possível gerar a capa do YouTube. Envie uma imagem manualmente.");
      return;
    }
    onChange({ url: t, storageKey: "", source: "youtube" });
  }

  function onClear() {
    onChange({ url: "", storageKey: "", source: "none" });
  }

  const previewUrl = value.url || (youtubeUrl ? youtubeThumb(youtubeUrl) : null);

  return (
    <div className="space-y-2 rounded-lg border border-input bg-background p-3">
      <div className="flex gap-3">
        <div className="aspect-video w-40 shrink-0">
          <VideoThumbnail src={previewUrl ?? ""} className="h-full w-full" />
        </div>
        <div className="flex flex-1 flex-wrap items-start gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent"
          >
            <ImagePlus className="h-3 w-3" /> Escolher capa
          </button>
          {videoFile && (
            <button
              type="button"
              onClick={onAutoFrame}
              className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent"
            >
              <Sparkles className="h-3 w-3" /> Gerar capa do vídeo
            </button>
          )}
          {youtubeUrl && (
            <button
              type="button"
              onClick={onUseYoutube}
              className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent"
            >
              <Sparkles className="h-3 w-3" /> Usar capa do YouTube
            </button>
          )}
          {(value.url || value.storageKey) && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3 w-3" /> Remover capa
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPickFile(f);
              e.target.value = "";
            }}
          />
          <p className="w-full text-[11px] text-muted-foreground">
            Essa imagem aparecerá na biblioteca de vídeos e no app da cliente. JPG, PNG ou WebP até 5MB.
            Proporção recomendada 16:9.
          </p>
        </div>
      </div>
      {busy && <p className="text-xs text-muted-foreground">{busy}</p>}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
