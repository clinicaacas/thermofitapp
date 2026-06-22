import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ArrowUp, ArrowDown, Trash2, Upload, Plus, Image as ImageIcon, Sparkles } from "lucide-react";
import {
  adminGetVacuumData,
  adminSaveVacuumSettings,
  adminUpsertExercise,
  adminDeleteExercise,
  adminReorderExercises,
  adminUpsertGuidePage,
  adminReorderGuidePages,
  adminUploadVacuumAsset,
  adminGenerateExerciseMedia,
} from "@/lib/thermofit-vacuum.functions";


type Exercise = {
  id: string;
  order_index: number;
  name: string;
  short_description: string | null;
  prescription_text: string | null;
  thumbnail_url: string | null;
  thumbnail_signed_url: string | null;
  media_url: string | null;
  media_signed_url: string | null;
  media_type: string | null;
  instruction_text: string | null;
  duration_seconds: number | null;
  sets: number | null;
  reps: number | null;
  miles_reward: number | null;
  status: string;
};


type Page = {
  id: string;
  order_index: number;
  title: string;
  image_url: string | null;
  image_signed_url: string | null;
  alt_text: string | null;
  status: string;
};

export function AdminVacuumSettings() {
  const fetchAll = useServerFn(adminGetVacuumData);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-vacuum"],
    queryFn: () => fetchAll(),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <SettingsCard initial={data.settings} onSaved={() => qc.invalidateQueries({ queryKey: ["admin-vacuum"] })} />
      <ExercisesCard exercises={data.exercises ?? []} onChanged={() => qc.invalidateQueries({ queryKey: ["admin-vacuum"] })} />
      <GuidePagesCard pages={data.pages ?? []} onChanged={() => qc.invalidateQueries({ queryKey: ["admin-vacuum"] })} />
    </div>
  );
}

