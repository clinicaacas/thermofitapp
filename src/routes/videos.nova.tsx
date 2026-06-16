import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, UploadCloud, Video } from "lucide-react";
import { saveVideo, getMyTenantId } from "@/lib/thermofit-content.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/videos/nova")({
  head: () => ({ meta: [{ title: "Adicionar vídeo — ThermoFit" }] }),
  component: Page,
});

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
};

const initial: Form = {
  title: "",
  videoType: "manha",
  releaseDay: "",
  phase: "",
  milesOnComplete: "5",
  minCompletionPct: "90",
  description: "",
  sourceType: "upload",
  externalUrl: "",
};

const YT_RE =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)[\w-]+/i;

function Page() {
  const navigate = useNavigate();
  const save = useServerFn(saveVideo);
  const getTenant = useServerFn(getMyTenantId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Form>(initial);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = "Informe o título.";
    const miles = Number(form.milesOnComplete);
    if (Number.isNaN(miles) || miles < 0) e.milesOnComplete = "Milhas inválidas.";
    const pct = Number(form.minCompletionPct);
    if (Number.isNaN(pct) || pct < 1 || pct > 100)
      e.minCompletionPct = "Use um valor entre 1 e 100.";
    if (form.releaseDay !== "") {
      const d = Number(form.releaseDay);
      if (Number.isNaN(d) || d < 0) e.releaseDay = "Dia inválido.";
    }
    if (form.sourceType === "upload") {
      if (!file) e.file = "Selecione um arquivo de vídeo.";
    } else if (form.sourceType === "youtube") {
      if (!YT_RE.test(form.externalUrl.trim())) e.externalUrl = "URL do YouTube inválida.";
    } else {
      try {
        new URL(form.externalUrl.trim());
      } catch {
        e.externalUrl = "URL inválida.";
      }
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
      let storageKey = "";
      let publicUrl = form.externalUrl.trim();
      let fileName = "";

      if (form.sourceType === "upload" && file) {
        const { tenantId } = await getTenant();
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const key = `${tenantId}/${crypto.randomUUID()}-${safe}`;
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
      }

      // Encode sourceType in phase prefix-free; we use a dedicated marker in fileName when empty
      // Simpler: store sourceType marker in description-independent fields:
      // - storageKey present => upload
      // - YT_RE matches url => youtube
      // - otherwise => external_link
      await save({
        data: {
          patch: {
            title: form.title,
            description: form.description,
            url: publicUrl,
            thumbnailUrl: "",
            durationSeconds: 0,
            category: form.videoType,
            status: "ativo",
            videoType: form.videoType,
            releaseDay: form.releaseDay === "" ? null : Number(form.releaseDay),
            phase: form.phase,
            milesOnComplete: Number(form.milesOnComplete) || 0,
            minCompletionPct: Number(form.minCompletionPct) || 90,
            fileName,
            storageKey,
          },
        },
      });
      setSuccess("Vídeo cadastrado com sucesso.");
      setTimeout(() => navigate({ to: "/videos" }), 600);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível cadastrar o vídeo. Tente novamente.",
      );
    } finally {
      setSaving(false);
      setUploadPct(null);
    }
  }

  const isDrive = /drive\.google\.com/i.test(form.externalUrl);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center gap-3">
          <Link
            to="/videos"
            aria-label="Voltar"
            className="grid h-9 w-9 place-items-center rounded-md border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Adicionar vídeo</h1>
            <p className="text-sm text-muted-foreground">
              Upload, YouTube ou link compartilhável
            </p>
          </div>
        </header>

        <form
          onSubmit={onSubmit}
          className="rounded-lg border border-border bg-card p-6 shadow-sm"
        >
          <div className="mb-5 flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary">
              <Video className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold text-foreground">Novo vídeo</h2>
          </div>

          <div className="space-y-4">
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
              <Field label="Liberar no dia da jornada" error={errors.releaseDay}>
                <Input
                  inputMode="numeric"
                  value={form.releaseDay}
                  onChange={(e) => setForm({ ...form, releaseDay: e.target.value })}
                  placeholder="Ex: 1 (desde o início)"
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

            <div className="grid sm:grid-cols-2">
              <Field label="% mínima para concluir" error={errors.minCompletionPct}>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={form.minCompletionPct}
                  onChange={(e) => setForm({ ...form, minCompletionPct: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Descrição">
              <Textarea
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Contexto ou instrução para a cliente"
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
                <div className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-background/40 px-6 py-10 text-center">
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
                    <UploadCloud className="h-6 w-6" />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {file
                      ? `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`
                      : "Selecione o arquivo de vídeo"}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
                  >
                    Escolher arquivo
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.webm,.m4v"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    MP4, MOV, WEBM ou M4V.{" "}
                    {uploadPct !== null && `Enviando… ${uploadPct}%`}
                  </p>
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
                  Para links do Google Drive, use um arquivo com permissão de visualização
                  liberada para quem tiver o link.
                </p>
                {isDrive && (
                  <p className="mt-1 text-xs text-amber-600">
                    Verifique se o link está compartilhado corretamente para visualização.
                  </p>
                )}
              </Field>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-emerald-600">{success}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Link
                to="/videos"
                className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                Cancelar
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Salvando…" : "Salvar vídeo"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </AppShell>
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
