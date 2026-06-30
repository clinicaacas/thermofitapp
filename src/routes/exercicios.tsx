import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Pencil, X, Dumbbell } from "lucide-react";
import {
  listExercises,
  saveExercise,
  deleteExercise,
} from "@/lib/thermofit-content.functions";

export const Route = createFileRoute("/exercicios")({
  head: () => ({ meta: [{ title: "Treinos — ThermoFit" }] }),
  component: Page,
});

type E = {
  id: string;
  title: string;
  description: string;
  videoUrl: string;
  muscleGroup: string;
  equipment: string;
  sets: number;
  reps: string;
  status: string;
};

const empty: Omit<E, "id"> = {
  title: "",
  description: "",
  videoUrl: "",
  muscleGroup: "geral",
  equipment: "",
  sets: 3,
  reps: "10",
  status: "ativo",
};

function Page() {
  const qc = useQueryClient();
  const fetchAll = useServerFn(listExercises);
  const save = useServerFn(saveExercise);
  const remove = useServerFn(deleteExercise);
  const { data, isLoading } = useQuery({ queryKey: ["exercises"], queryFn: () => fetchAll() });
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<E, "id">>(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openNew() { setEditingId(null); setForm(empty); setError(null); setOpen(true); }
  function openEdit(e: E) { setEditingId(e.id); setForm({ ...e }); setError(null); setOpen(true); }
  function close() { setOpen(false); }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await save({ data: { id: editingId ?? undefined, patch: form as any } });
      await qc.invalidateQueries({ queryKey: ["exercises"] });
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Excluir este exercício?")) return;
    await remove({ data: { id } });
    await qc.invalidateQueries({ queryKey: ["exercises"] });
  }

  const items: E[] = data?.exercises ?? [];

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Exercícios</h1>
            <p className="text-sm text-muted-foreground">
              {items.length} exercício{items.length === 1 ? "" : "s"} no catálogo
            </p>
          </div>
          <button onClick={openNew} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            <Plus className="h-4 w-4" /> Novo exercício
          </button>
        </header>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!isLoading && items.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Nenhum exercício cadastrado ainda.
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((it) => (
            <div key={it.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                  <Dumbbell className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">{it.title}</div>
                  <div className="text-xs text-muted-foreground">{it.muscleGroup} • {it.sets}×{it.reps}</div>
                </div>
              </div>
              {it.equipment && <p className="mt-2 text-xs text-muted-foreground">Equipamento: {it.equipment}</p>}
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={() => openEdit(it)} className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent">
                  <Pencil className="h-3 w-3" /> Editar
                </button>
                <button onClick={() => onDelete(it.id)} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                  <Trash2 className="h-3 w-3" /> Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {open && (
        <Dialog onClose={close} title={editingId ? "Editar exercício" : "Novo exercício"}>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Título *">
              <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Grupo muscular">
                <Input value={form.muscleGroup} onChange={(e) => setForm({ ...form, muscleGroup: e.target.value })} />
              </Field>
              <Field label="Equipamento">
                <Input value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Séries">
                <Input type="number" min={1} value={form.sets} onChange={(e) => setForm({ ...form, sets: Number(e.target.value) || 1 })} />
              </Field>
              <Field label="Repetições">
                <Input value={form.reps} onChange={(e) => setForm({ ...form, reps: e.target.value })} />
              </Field>
            </div>
            <Field label="URL do vídeo">
              <Input value={form.videoUrl} onChange={(e) => setForm({ ...form, videoUrl: e.target.value })} placeholder="https://..." />
            </Field>
            <Field label="Descrição">
              <textarea className="min-h-[80px] w-full rounded-md border border-input bg-background p-2 text-sm" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Status">
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="ativo">Ativo</option>
                <option value="rascunho">Rascunho</option>
                <option value="arquivado">Arquivado</option>
              </select>
            </Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={close} className="rounded-md border border-input px-3 py-2 text-sm hover:bg-accent">Cancelar</button>
              <button type="submit" disabled={saving} className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {saving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
    </div>
  );
}

function Dialog({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-card p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
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
