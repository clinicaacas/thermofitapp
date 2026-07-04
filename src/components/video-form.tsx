import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UploadCloud, Video as VideoIcon } from "lucide-react";
import { saveVideo, getMyTenantId, listJourneyTargets } from "@/lib/thermofit-content.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  VideoThumbnailPicker,
  type ThumbState,
} from "@/components/video-thumbnail-picker";
import { youtubeThumb } from "@/components/video-thumbnail";

export type VideoFormInitial = {
  id?: string;
  title?: string;
  videoType?: string;
  releaseDay?: number | null;
  phase?: string;
  milesOnComplete?: number;
  minCompletionPct?: number;
  description?: string;
  url?: string;
  storageKey?: string;
  fileName?: string;
  category?: string;
  status?: string;
  thumbnailUrl?: string;
  thumbnailStorageKey?: string;
  thumbnailSource?: ThumbState["source"];
  journeyId?: string | null;
  journeyClientName?: string | null;
};


type SourceType = "upload" | "youtube" | "external_link";

type Form = {
  title: string;
  videoType: "manha" | "noite" | "audio" | "mensagem_especial" | "educativo" | "motivacional";
  releaseDay: string;
  phase: string;
  milesOnComplete: string;
  minCompletionPct: string;
  description: string;
  sourceType: SourceType;
  externalUrl: string;
  category: string;
  status: "ativo" | "rascunho" | "arquivado";
  visibility: "catalog" | "journey" | "";
  journeyId: string;
};


const YT_RE =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)[\w-]+/i;

function detectSource(initial?: VideoFormInitial): SourceType {
  if (!initial) return "upload";
  if (initial.storageKey) return "upload";
  const url = initial.url ?? "";
  if (YT_RE.test(url)) return "youtube";
  if (url) return "external_link";
  return "upload";
}

// Convenção oficial: `release_day` no banco é o próprio número humano do dia (1..84).
// 0 = conteúdo inicial (sempre disponível a partir do Dia 1).
export const PROGRAM_DURATION_DAYS = 84;
function releaseDayToHuman(rd: number | null | undefined): string {
  if (rd == null || Number.isNaN(Number(rd))) return "";
  return String(Number(rd));
}

function buildInitialForm(initial?: VideoFormInitial): Form {
  const source = detectSource(initial);
  // Em edição: visibilidade derivada do journey_id atual. Em criação: vazio (exige escolha).
  const isEditing = !!initial?.id;
  const visibility: Form["visibility"] = isEditing
    ? initial?.journeyId
      ? "journey"
      : "catalog"
    : "";
  return {
    title: initial?.title ?? "",
    videoType: (initial?.videoType as Form["videoType"]) || "manha",
    releaseDay: releaseDayToHuman(initial?.releaseDay),
    phase: initial?.phase ?? "",
    milesOnComplete: initial?.milesOnComplete == null ? "5" : String(initial.milesOnComplete),
    minCompletionPct:
      initial?.minCompletionPct == null ? "90" : String(initial.minCompletionPct),
    description: initial?.description ?? "",
    sourceType: source,
    externalUrl: source === "upload" ? "" : initial?.url ?? "",
    category: initial?.category ?? "",
    status: (initial?.status as Form["status"]) || "ativo",
    visibility,
    journeyId: initial?.journeyId ?? "",
  };
}


