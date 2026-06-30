import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Plus, Trash2, FileText, Upload, Eye, ArrowUp, ArrowDown, Save, Send,
  Archive, Copy, X, Dumbbell, CheckCircle2, AlertCircle,
} from "lucide-react";
import { listExercises } from "@/lib/thermofit-content.functions";
import {
  getClientPlans, getPlan, createPlan, updatePlan, publishPlan, archivePlan, duplicatePlanAsDraft,
  addPlanExercise, updatePlanExercise, removePlanExercise, reorderPlanExercises,
  uploadPlanPdf, removePlanPdf, uploadPlanExercisePdf, removePlanExercisePdf,
} from "@/lib/thermofit-workout-plans.functions";
import { WorkoutPlanPdfViewer } from "@/components/workout-plan-pdf-viewer";

export const Route = createFileRoute("/treinos/cliente/$clientId")({
  head: () => ({ meta: [{ title: "Plano de treino — ThermoFit" }] }),
  component: Page,
});

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  rascunho: { label: "Rascunho", tone: "bg-amber-100 text-amber-700" },
  publicado: { label: "Publicado", tone: "bg-emerald-100 text-emerald-700" },
  arquivado: { label: "Arquivado", tone: "bg-slate-200 text-slate-600" },
};

function Page() {
  const { clientId } = Route.useParams();
  const qc = useQueryClient();
  const fetchPlans = useServerFn(getClientPlans);
  const { data, isLoading } = useQuery({
    queryKey: ["client-workout-plans", clientId],
    queryFn: () => fetchPlans({ data: { clientId } }),
  });

  const plans = data?.plans ?? [];
  const client = data?.client;
  const published = plans.find((p) => p.status === "publicado") ?? null;
  const drafts = plans.filter((p) => p.status === "rascunho");
  const archived = plans.filter((p) => p.status === "arquivado");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const effectiveId = selectedId ?? drafts[0]?.id ?? published?.id ?? null;

  const createMut = useMutation({
    mutationFn: useServerFn(createPlan),
    onSuccess: async (res: any) => {
      await qc.invalidateQueries({ queryKey: ["client-workout-plans", clientId] });
      setSelectedId(res.plan.id);
    },
  });

  return (
    <AppShell>
      <div className="space-y-4">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Link to="/exercicios" className="inline-flex h-8 items-center gap-1 rounded-md border border-input px-2 text-xs hover:bg-accent">
              <ArrowLeft className="h-3.5 w-3.5" /> Central
            </Link>
            <Link to="/clientes/$id" params={{ id: clientId }} className="inline-flex h-8 items-center gap-1 rounded-md border border-input px-2 text-xs hover:bg-accent">
              Perfil da cliente
            </Link>
          </div>
          <div>
            <h1 className="text-xl font-semibold">{client?.name ?? "Cliente"}</h1>
            <p className="text-xs text-muted-foreground">Planos de treino personalizados</p>
          </div>
          <button
            onClick={() => {
              const title = window.prompt("Título do novo plano:");
              if (!title || !title.trim()) return;
              createMut.mutate({ data: { clientId, title: title.trim(), description: "" } });
            }}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Novo plano
          </button>
        </header>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

        {!isLoading && plans.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Esta cliente ainda não possui plano. Clique em "Novo plano" para começar.
          </div>
        )}

        {plans.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
            <aside className="space-y-3">
              <Section title="Publicado">
                {published ? (
                  <PlanPill plan={published} active={effectiveId === published.id} onClick={() => setSelectedId(published.id)} />
                ) : <Empty>Sem plano publicado</Empty>}
              </Section>
              <Section title={`Rascunhos (${drafts.length})`}>
                {drafts.length === 0 ? <Empty>Nenhum rascunho</Empty> : drafts.map((p) => (
                  <PlanPill key={p.id} plan={p} active={effectiveId === p.id} onClick={() => setSelectedId(p.id)} />
                ))}
              </Section>
              {archived.length > 0 && (
                <Section title={`Arquivados (${archived.length})`}>
                  {archived.map((p) => (
                    <PlanPill key={p.id} plan={p} active={effectiveId === p.id} onClick={() => setSelectedId(p.id)} />
                  ))}
                </Section>
              )}
            </aside>

            <div>
              {effectiveId ? <PlanEditor planId={effectiveId} clientId={clientId} /> : (
                <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
                  Selecione um plano à esquerda.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium uppercase text-muted-foreground">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">{children}</p>;
}

function PlanPill({ plan, active, onClick }: { plan: any; active: boolean; onClick: () => void }) {
  const s = STATUS_LABELS[plan.status] ?? { label: plan.status, tone: "bg-muted text-muted-foreground" };
  return (
    <button
      onClick={onClick}
      className={[
        "w-full rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
        active ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-accent",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium text-foreground">{plan.title}</span>
        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${s.tone}`}>{s.label}</span>
      </div>
      <div className="text-[10px] text-muted-foreground">{new Date(plan.updatedAt).toLocaleDateString("pt-BR")}</div>
    </button>
  );
}

function PlanEditor({ planId, clientId }: { planId: string; clientId: string }) {
  const qc = useQueryClient();
  const fetchPlan = useServerFn(getPlan);
  const { data, isLoading } = useQuery({
    queryKey: ["workout-plan", planId],
    queryFn: () => fetchPlan({ data: { planId } }),
  });

  const plan = data?.plan;
  const items = data?.items ?? [];

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (plan) {
      setTitle(plan.title ?? "");
      setDescription(plan.description ?? "");
      setDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, plan?.updatedAt]);

  const invalidatePlan = () => {
    qc.invalidateQueries({ queryKey: ["workout-plan", planId] });
    qc.invalidateQueries({ queryKey: ["client-workout-plans", clientId] });
    qc.invalidateQueries({ queryKey: ["workout-plans-central"] });
  };

  const saveMut = useMutation({
    mutationFn: useServerFn(updatePlan),
    onSuccess: () => { setDirty(false); invalidatePlan(); },
  });
  const publishMut = useMutation({ mutationFn: useServerFn(publishPlan), onSuccess: invalidatePlan });
  const archiveMut = useMutation({ mutationFn: useServerFn(archivePlan), onSuccess: invalidatePlan });
  const duplicateMut = useMutation({ mutationFn: useServerFn(duplicatePlanAsDraft), onSuccess: invalidatePlan });
  const removePdfMut = useMutation({ mutationFn: useServerFn(removePlanPdf), onSuccess: invalidatePlan });

  const uploadPdf = useServerFn(uploadPlanPdf);
  const [viewer, setViewer] = useState<{ path: string; title: string } | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  async function onUploadPdf(file: File) {
    setPdfBusy(true); setPdfError(null);
    try {
      if (file.type !== "application/pdf") throw new Error("Envie um PDF.");
      if (file.size > 15 * 1024 * 1024) throw new Error("PDF acima de 15MB.");
      const base64 = await fileToBase64(file);
      await uploadPdf({ data: { planId, fileName: file.name, mimeType: file.type, base64 } });
      invalidatePlan();
    } catch (e: any) {
      setPdfError(e.message || "Falha ao enviar PDF.");
    } finally { setPdfBusy(false); }
  }

  function onViewPdf(path: string) {
    setViewer({ path, title: plan?.title || "Material" });
  }

  if (isLoading || !plan) return <p className="text-sm text-muted-foreground">Carregando plano…</p>;

  const status = STATUS_LABELS[plan.status] ?? { label: plan.status, tone: "bg-muted text-muted-foreground" };
  const canEdit = plan.status !== "arquivado";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${status.tone}`}>{status.label}</span>
            <p className="text-xs text-muted-foreground">
              Atualizado em {new Date(plan.updatedAt).toLocaleString("pt-BR")}
              {plan.publishedAt && ` • Publicado em ${new Date(plan.publishedAt).toLocaleString("pt-BR")}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={!dirty || saveMut.isPending || !canEdit}
              onClick={() => saveMut.mutate({ data: { planId, title: title.trim(), description } })}
              className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
            >
              <Save className="h-3 w-3" /> Salvar
            </button>
            {plan.status !== "publicado" && (
              <button
                disabled={publishMut.isPending}
                onClick={() => publishMut.mutate({ data: { planId } })}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Send className="h-3 w-3" /> Publicar
              </button>
            )}
            {plan.status !== "arquivado" && (
              <button
                disabled={archiveMut.isPending}
                onClick={() => { if (confirm("Arquivar este plano?")) archiveMut.mutate({ data: { planId } }); }}
                className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
              >
                <Archive className="h-3 w-3" /> Arquivar
              </button>
            )}
            <button
              disabled={duplicateMut.isPending}
              onClick={() => duplicateMut.mutate({ data: { planId } })}
              className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
            >
              <Copy className="h-3 w-3" /> Duplicar como rascunho
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Título</Label>
            <Input
              value={title}
              onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Orientação geral</Label>
            <textarea
              value={description}
              onChange={(e) => { setDescription(e.target.value); setDirty(true); }}
              disabled={!canEdit}
              className="min-h-[80px] w-full rounded-md border border-input bg-background p-2 text-sm disabled:opacity-60"
            />
          </div>
        </div>

        <div className="mt-3 rounded-md border border-dashed border-border p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground">
            <FileText className="h-3.5 w-3.5" /> PDF geral do plano
          </div>
          {plan.pdfPath ? (
            <div className="mt-2 flex items-center gap-2">
              <span className="truncate text-xs text-muted-foreground">{plan.pdfPath.split("/").pop()}</span>
              <button onClick={() => onViewPdf(plan.pdfPath!)} className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent">
                <Eye className="h-3 w-3" /> Visualizar
              </button>
              {canEdit && (
                <button onClick={() => { if (confirm("Remover PDF do plano?")) removePdfMut.mutate({ data: { planId } }); }} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                  <Trash2 className="h-3 w-3" /> Remover
                </button>
              )}
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Nenhum PDF anexado.</p>
          )}
          {canEdit && (
            <div className="mt-2 flex items-center gap-2">
              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf"
                hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadPdf(f); e.currentTarget.value = ""; }}
              />
              <button
                disabled={pdfBusy}
                onClick={() => pdfInputRef.current?.click()}
                className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
              >
                <Upload className="h-3 w-3" /> {plan.pdfPath ? "Substituir" : "Anexar"} PDF
              </button>
              {pdfBusy && <span className="text-xs text-muted-foreground">Enviando…</span>}
              {pdfError && <span className="inline-flex items-center gap-1 text-xs text-red-600"><AlertCircle className="h-3 w-3" /> {pdfError}</span>}
            </div>
          )}
        </div>
      </div>

      <PlanExercisesSection planId={planId} items={items} tenantId={plan.tenantId} canEdit={canEdit} onChanged={invalidatePlan} onViewPdf={onViewPdf} />
    </div>
  );
}

function PlanExercisesSection({
  planId, items, tenantId, canEdit, onChanged, onViewPdf,
}: {
  planId: string; items: any[]; tenantId: string; canEdit: boolean;
  onChanged: () => void; onViewPdf: (path: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const addMut = useMutation({ mutationFn: useServerFn(addPlanExercise), onSuccess: onChanged });
  const updMut = useMutation({ mutationFn: useServerFn(updatePlanExercise), onSuccess: onChanged });
  const rmMut = useMutation({ mutationFn: useServerFn(removePlanExercise), onSuccess: onChanged });
  const reorderMut = useMutation({ mutationFn: useServerFn(reorderPlanExercises), onSuccess: onChanged });

  function move(idx: number, dir: -1 | 1) {
    const next = [...items];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    reorderMut.mutate({ data: { planId, order: next.map((i) => i.id) } });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Exercícios do plano ({items.length})</h2>
        {canEdit && (
          <button onClick={() => setPickerOpen(true)} className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent">
            <Plus className="h-3 w-3" /> Adicionar exercício
          </button>
        )}
      </div>

      {items.length === 0 && (
        <p className="mt-3 text-xs text-muted-foreground">Nenhum exercício neste plano.</p>
      )}

      <ul className="mt-3 space-y-2">
        {items.map((it, idx) => (
          <PlanExerciseRow
            key={it.id} item={it} index={idx} total={items.length} canEdit={canEdit}
            onMove={(dir) => move(idx, dir)}
            onUpdate={(patch) => updMut.mutate({ data: { itemId: it.id, ...patch } })}
            onRemove={() => { if (confirm("Remover apenas deste plano?")) rmMut.mutate({ data: { itemId: it.id } }); }}
            onViewPdf={onViewPdf}
            onChanged={onChanged}
          />
        ))}
      </ul>

      {pickerOpen && (
        <ExercisePicker
          tenantId={tenantId}
          excludeIds={items.map((i) => i.exerciseId)}
          onClose={() => setPickerOpen(false)}
          onPick={(exId) => { addMut.mutate({ data: { planId, exerciseId: exId } }); setPickerOpen(false); }}
        />
      )}
    </div>
  );
}

function PlanExerciseRow({
  item, index, total, canEdit, onMove, onUpdate, onRemove, onViewPdf, onChanged,
}: {
  item: any; index: number; total: number; canEdit: boolean;
  onMove: (dir: -1 | 1) => void;
  onUpdate: (patch: { sets?: number | null; reps?: string | null; notes?: string | null }) => void;
  onRemove: () => void;
  onViewPdf: (path: string) => void;
  onChanged: () => void;
}) {
  const ex = item.exercise;
  const [editing, setEditing] = useState(false);
  const [sets, setSets] = useState<string>(item.sets != null ? String(item.sets) : "");
  const [reps, setReps] = useState<string>(item.reps ?? "");
  const [notes, setNotes] = useState<string>(item.notes ?? "");
  const customized = item.sets != null || (item.reps && item.reps.length > 0) || (item.notes && item.notes.length > 0) || !!item.pdfPath;

  const uploadEx = useServerFn(uploadPlanExercisePdf);
  const removeExPdf = useMutation({ mutationFn: useServerFn(removePlanExercisePdf), onSuccess: onChanged });
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onUpload(file: File) {
    setBusy(true);
    try {
      if (file.type !== "application/pdf") throw new Error("Envie um PDF.");
      const base64 = await fileToBase64(file);
      await uploadEx({ data: { itemId: item.id, fileName: file.name, mimeType: file.type, base64 } });
      onChanged();
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  }

  return (
    <li className="rounded-md border border-border bg-background p-3">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <Dumbbell className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">#{index + 1}</span>
            <span className="truncate text-sm font-medium text-foreground">{ex?.title ?? "Exercício"}</span>
            {ex?.status === "arquivado" && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">arquivado</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            {ex?.muscleGroup} • Padrão: {ex?.defaultSets}×{ex?.defaultReps}
          </p>
          <p className="mt-1 text-[11px]">
            {customized ? (
              <span className="inline-flex items-center gap-1 text-amber-700"><CheckCircle2 className="h-3 w-3" /> Personalizado para esta cliente</span>
            ) : (
              <span className="text-muted-foreground">Usando configuração da Biblioteca</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          {canEdit && (
            <>
              <button onClick={() => onMove(-1)} disabled={index === 0} className="rounded-md border border-input p-1 hover:bg-accent disabled:opacity-30">
                <ArrowUp className="h-3 w-3" />
              </button>
              <button onClick={() => onMove(1)} disabled={index === total - 1} className="rounded-md border border-input p-1 hover:bg-accent disabled:opacity-30">
                <ArrowDown className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder={`Séries (padrão ${ex?.defaultSets})`} type="number" min={1} value={sets} onChange={(e) => setSets(e.target.value)} />
            <Input placeholder={`Repetições (padrão ${ex?.defaultReps})`} value={reps} onChange={(e) => setReps(e.target.value)} />
          </div>
          <textarea
            placeholder="Observações personalizadas"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-[60px] w-full rounded-md border border-input bg-background p-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="rounded-md border border-input px-2 py-1 text-xs hover:bg-accent">Cancelar</button>
            <button
              onClick={() => {
                onUpdate({
                  sets: sets === "" ? null : Number(sets) || null,
                  reps: reps.trim() === "" ? null : reps.trim(),
                  notes: notes.trim() === "" ? null : notes.trim(),
                });
                setEditing(false);
              }}
              className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              Salvar overrides
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
          <div>Séries: <strong>{item.sets ?? ex?.defaultSets}</strong> • Reps: <strong>{item.reps ?? ex?.defaultReps}</strong></div>
          {item.notes && <div className="text-foreground">📝 {item.notes}</div>}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {ex?.videoUrl && <a href={ex.videoUrl} target="_blank" rel="noopener" className="rounded-md border border-input px-2 py-1 hover:bg-accent">Ver vídeo base</a>}
        {ex?.pdfPath && !item.pdfPath && (
          <button onClick={() => onViewPdf(ex.pdfPath)} className="rounded-md border border-input px-2 py-1 hover:bg-accent">Ver PDF base</button>
        )}
        {item.pdfPath && (
          <>
            <button onClick={() => onViewPdf(item.pdfPath)} className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">
              <FileText className="h-3 w-3" /> PDF exclusivo
            </button>
            {canEdit && (
              <button onClick={() => removeExPdf.mutate({ data: { itemId: item.id } })} className="rounded-md border border-red-200 px-2 py-1 text-red-600 hover:bg-red-50">
                Remover PDF
              </button>
            )}
          </>
        )}
        {canEdit && (
          <>
            <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.currentTarget.value = ""; }} />
            <button disabled={busy} onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 hover:bg-accent disabled:opacity-50">
              <Upload className="h-3 w-3" /> {item.pdfPath ? "Substituir" : "Anexar"} PDF
            </button>
            <button onClick={() => setEditing(true)} className="rounded-md border border-input px-2 py-1 hover:bg-accent">Personalizar</button>
            <button onClick={onRemove} className="ml-auto rounded-md border border-red-200 px-2 py-1 text-red-600 hover:bg-red-50">
              <Trash2 className="inline h-3 w-3" /> Remover
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function ExercisePicker({
  excludeIds, onClose, onPick,
}: { tenantId: string; excludeIds: string[]; onClose: () => void; onPick: (exId: string) => void }) {
  const fetchAll = useServerFn(listExercises);
  const { data, isLoading } = useQuery({ queryKey: ["exercises"], queryFn: () => fetchAll() });
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const all = (data?.exercises ?? []).filter((e: any) => e.status !== "arquivado");
    const term = q.trim().toLowerCase();
    return all.filter((e: any) => (term ? e.title.toLowerCase().includes(term) || (e.muscleGroup ?? "").toLowerCase().includes(term) : true));
  }, [data, q]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-card p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Adicionar exercício da Biblioteca</h2>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título ou grupo muscular" />
        <div className="mt-3 max-h-[50vh] overflow-y-auto space-y-1.5">
          {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
          {filtered.map((e: any) => {
            const already = excludeIds.includes(e.id);
            return (
              <button
                key={e.id}
                disabled={already}
                onClick={() => onPick(e.id)}
                className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{e.title}</div>
                  <div className="text-xs text-muted-foreground">{e.muscleGroup} • {e.sets}×{e.reps}</div>
                </div>
                {already ? <span className="text-xs text-muted-foreground">já adicionado</span> : <Plus className="h-4 w-4 text-primary" />}
              </button>
            );
          })}
          {!isLoading && filtered.length === 0 && <p className="text-xs text-muted-foreground">Nenhum exercício encontrado.</p>}
        </div>
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const res = r.result as string;
      const idx = res.indexOf(",");
      resolve(idx >= 0 ? res.slice(idx + 1) : res);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