function SettingsCard({ initial, onSaved }: { initial: any; onSaved: () => void }) {
  const save = useServerFn(adminSaveVacuumSettings);
  const [f, setF] = useState({
    eyebrow: initial.eyebrow ?? "",
    title_first: initial.title_first ?? "",
    title_second: initial.title_second ?? "",
    subtitle: initial.subtitle ?? "",
    practice_tab_label: initial.practice_tab_label ?? "",
    guide_tab_label: initial.guide_tab_label ?? "",
    card_eyebrow: initial.card_eyebrow ?? "",
    card_title: initial.card_title ?? "",
    card_subtitle: initial.card_subtitle ?? "",
    estimated_time: initial.estimated_time ?? "",
    button_text: initial.button_text ?? "",
    skip_guide_text: initial.skip_guide_text ?? "",
    finish_guide_text: initial.finish_guide_text ?? "",
  });
  const [status, setStatus] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => save({ data: f }),
    onSuccess: () => {
      setStatus("Salvo.");
      onSaved();
    },
    onError: (e: any) => setStatus(e?.message ?? "Falha."),
  });

  const fields: [keyof typeof f, string][] = [
    ["eyebrow", "Eyebrow (ex: MÉTODO THERMOFIT)"],
    ["title_first", "Título — palavra 1 (preto)"],
    ["title_second", "Título — palavra 2 (dourado)"],
    ["subtitle", "Subtítulo"],
    ["practice_tab_label", "Aba — Praticar"],
    ["guide_tab_label", "Aba — Guia"],
    ["card_eyebrow", "Card — eyebrow"],
    ["card_title", "Card — título"],
    ["card_subtitle", "Card — subtítulo"],
    ["estimated_time", "Tempo estimado"],
    ["button_text", "Texto do botão"],
    ["skip_guide_text", "Texto — pular guia"],
    ["finish_guide_text", "Texto — última página"],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vacuum / Cintura Ativa — Textos</CardTitle>
        <CardDescription>Tudo aqui aparece na aba Vacuum do app da cliente.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {fields.map(([k, label]) => (
          <div key={k} className="space-y-1.5">
            <Label>{label}</Label>
            {k === "subtitle" ? (
              <Textarea rows={2} value={f[k]} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} />
            ) : (
              <Input value={f[k]} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} />
            )}
          </div>
        ))}
        <div className="sm:col-span-2 flex items-center justify-end gap-3">
          {status && <span className="text-xs text-muted-foreground">{status}</span>}
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Salvando…" : "Salvar textos"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ExercisesCard({ exercises, onChanged }: { exercises: Exercise[]; onChanged: () => void }) {
  const upsert = useServerFn(adminUpsertExercise);
  const del = useServerFn(adminDeleteExercise);
  const reorder = useServerFn(adminReorderExercises);
  const upload = useServerFn(adminUploadVacuumAsset);
  const generate = useServerFn(adminGenerateExerciseMedia);
  const [list, setList] = useState<Exercise[]>(exercises);
  const [status, setStatus] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);


  useEffect(() => setList(exercises), [exercises]);

  function update(idx: number, patch: Partial<Exercise>) {
    setList((p) => p.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }

  async function saveRow(row: Exercise) {
    try {
      await upsert({
        data: {
          id: row.id,
          order_index: row.order_index,
          name: row.name,
          short_description: row.short_description,
          prescription_text: row.prescription_text,
          thumbnail_url: row.thumbnail_url,
          media_url: row.media_url,
          media_type: (row.media_type as any) || null,
          instruction_text: row.instruction_text,
          duration_seconds: row.duration_seconds ?? 60,
          sets: row.sets ?? 3,
          reps: row.reps ?? null,
          miles_reward: row.miles_reward ?? 0,
          status: row.status as "ativo" | "inativo",
        },
      });
      setStatus("Exercício salvo.");
      onChanged();
    } catch (e: any) {
      setStatus(e?.message ?? "Falha ao salvar.");
    }
  }


  async function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[idx], next[j]] = [next[j], next[idx]];
    setList(next);
    await reorder({ data: { ids: next.map((x) => x.id) } });
    onChanged();
  }

  async function addNew() {
    try {
      await upsert({
        data: {
          order_index: list.length,
          name: "Novo exercício",
          short_description: "",
          prescription_text: "",
          thumbnail_url: null,
          status: "ativo",
        },
      });
      onChanged();
    } catch (e: any) {
      setStatus(e?.message ?? "Falha.");
    }
  }

  async function removeRow(id: string) {
    if (!confirm("Remover este exercício?")) return;
    await del({ data: { id } });
    onChanged();
  }

  async function pickThumb(idx: number, file: File) {
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "exercises");
      const res = await upload({ data: fd as any });
      update(idx, { thumbnail_url: res.storageKey });
      const row = { ...list[idx], thumbnail_url: res.storageKey };
      await saveRow(row);
    } catch (e: any) {
      setStatus(e?.message ?? "Falha no upload.");
    }
  }

  async function pickMedia(idx: number, file: File) {
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "exercise-media");
      const res = await upload({ data: fd as any });
      const ext = file.name.toLowerCase();
      const type = ext.endsWith(".gif")
        ? "gif"
        : ext.endsWith(".json") || ext.endsWith(".lottie")
          ? "lottie"
          : ext.endsWith(".mp4") || ext.endsWith(".webm") || ext.endsWith(".mov")
            ? "video"
            : "image";
      update(idx, { media_url: res.storageKey, media_type: type });
      const row = { ...list[idx], media_url: res.storageKey, media_type: type };
      await saveRow(row);
    } catch (e: any) {
      setStatus(e?.message ?? "Falha no upload da mídia.");
    }
  }

  async function generateMedia(idx: number) {
    const row = list[idx];
    if (!row.id) return;
    setGeneratingId(row.id);
    setStatus("Gerando imagem com IA…");
    try {
      const res = await generate({ data: { exerciseId: row.id } });
      update(idx, { media_url: res.storageKey, media_type: "image", media_signed_url: res.signedUrl });
      setStatus("Imagem gerada e salva. Para animação real, envie um GIF/MP4/WebM no campo Mídia demonstrativa.");
      onChanged();
    } catch (e: any) {
      setStatus(e?.message ?? "Falha ao gerar animação.");
    } finally {
      setGeneratingId(null);
    }
  }




  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Praticar — Exercícios</CardTitle>
          <CardDescription>Reordene, edite ou inative os 5 exercícios do protocolo.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={addNew}>
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {list.map((row, idx) => (
          <div key={row.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[64px_1fr_auto]">
            <ThumbPicker
              url={row.thumbnail_signed_url}
              onPick={(file) => pickThumb(idx, file)}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="Nome"
                value={row.name}
                onChange={(e) => update(idx, { name: e.target.value })}
              />
              <Input
                placeholder="Prescrição (ex.: 3x20s)"
                value={row.prescription_text ?? ""}
                onChange={(e) => update(idx, { prescription_text: e.target.value })}
              />
              <Input
                className="sm:col-span-2"
                placeholder="Descrição curta"
                value={row.short_description ?? ""}
                onChange={(e) => update(idx, { short_description: e.target.value })}
              />
              <Textarea
                className="sm:col-span-2 min-h-[60px] text-xs"
                placeholder="Instrução para execução guiada (ex.: Inspire pelo nariz por 4s, expire pela boca por 6s.)"
                value={row.instruction_text ?? ""}
                onChange={(e) => update(idx, { instruction_text: e.target.value })}
              />
              <Input
                type="number"
                min={0}
                placeholder="Duração (s)"
                value={row.duration_seconds ?? 60}
                onChange={(e) => update(idx, { duration_seconds: Number(e.target.value) || 0 })}
              />
              <Input
                type="number"
                min={1}
                placeholder="Séries"
                value={row.sets ?? 3}
                onChange={(e) => update(idx, { sets: Number(e.target.value) || 1 })}
              />
              <Input
                type="number"
                min={0}
                placeholder="Repetições (opcional)"
                value={row.reps ?? ""}
                onChange={(e) =>
                  update(idx, { reps: e.target.value === "" ? null : Number(e.target.value) })
                }
              />
              <Input
                type="number"
                min={0}
                placeholder="Milhas ao concluir"
                value={row.miles_reward ?? 0}
                onChange={(e) => update(idx, { miles_reward: Number(e.target.value) || 0 })}
              />
              <MediaPicker
                url={row.media_signed_url}
                type={row.media_type}
                onPick={(file) => pickMedia(idx, file)}
              />
              <Button
                size="sm"
                variant="outline"
                className="sm:col-span-2 gap-2"
                onClick={() => generateMedia(idx)}
                disabled={generatingId === row.id}
                title="A IA gera apenas uma imagem estática de referência. Para vídeo demonstrativo com movimento real, faça upload manual de MP4, WebM ou GIF no campo Mídia acima."
              >
                <Sparkles className="h-4 w-4" />
                {generatingId === row.id ? "Gerando…" : "Gerar imagem de referência (estática)"}
              </Button>

              <label className="flex items-center gap-2 text-xs">
                <Switch
                  checked={row.status === "ativo"}
                  onCheckedChange={(v) => update(idx, { status: v ? "ativo" : "inativo" })}
                />
                Ativo
              </label>
            </div>

            <div className="flex flex-col gap-1">
              <Button size="icon" variant="ghost" onClick={() => move(idx, -1)} disabled={idx === 0}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => move(idx, 1)} disabled={idx === list.length - 1}>
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => saveRow(row)}>
                Salvar
              </Button>
              <Button size="icon" variant="ghost" onClick={() => removeRow(row.id)}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          </div>
        ))}
        {status && <p className="text-xs text-muted-foreground">{status}</p>}
      </CardContent>
    </Card>
  );
}

