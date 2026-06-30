import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Pencil, X, Dumbbell, Search, Clipboard, FileText } from "lucide-react";
import {
  listExercises,
  saveExercise,
  deleteExercise,
} from "@/lib/thermofit-content.functions";
import { listClientsWithPlans } from "@/lib/thermofit-workout-plans.functions";

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

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  sem_plano: { label: "Sem plano", tone: "bg-muted text-muted-foreground" },
  rascunho: { label: "Rascunho", tone: "bg-amber-100 text-amber-700" },
  publicado: { label: "Publicado", tone: "bg-emerald-100 text-emerald-700" },
  arquivado: { label: "Arquivado", tone: "bg-slate-200 text-slate-600" },
  em_preparacao: { label: "Em preparação", tone: "bg-sky-100 text-sky-700" },
};

function Page() {
  const [tab, setTab] = useState<"planos" | "biblioteca">("planos");

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Treinos</h1>
            <p className="text-sm text-muted-foreground">
              Planos personalizados das clientes e biblioteca de exercícios reutilizáveis.
            </p>
          </div>
        </header>

        <div className="inline-flex rounded-md border border-border bg-card p-1 text-sm">
          {([
            { id: "planos", label: "Planos das clientes" },
            { id: "biblioteca", label: "Biblioteca de exercícios" },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                "rounded px-3 py-1.5 font-medium transition-colors",
                tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "planos" ? <PlansCentral /> : <LibraryPanel />}
      </div>
    </AppShell>
  );
}

function PlansCentral() {
  const fetchRows = useServerFn(listClientsWithPlans);
  const { data, isLoading } = useQuery({
    queryKey: ["workout-plans-central"],
    queryFn: () => fetchRows(),
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    const rows = data?.rows ?? [];
    return rows
      .filter((r) => (search ? r.clientName.toLowerCase().includes(search.toLowerCase()) : true))
      .filter((r) => (statusFilter === "all" ? true : r.planStatus === statusFilter))
      .sort((a, b) => {
        const at = a.plan?.updatedAt ?? "";
        const bt = b.plan?.updatedAt ?? "";
        return bt.localeCompare(at);
      });
  }, [data, search, statusFilter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente"
            className="h-9 pl-7 w-64"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="all">Todos os status</option>
          <option value="sem_plano">Sem plano</option>
          <option value="rascunho">Rascunho</option>
          <option value="publicado">Publicado</option>
          <option value="arquivado">Arquivado</option>
        </select>
        <p className="ml-auto text-xs text-muted-foreground">
          {filtered.length} cliente{filtered.length === 1 ? "" : "s"}
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!isLoading && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhuma cliente corresponde aos filtros.
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Cliente</th>
              <th className="px-3 py-2 text-left">Plano atual</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Atualizado</th>
              <th className="px-3 py-2 text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const status = STATUS_LABELS[r.planStatus] ?? STATUS_LABELS.sem_plano;
              const updated = r.plan?.updatedAt ? new Date(r.plan.updatedAt).toLocaleDateString("pt-BR") : "—";
              return (
                <tr key={r.clientId} className="border-t border-border">
                  <td className="px-3 py-2 font-medium text-foreground">{r.clientName}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.plan?.title ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${status.tone}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{updated}</td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      to="/treinos/cliente/$clientId"
                      params={{ clientId: r.clientId }}
                      className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent"
                    >
                      <Clipboard className="h-3 w-3" />
                      {r.plan ? "Gerenciar" : "Criar plano"}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LibraryPanel() {
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

  async function onArchiveOrDelete(it: E) {
    // Soft-archive: nunca remover fisicamente para preservar planos publicados.
    if (!confirm(`Arquivar "${it.title}"? Isso preserva planos antigos.`)) return;
    try {
      await save({ data: { id: it.id, patch: { ...it, status: "arquivado" } as any } });
      await qc.invalidateQueries({ queryKey: ["exercises"] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao arquivar.");
    }
  }

  const items: E[] = data?.exercises ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {items.length} exercício{items.length === 1 ? "" : "s"} no catálogo
        </p>
        <button onClick={openNew} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Novo exercício
        </button>
      </div>

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
                {it.status !== "ativo" && (
                  <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                    {it.status}
                  </span>
                )}
              </div>
            </div>
            {it.equipment && <p className="mt-2 text-xs text-muted-foreground">Equipamento: {it.equipment}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => openEdit(it)} className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent">
                <Pencil className="h-3 w-3" /> Editar
              </button>
              <button onClick={() => onArchiveOrDelete(it)} className="inline-flex items-center gap-1 rounded-md border border-amber-200 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50">
                <Trash2 className="h-3 w-3" /> Arquivar
              </button>
            </div>
          </div>
        ))}
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
              <Field label="Séries (padrão)">
                <Input type="number" min={1} value={form.sets} onChange={(e) => setForm({ ...form, sets: Number(e.target.value) || 1 })} />
              </Field>
              <Field label="Repetições (padrão)">
                <Input value={form.reps} onChange={(e) => setForm({ ...form, reps: e.target.value })} />
              </Field>
            </div>
            <Field label="URL do vídeo base">
              <Input value={form.videoUrl} onChange={(e) => setForm({ ...form, videoUrl: e.target.value })} placeholder="https://..." />
            </Field>
            <Field label="Descrição base">
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
    </div>
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