export function VideoForm({
  mode,
  initial,
  onSuccess,
  onCancel,
}: {
  mode: "create" | "edit";
  initial?: VideoFormInitial;
  onSuccess: () => void;
  onCancel?: () => void;
}) {
  const save = useServerFn(saveVideo);
  const getTenant = useServerFn(getMyTenantId);
  const fetchTargets = useServerFn(listJourneyTargets);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Form>(() => buildInitialForm(initial));
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [tenantId, setTenantId] = useState<string>("");
  const [targets, setTargets] = useState<{ clientId: string; clientName: string; journeyId: string }[]>([]);
  const [thumb, setThumb] = useState<ThumbState>({
    url: initial?.thumbnailUrl ?? "",
    storageKey: initial?.thumbnailStorageKey ?? "",
    source: (initial?.thumbnailSource as ThumbState["source"]) ?? "none",
  });
  // Keep existing storageKey/fileName from initial for edit mode when no new upload.
  const [existingStorageKey, setExistingStorageKey] = useState(initial?.storageKey ?? "");
  const [existingFileName, setExistingFileName] = useState(initial?.fileName ?? "");
  const [existingUploadUrl] = useState(
    initial?.storageKey ? initial?.url ?? "" : "",
  );

  useEffect(() => {
    getTenant().then((r) => setTenantId(r.tenantId)).catch(() => {});
    fetchTargets().then((r) => setTargets(r.targets)).catch(() => {});
  }, [getTenant, fetchTargets]);


  // Auto-set YouTube thumb when URL changes (only if no manual thumb yet).
  useEffect(() => {
    if (form.sourceType !== "youtube") return;
    if (thumb.source !== "none" && thumb.source !== "youtube") return;
    const t = youtubeThumb(form.externalUrl.trim());
    if (t && t !== thumb.url) {
      setThumb({ url: t, storageKey: "", source: "youtube" });
    }
  }, [form.sourceType, form.externalUrl]);

  function validate() {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = "Informe o título.";
    const miles = Number(form.milesOnComplete);
    if (Number.isNaN(miles) || miles < 0) e.milesOnComplete = "Milhas inválidas.";
    const pct = Number(form.minCompletionPct);
    if (Number.isNaN(pct) || pct < 1 || pct > 100)
      e.minCompletionPct = "Use um valor entre 1 e 100.";
    if (form.releaseDay !== "") {
      const human = Number(form.releaseDay);
      if (!Number.isInteger(human) || human < 0 || human > PROGRAM_DURATION_DAYS) {
        e.releaseDay = `Use um dia entre 0 e ${PROGRAM_DURATION_DAYS}.`;
      }
    }
    if (form.sourceType === "upload") {
      if (mode === "create" && !file) e.file = "Selecione um arquivo de vídeo.";
    } else if (form.sourceType === "youtube") {
      if (!YT_RE.test(form.externalUrl.trim())) e.externalUrl = "URL do YouTube inválida.";
    } else {
      try {
        new URL(form.externalUrl.trim());
      } catch {
        e.externalUrl = "URL inválida.";
      }
    }
    if (form.visibility !== "catalog" && form.visibility !== "journey") {
      e.visibility = "Escolha a visibilidade deste vídeo.";
    } else if (form.visibility === "journey" && !form.journeyId) {
      e.journeyId = "Selecione a jornada exclusiva.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }


  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    setSuccess(null);
    if (!validate()) return;
    setSaving(true);
    try {
      let storageKey = existingStorageKey;
      let publicUrl = form.externalUrl.trim();
      let fileName = existingFileName;

      if (form.sourceType === "upload") {
        if (file) {
          const { tenantId: tid } = await getTenant();
          const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const key = `${tid}/${crypto.randomUUID()}-${safe}`;
          setUploadPct(0);
          const { error: upErr } = await supabase.storage
            .from("videos")
            .upload(key, file, { contentType: file.type || "video/mp4", upsert: false });
          setUploadPct(100);
          if (upErr) throw new Error(`Falha no upload: ${upErr.message}`);
          storageKey = key;
          const { data: pub } = supabase.storage.from("videos").getPublicUrl(key);
          publicUrl = pub?.publicUrl ?? "";
          fileName = file.name;
          setExistingStorageKey(key);
          setExistingFileName(file.name);
        } else {
          // No new file: keep existing upload URL.
          publicUrl = existingUploadUrl;
        }
      } else {
        // Switched away from upload: clear storage references.
        storageKey = "";
        fileName = "";
      }

      await save({
        data: {
          id: initial?.id,
          patch: {
            title: form.title,
            description: form.description,
            url: publicUrl,
            thumbnailUrl:
              thumb.source === "youtube" ? thumb.url : thumb.storageKey ? "" : thumb.url,
            thumbnailStorageKey: thumb.storageKey,
            thumbnailSource: thumb.source,
            durationSeconds: 0,
            category: form.category || form.videoType,
            status: form.status,
            videoType: form.videoType,
            releaseDay: form.releaseDay === "" ? null : Number(form.releaseDay),
            phase: form.phase,
            milesOnComplete: Number(form.milesOnComplete) || 0,
            minCompletionPct: Number(form.minCompletionPct) || 90,
            fileName,
            storageKey,
            visibility: form.visibility === "" ? "catalog" : form.visibility,
            journeyId: form.visibility === "journey" ? form.journeyId : null,
          },
        },
      });

      setSuccess(
        mode === "edit" ? "Vídeo atualizado com sucesso." : "Vídeo cadastrado com sucesso.",
      );
      onSuccess();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : mode === "edit"
            ? "Não foi possível atualizar o vídeo. Tente novamente."
            : "Não foi possível cadastrar o vídeo. Tente novamente.",
      );
    } finally {
      setSaving(false);
      setUploadPct(null);
    }
  }

  const isDrive = /drive\.google\.com/i.test(form.externalUrl);

  return (
    <form onSubmit={onSubmit}>
      <div className="mb-5 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary">
          <VideoIcon className="h-4 w-4" />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          {mode === "edit" ? "Editar vídeo" : "Novo vídeo"}
        </h2>
      </div>

      <div className="space-y-3">
        <Field label="Título *" error={errors.title}>
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Ex: Vídeo de manhã — Semana 1"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo *">
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={form.videoType}
              onChange={(e) =>
                setForm({ ...form, videoType: e.target.value as Form["videoType"] })
              }
            >
              <option value="manha">Manhã</option>
              <option value="noite">Noite</option>
              <option value="audio">Áudio</option>
              <option value="mensagem_especial">Mensagem especial</option>
              <option value="educativo">Educativo</option>
              <option value="motivacional">Motivacional</option>
            </select>
          </Field>
          <Field label={`Liberar no dia da jornada (1 a ${PROGRAM_DURATION_DAYS})`} error={errors.releaseDay}>
            <Input
              type="number"
              min={1}
              max={PROGRAM_DURATION_DAYS}
              inputMode="numeric"
              value={form.releaseDay}
              onChange={(e) => setForm({ ...form, releaseDay: e.target.value })}
              placeholder="Ex: 1 = primeiro dia · 16 = décimo sexto dia"
            />
          </Field>

        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fase ThermoFit">
            <Input
              value={form.phase}
              onChange={(e) => setForm({ ...form, phase: e.target.value })}
              placeholder="Ex: Decolagem, Altitude..."
            />
          </Field>
          <Field label="Milhas ao concluir" error={errors.milesOnComplete}>
            <Input
              type="number"
              min={0}
              value={form.milesOnComplete}
              onChange={(e) => setForm({ ...form, milesOnComplete: e.target.value })}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="% mínima para concluir" error={errors.minCompletionPct}>
            <Input
              type="number"
              min={1}
              max={100}
              value={form.minCompletionPct}
              onChange={(e) => setForm({ ...form, minCompletionPct: e.target.value })}
            />
          </Field>
          <Field label="Status">
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={form.status}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value as Form["status"] })
              }
            >
              <option value="ativo">Ativo</option>
              <option value="rascunho">Rascunho</option>
              <option value="arquivado">Arquivado</option>
            </select>
          </Field>
        </div>

        <Field label="Visibilidade *" error={errors.visibility}>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                { v: "catalog", label: "Catálogo da clínica", hint: "Disponível para todas as clientes da clínica" },
                { v: "journey", label: "Exclusivo de uma jornada", hint: "Visível apenas para 1 cliente/jornada" },
              ] as { v: "catalog" | "journey"; label: string; hint: string }[]
            ).map((opt) => (
              <button
                type="button"
                key={opt.v}
                onClick={() => setForm({ ...form, visibility: opt.v })}
                className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                  form.visibility === opt.v
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input bg-background text-foreground hover:bg-accent"
                }`}
              >
                <div className="font-medium">{opt.label}</div>
                <div className="text-[11px] text-muted-foreground">{opt.hint}</div>
              </button>
            ))}
          </div>
          {form.visibility === "" && (
            <p className="mt-1 text-xs text-amber-600">
              Escolha onde este vídeo deve aparecer. Sem decisão explícita ele não pode ser salvo.
            </p>
          )}
          {form.visibility === "journey" && (
            <div className="mt-2">
              <Label className="mb-1 block text-xs font-medium">
                Cliente / jornada ativa *
              </Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={form.journeyId}
                onChange={(e) => setForm({ ...form, journeyId: e.target.value })}
              >
                <option value="">— Selecione a cliente —</option>
                {targets.map((t) => (
                  <option key={t.journeyId} value={t.journeyId}>
                    {t.clientName}
                  </option>
                ))}
              </select>
              {errors.journeyId && (
                <p className="mt-1 text-xs text-red-600">{errors.journeyId}</p>
              )}
              {targets.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Nenhuma cliente com jornada ativa nesta clínica.
                </p>
              )}
            </div>
          )}
          {mode === "edit" && form.visibility === "journey" && initial?.journeyClientName && (
            <p className="mt-2 text-xs text-muted-foreground">
              Atualmente exclusivo para: <strong>{initial.journeyClientName}</strong>
            </p>
          )}
        </Field>



        <Field label="Descrição">
          <Textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Contexto ou instrução para a cliente"
            className="min-h-[72px]"
          />
        </Field>

        <Field label="Origem do vídeo *">
          <div className="grid gap-2 sm:grid-cols-3">
            {(
              [
                { v: "upload", label: "Upload do computador" },
                { v: "youtube", label: "Link do YouTube" },
                { v: "external_link", label: "Link externo / Google Drive" },
              ] as { v: SourceType; label: string }[]
            ).map((opt) => (
              <button
                type="button"
                key={opt.v}
                onClick={() => setForm({ ...form, sourceType: opt.v })}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                  form.sourceType === opt.v
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input bg-background text-foreground hover:bg-accent"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>

        {form.sourceType === "upload" && (
          <div>
            <Label className="mb-1.5 block text-xs font-medium">Arquivo de vídeo</Label>
            <div className="flex items-center gap-3 rounded-lg border-2 border-dashed border-border bg-background/40 px-4 py-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <UploadCloud className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-muted-foreground">
                  {file
                    ? `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`
                    : existingFileName
                      ? `Atual: ${existingFileName}`
                      : "Selecione o arquivo de vídeo"}
                </div>
                <p className="truncate text-[11px] text-muted-foreground">
                  MP4, MOV, WEBM ou M4V.{" "}
                  {uploadPct !== null && `Enviando… ${uploadPct}%`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="shrink-0 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
              >
                {existingStorageKey ? "Substituir" : "Escolher"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.webm,.m4v"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            {errors.file && <p className="mt-1 text-xs text-red-600">{errors.file}</p>}
          </div>
        )}


        {form.sourceType === "youtube" && (
          <Field label="URL do YouTube *" error={errors.externalUrl}>
            <Input
              value={form.externalUrl}
              onChange={(e) => setForm({ ...form, externalUrl: e.target.value })}
              placeholder="Cole aqui o link do YouTube"
            />
          </Field>
        )}

        {form.sourceType === "external_link" && (
          <Field label="URL do vídeo *" error={errors.externalUrl}>
            <Input
              value={form.externalUrl}
              onChange={(e) => setForm({ ...form, externalUrl: e.target.value })}
              placeholder="Cole aqui o link compartilhável do Google Drive ou outro link externo"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Para links do Google Drive, use um arquivo com permissão de visualização liberada.
            </p>
            {isDrive && (
              <p className="mt-1 text-xs text-amber-600">
                Verifique se o link está compartilhado corretamente para visualização.
              </p>
            )}
          </Field>
        )}

        <Field label="Capa do vídeo">
          {tenantId ? (
            <VideoThumbnailPicker
              value={thumb}
              onChange={setThumb}
              tenantId={tenantId}
              videoIdHint={initial?.id}
              videoFile={form.sourceType === "upload" ? file : null}
              videoSrcUrl={
                form.sourceType === "upload" && existingUploadUrl ? existingUploadUrl : undefined
              }
              youtubeUrl={form.sourceType === "youtube" ? form.externalUrl.trim() : undefined}
            />
          ) : (
            <p className="text-xs text-muted-foreground">Carregando…</p>
          )}
          {form.sourceType === "external_link" && !thumb.url && (
            <p className="mt-1 text-xs text-amber-600">
              Para vídeos do Google Drive ou links externos, envie uma imagem de capa.
            </p>
          )}
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-emerald-600">{success}</p>}

        <div className="flex justify-end gap-2 pt-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving
              ? "Salvando…"
              : mode === "edit"
                ? "Salvar alterações"
                : "Salvar vídeo"}
          </button>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
