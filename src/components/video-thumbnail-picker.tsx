import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { supabase } from "@/integrations/supabase/client";
import { VideoThumbnail, youtubeThumb } from "./video-thumbnail";
import { ImagePlus, Sparkles, Trash2, X, Upload, Film } from "lucide-react";

export type ThumbState = {
  url: string;
  storageKey: string;
  source: "auto_video_frame" | "manual_upload" | "youtube" | "external_default" | "none";
};

type Props = {
  value: ThumbState;
  onChange: (s: ThumbState) => void;
  tenantId: string;
  videoIdHint?: string;
  /** A local File for the video, used for frame capture (newly uploaded video). */
  videoFile?: File | null;
  /** A URL pointing to the stored video, used for frame capture on existing videos. */
  videoSrcUrl?: string;
  /** YouTube URL when source is YouTube. */
  youtubeUrl?: string;
};

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX = 5 * 1024 * 1024;
const OUT_W = 1280;
const OUT_H = 720;

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return "00:00";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

async function readImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function cropToBlob(src: string, area: Area): Promise<{ blob: Blob; ext: string }> {
  const img = await readImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = OUT_W;
  canvas.height = OUT_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, OUT_W, OUT_H);
  const tryType = async (type: string): Promise<Blob | null> =>
    new Promise((r) => canvas.toBlob((b) => r(b), type, 0.88));
  let blob = await tryType("image/webp");
  let ext = "webp";
  if (!blob) {
    blob = await tryType("image/jpeg");
    ext = "jpg";
  }
  if (!blob) throw new Error("Falha ao gerar imagem");
  return { blob, ext };
}

