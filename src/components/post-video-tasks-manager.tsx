import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Plus, Archive, Pencil, Send } from "lucide-react";
import {
  listPostVideoTasks,
  savePostVideoTask,
  archivePostVideoTask,
  applyTaskToCompletedClients,
} from "@/lib/thermofit-post-video-tasks.functions";
import { listVideos } from "@/lib/thermofit-content.functions";

type Props = { tenantId: string };

export function PostVideoTasksManager({ tenantId }: Props) {
  const qc = useQueryClient();
  const fetchTasks = useServerFn(listPostVideoTasks);
  const fetchVideos = useServerFn(listVideos);
  const saveFn = useServerFn(savePostVideoTask);
  const archiveFn = useServerFn(archivePostVideoTask);
  const applyFn = useServerFn(applyTaskToCompletedClients);

  const [includeArchived, setIncludeArchived] = useState(false);
  const [videoFilter, setVideoFilter] = useState<string>("");
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);

  const videos = useQuery({
    queryKey: ["videos-list", tenantId],
    queryFn: () => fetchVideos(),
    enabled: !!tenantId,
  });

  const tasks = useQuery({
    queryKey: ["post-video-tasks", tenantId, videoFilter, includeArchived],
    queryFn: () =>
      fetchTasks({
        data: {
          tenantId,
          videoId: videoFilter || undefined,
          includeArchived,
        },
      }),
    enabled: !!tenantId,
  });

  const save = useMutation({
    mutationFn: (payload: any) => saveFn({ data: { ...payload, tenantId } }),
    onSuccess: () => {
      setEditing(null);
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["post-video-tasks", tenantId] });
    },
  });
  const archive = useMutation({
    mutationFn: (id: string) => archiveFn({ data: { id, tenantId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["post-video-tasks", tenantId] }),
  });
  const applyMut = useMutation({
    mutationFn: (taskId: string) => applyFn({ data: { taskId, tenantId } }),
  });

  const videoList: any[] = (videos.data as any)?.videos ?? (videos.data as any) ?? [];
  const rows: any[] = (tasks.data as any)?.tasks ?? [];
  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const r of rows) {
      const k = r.video_id;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return Array.from(map.entries()).map(([videoId, items]) => ({
      videoId,
      video: items[0]?.video ?? videoList.find((v) => v.id === videoId),
      items,
    }));
  }, [rows, videoList]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={videoFilter}
          onChange={(e) => setVideoFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">Todos os vídeos</option>
          {videoList.map((v) => (
            <option key={v.id} value={v.id}>
              {v.title}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
          Mostrar arquivadas
        </label>
        <div className="flex-1" />
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Nova tarefa
        </button>
      </div>

      {tasks.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : grouped.length === 0 ? (
        <p className="rounded-md border border-dashed border-input p-6 text-center text-sm text-muted-foreground">
          Nenhuma tarefa pós-vídeo cadastrada.
        </p>
      ) : (
        <div className="space-y-3">
          {grouped.map((g) => (
            <section key={g.videoId} className="rounded-md border border-input bg-card">
              <header className="border-b border-border px-3 py-2 text-sm font-semibold">
                {g.video?.title ?? "Vídeo"}
              </header>
              <ul className="divide-y divide-border">
                {g.items.map((t) => (
                  <li key={t.id} className="flex items-start justify-between gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">#{t.ordering} · {t.title}</span>
                        {t.archived_at && <Badge tone="muted">Arquivada</Badge>}
                        {!t.archived_at && (t.active ? <Badge tone="ok">Ativa</Badge> : <Badge tone="muted">Inativa</Badge>)}
                        {t.journey_id ? <Badge tone="warn">Exclusiva</Badge> : <Badge tone="info">Catálogo</Badge>}
                      </div>
                      {t.instruction && <p className="text-xs text-muted-foreground">{t.instruction}</p>}
                      <p className="text-xs text-muted-foreground">
                        +{t.miles} Milhas · {t.response_required ? "Resposta obrigatória" : "Sem resposta"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        title="Aplicar a clientes que já concluíram o vídeo"
                        disabled={applyMut.isPending}
                        onClick={() => applyMut.mutate(t.id)}
                        className="grid h-7 w-7 place-items-center rounded border border-input hover:bg-accent"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setEditing(t)}
                        className="grid h-7 w-7 place-items-center rounded border border-input hover:bg-accent"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        disabled={!!t.archived_at}
                        onClick={() => archive.mutate(t.id)}
                        className="grid h-7 w-7 place-items-center rounded border border-input hover:bg-accent disabled:opacity-40"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <TaskForm
          initial={editing}
          videos={videoList}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSubmit={(payload) => save.mutate(payload)}
          busy={save.isPending}
        />
      )}
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "ok" | "warn" | "info" | "muted" }) {
  const map: Record<string, string> = {
    ok: "bg-green-100 text-green-800",
    warn: "bg-amber-100 text-amber-800",
    info: "bg-blue-100 text-blue-800",
    muted: "bg-muted text-muted-foreground",
  };
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${map[tone]}`}>{children}</span>;
}

function TaskForm({
  initial,
  videos,
  onCancel,
  onSubmit,
  busy,
}: {
  initial: any | null;
  videos: any[];
  onCancel: () => void;
  onSubmit: (payload: any) => void;
  busy: boolean;
}) {
  const [form, setForm] = useState({
    id: initial?.id ?? undefined,
    videoId: initial?.video_id ?? "",
    journeyId: initial?.journey_id ?? "",
    title: initial?.title ?? "",
    instruction: initial?.instruction ?? "",
    ordering: initial?.ordering ?? 1,
    miles: initial?.miles ?? 10,
    responseRequired: initial?.response_required ?? true,
    active: initial?.active ?? true,
  });
  const valid = form.videoId && form.title.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-lg space-y-3 rounded-lg border border-input bg-card p-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold">{initial ? "Editar tarefa" : "Nova tarefa"}</h3>
        <Field label="Vídeo vinculado">
          <select
            disabled={!!initial}
            value={form.videoId}
            onChange={(e) => setForm({ ...form, videoId: e.target.value })}
            className="input"
          >
            <option value="">Selecione um vídeo</option>
            {videos.map((v) => (
              <option key={v.id} value={v.id}>{v.title}</option>
            ))}
          </select>
        </Field>
        <Field label="Título">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input" />
        </Field>
        <Field label="Instrução">
          <textarea value={form.instruction} onChange={(e) => setForm({ ...form, instruction: e.target.value })} className="input min-h-[80px]" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Ordem">
            <input type="number" min={1} max={99} value={form.ordering} onChange={(e) => setForm({ ...form, ordering: Number(e.target.value) })} className="input" />
          </Field>
          <Field label="Milhas">
            <input type="number" min={0} max={50} value={form.miles} onChange={(e) => setForm({ ...form, miles: Number(e.target.value) })} className="input" />
          </Field>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          <label className="inline-flex items-center gap-1">
            <input type="checkbox" checked={form.responseRequired} onChange={(e) => setForm({ ...form, responseRequired: e.target.checked })} />
            Resposta obrigatória
          </label>
          <label className="inline-flex items-center gap-1">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Ativa
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded border border-input px-3 py-1.5 text-xs">Cancelar</button>
          <button
            disabled={!valid || busy}
            onClick={() =>
              onSubmit({
                id: form.id,
                videoId: form.videoId,
                journeyId: form.journeyId || null,
                title: form.title.trim(),
                instruction: form.instruction.trim(),
                ordering: Number(form.ordering),
                miles: Number(form.miles),
                responseRequired: form.responseRequired,
                active: form.active,
              })
            }
            className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
          >
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </div>
        <style>{`.input{display:block;width:100%;border:1px solid hsl(var(--input));background:hsl(var(--background));border-radius:6px;padding:6px 8px;font-size:14px}`}</style>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