function GuidePagesCard({ pages, onChanged }: { pages: Page[]; onChanged: () => void }) {
  const upsert = useServerFn(adminUpsertGuidePage);
  const reorder = useServerFn(adminReorderGuidePages);
  const upload = useServerFn(adminUploadVacuumAsset);
  const [list, setList] = useState<Page[]>(pages);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => setList(pages), [pages]);

  function update(idx: number, patch: Partial<Page>) {
    setList((p) => p.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }

  async function saveRow(row: Page) {
    try {
      await upsert({
        data: {
          id: row.id,
          order_index: row.order_index,
          title: row.title,
          image_url: row.image_url,
          alt_text: row.alt_text,
          status: row.status as "ativo" | "inativo",
        },
      });
      setStatus("Página salva.");
      onChanged();
    } catch (e: any) {
      setStatus(e?.message ?? "Falha ao salvar.");
    }
  }

  async function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[idx], next[j]] = [next[j], next[idx]];
    setList(next);
    await reorder({ data: { ids: next.map((x) => x.id) } });
    onChanged();
  }

  async function pickImage(idx: number, file: File) {
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "guide");
      const res = await upload({ data: fd as any });
      update(idx, { image_url: res.storageKey });
      const row = { ...list[idx], image_url: res.storageKey };
      await saveRow(row);
    } catch (e: any) {
      setStatus(e?.message ?? "Falha no upload.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Guia Completo — 12 páginas</CardTitle>
        <CardDescription>
          Envie cada página do PDF como imagem individual (JPG, PNG ou WebP). A conversão automática de PDF não está disponível — envie as páginas como imagens individuais.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {list.map((row, idx) => (
          <div key={row.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[96px_1fr_auto]">
            <PagePreview url={row.image_signed_url} onPick={(file) => pickImage(idx, file)} />
            <div className="grid gap-2">
              <Input
                placeholder="Título"
                value={row.title}
                onChange={(e) => update(idx, { title: e.target.value })}
              />
              <Input
                placeholder="Texto alternativo (acessibilidade)"
                value={row.alt_text ?? ""}
                onChange={(e) => update(idx, { alt_text: e.target.value })}
              />
              <label className="flex items-center gap-2 text-xs">
                <Switch
                  checked={row.status === "ativo"}
                  onCheckedChange={(v) => update(idx, { status: v ? "ativo" : "inativo" })}
                />
                Ativa
              </label>
            </div>
            <div className="flex flex-col gap-1">
              <Button size="icon" variant="ghost" onClick={() => move(idx, -1)} disabled={idx === 0}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => move(idx, 1)} disabled={idx === list.length - 1}>
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => saveRow(row)}>
                Salvar
              </Button>
            </div>
          </div>
        ))}
        {status && <p className="text-xs text-muted-foreground">{status}</p>}
      </CardContent>
    </Card>
  );
}