export function VideoThumbnailPicker({
  value,
  onChange,
  tenantId,
  videoIdHint,
  videoFile,
  videoSrcUrl,
  youtubeUrl,
}: Props) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const previewUrl = value.url || (youtubeUrl ? youtubeThumb(youtubeUrl) : null);

  async function uploadBlob(blob: Blob, ext: string, source: ThumbState["source"]) {
    setErr(null);
    setBusy("Enviando capa...");
    try {
      const id = videoIdHint || crypto.randomUUID();
      const key = `${tenantId}/${id}/thumbnail-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("video-thumbnails")
        .upload(key, blob, { contentType: blob.type || `image/${ext}`, upsert: false });
      if (error) throw error;
      const { data: signed } = await supabase.storage
        .from("video-thumbnails")
        .createSignedUrl(key, 3600);
      // Best-effort: remove old thumbnail
      if (value.storageKey && value.storageKey !== key) {
        supabase.storage.from("video-thumbnails").remove([value.storageKey]).catch(() => {});
      }
      onChange({ url: signed?.signedUrl ?? "", storageKey: key, source });
      setEditorOpen(false);
    } catch {
      setErr("Não foi possível enviar a capa. Tente novamente.");
    } finally {
      setBusy(null);
    }
  }

  function onUseYoutube() {
    if (!youtubeUrl) return;
    const t = youtubeThumb(youtubeUrl);
    if (!t) {
      setErr("Não foi possível gerar a capa do YouTube. Envie uma imagem manualmente.");
      return;
    }
    if (value.storageKey) {
      supabase.storage.from("video-thumbnails").remove([value.storageKey]).catch(() => {});
    }
    onChange({ url: t, storageKey: "", source: "youtube" });
  }

  function onClear() {
    if (!confirm("Tem certeza que deseja remover a capa deste vídeo?")) return;
    if (value.storageKey) {
      supabase.storage.from("video-thumbnails").remove([value.storageKey]).catch(() => {});
    }
    onChange({ url: "", storageKey: "", source: "none" });
  }

  return (
    <div className="space-y-2 rounded-lg border border-input bg-background p-3">
      <div className="flex gap-3">
        <div className="aspect-video w-40 shrink-0">
          <VideoThumbnail src={previewUrl ?? ""} className="h-full w-full" />
        </div>
        <div className="flex flex-1 flex-wrap items-start gap-2">
          <button
            type="button"
            onClick={() => {
              setErr(null);
              setEditorOpen(true);
            }}
            className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent"
          >
            <ImagePlus className="h-3 w-3" /> {previewUrl ? "Editar capa" : "Escolher capa"}
          </button>
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
          <p className="w-full text-[11px] text-muted-foreground">
            Capa em 16:9 (JPG, PNG ou WebP, até 5MB). Use "Editar capa" para recortar, dar zoom
            ou capturar um frame do vídeo.
          </p>
        </div>
      </div>
      {busy && <p className="text-xs text-muted-foreground">{busy}</p>}
      {err && <p className="text-xs text-red-600">{err}</p>}

      {editorOpen && (
        <ThumbnailEditorModal
          onClose={() => setEditorOpen(false)}
          onApply={uploadBlob}
          videoFile={videoFile ?? null}
          videoSrcUrl={videoSrcUrl}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor Modal
// ---------------------------------------------------------------------------

function ThumbnailEditorModal({
  onClose,
  onApply,
  videoFile,
  videoSrcUrl,
}: {
  onClose: () => void;
  onApply: (blob: Blob, ext: string, source: ThumbState["source"]) => Promise<void>;
  videoFile: File | null;
  videoSrcUrl?: string;
}) {
  const canUseVideoTab = !!videoFile || !!videoSrcUrl;
  const [tab, setTab] = useState<"upload" | "video">(canUseVideoTab && !videoFile ? "video" : "upload");
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [pendingSource, setPendingSource] = useState<ThumbState["source"]>("manual_upload");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [applying, setApplying] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onCropComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), []);

  function reset() {
    if (imageSrc?.startsWith("blob:")) URL.revokeObjectURL(imageSrc);
    setImageSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
  }

  async function applyCrop() {
    if (!imageSrc || !area) return;
    setApplying(true);
    setErr(null);
    try {
      const { blob, ext } = await cropToBlob(imageSrc, area);
      await onApply(blob, ext, pendingSource);
    } catch {
      setErr("Não foi possível gerar a capa. Tente novamente.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Editar capa do vídeo</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 flex gap-1 rounded-md border border-input p-1 text-sm">
          <button
            type="button"
            onClick={() => {
              reset();
              setTab("upload");
            }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 font-medium ${
              tab === "upload" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
            }`}
          >
            <Upload className="h-3.5 w-3.5" /> Enviar imagem
          </button>
          <button
            type="button"
            onClick={() => {
              reset();
              setTab("video");
            }}
            disabled={!canUseVideoTab}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
              tab === "video" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
            }`}
          >
            <Film className="h-3.5 w-3.5" /> Escolher do vídeo
          </button>
        </div>

        {tab === "upload" && (
          <UploadTab
            onPicked={(src) => {
              setImageSrc(src);
              setPendingSource("manual_upload");
            }}
            onErr={setErr}
          />
        )}
        {tab === "video" && (
          <VideoFrameTab
            videoFile={videoFile}
            videoSrcUrl={videoSrcUrl}
            onPicked={(src) => {
              setImageSrc(src);
              setPendingSource("auto_video_frame");
            }}
            onErr={setErr}
          />
        )}

        {imageSrc && (
          <div className="mt-4 space-y-3">
            <div className="relative h-72 w-full overflow-hidden rounded-md bg-black">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={16 / 9}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Zoom</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1"
              />
            </div>
          </div>
        )}

        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-input px-3 py-2 text-sm hover:bg-accent"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!imageSrc || !area || applying}
            onClick={applyCrop}
            className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {applying ? "Salvando…" : "Aplicar capa"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UploadTab({
  onPicked,
  onErr,
}: {
  onPicked: (src: string) => void;
  onErr: (s: string | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="rounded-md border border-dashed border-border p-6 text-center">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
      >
        <Upload className="h-4 w-4" /> Selecionar imagem
      </button>
      <p className="mt-2 text-xs text-muted-foreground">
        JPG, PNG ou WebP até 5MB. Você poderá recortar, dar zoom e reposicionar.
      </p>
      <input
        ref={ref}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          onErr(null);
          if (!ACCEPT.split(",").includes(f.type)) {
            onErr("Envie uma imagem em JPG, PNG ou WebP.");
            return;
          }
          if (f.size > MAX) {
            onErr("A imagem deve ter no máximo 5MB.");
            return;
          }
          onPicked(URL.createObjectURL(f));
        }}
      />
    </div>
  );
}

function VideoFrameTab({
  videoFile,
  videoSrcUrl,
  onPicked,
  onErr,
}: {
  videoFile: File | null;
  videoSrcUrl?: string;
  onPicked: (src: string) => void;
  onErr: (s: string | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const src = useMemo(() => {
    if (videoFile) return URL.createObjectURL(videoFile);
    return videoSrcUrl ?? "";
  }, [videoFile, videoSrcUrl]);

  useEffect(() => {
    return () => {
      if (videoFile && src.startsWith("blob:")) URL.revokeObjectURL(src);
    };
  }, [src, videoFile]);

  async function captureNow() {
    const v = videoRef.current;
    if (!v) return;
    setCapturing(true);
    onErr(null);
    try {
      // Wait for seek to settle
      if (Math.abs(v.currentTime - time) > 0.05) {
        await new Promise<void>((resolve) => {
          const handler = () => {
            v.removeEventListener("seeked", handler);
            resolve();
          };
          v.addEventListener("seeked", handler);
          v.currentTime = time;
        });
      }
      const canvas = document.createElement("canvas");
      const w = v.videoWidth || 1280;
      const h = v.videoHeight || 720;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.drawImage(v, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      onPicked(dataUrl);
    } catch {
      onErr(
        "Não foi possível capturar a capa automaticamente. Envie uma imagem de capa manualmente.",
      );
    } finally {
      setCapturing(false);
    }
  }

  if (!src) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Este vídeo não permite captura automática. Use a aba "Enviar imagem".
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md bg-black">
        <video
          ref={videoRef}
          src={src}
          crossOrigin="anonymous"
          preload="metadata"
          playsInline
          muted
          className="aspect-video w-full"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            setDuration(v.duration || 0);
            const t = Math.min(Math.max(v.duration * 0.1, 1), 3);
            v.currentTime = isFinite(t) ? t : 1;
            setTime(isFinite(t) ? t : 1);
            setReady(true);
          }}
          onError={() =>
            onErr(
              "Não foi possível carregar este vídeo para captura. Tente enviar uma imagem manualmente.",
            )
          }
        />
      </div>
      {ready && (
        <>
          <div className="flex items-center gap-3">
            <span className="w-12 text-xs tabular-nums text-muted-foreground">{fmtTime(time)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(duration, 0.1)}
              step={0.1}
              value={time}
              onChange={(e) => {
                const t = Number(e.target.value);
                setTime(t);
                if (videoRef.current) videoRef.current.currentTime = t;
              }}
              className="flex-1"
            />
            <span className="w-12 text-xs tabular-nums text-muted-foreground">{fmtTime(duration)}</span>
          </div>
          <button
            type="button"
            onClick={captureNow}
            disabled={capturing}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" /> {capturing ? "Capturando…" : "Usar este frame como capa"}
          </button>
        </>
      )}
    </div>
  );
}