function ThumbPicker({ url, onPick }: { url: string | null; onPick: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <button
      type="button"
      onClick={() => ref.current?.click()}
      className="relative grid h-16 w-16 place-items-center overflow-hidden rounded-md border bg-muted"
      title="Trocar miniatura"
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <ImageIcon className="h-5 w-5 text-muted-foreground" />
      )}
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.currentTarget.value = "";
        }}
      />
    </button>
  );
}

function MediaPicker({
  url,
  type,
  onPick,
}: {
  url: string | null;
  type: string | null;
  onPick: (f: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="sm:col-span-2 flex items-center gap-2 rounded-md border bg-muted/30 p-2">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded-md border bg-background"
        title="Subir mídia demonstrativa"
      >
        {url && (type === "video" || type === "lottie") ? (
          <video src={url} className="h-full w-full object-cover" muted loop autoPlay playsInline />
        ) : url ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <Upload className="h-5 w-5 text-muted-foreground" />
        )}
      </button>
      <div className="text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Mídia demonstrativa</p>
        <p>Envie um GIF, MP4 ou WebM curto demonstrando o movimento. PNG/JPG será usado apenas como imagem estática.</p>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/gif,image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime,.gif,.mp4,.webm,.mov,.json,.lottie"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.currentTarget.value = "";
        }}
      />
    </div>
  );
}

function PagePreview({ url, onPick }: { url: string | null; onPick: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <button
      type="button"
      onClick={() => ref.current?.click()}
      className="relative grid aspect-[3/4] h-24 place-items-center overflow-hidden rounded-md border bg-muted"
      title="Trocar imagem da página"
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <Upload className="h-5 w-5 text-muted-foreground" />
      )}
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.currentTarget.value = "";
        }}
      />
    </button>
  );
}
