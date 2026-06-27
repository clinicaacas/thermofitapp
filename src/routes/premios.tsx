import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Pencil, X, Gift, Check } from "lucide-react";
import {
  listRewards,
  saveReward,
  deleteReward,
  listRedemptions,
  decideRedemption,
} from "@/lib/thermofit-content.functions";

export const Route = createFileRoute("/premios")({
  head: () => ({ meta: [{ title: "Prêmios — ThermoFit" }] }),
  component: Page,
});

type R = {
  id: string;
  name: string;
  description: string;
  costMiles: number;
  stock: number;
  status: string;
  imageUrl: string;
};
const empty: Omit<R, "id"> = { name: "", description: "", costMiles: 0, stock: 0, status: "ativo", imageUrl: "" };

function Page() {
  const qc = useQueryClient();
  const fetchAll = useServerFn(listRewards);
  const save = useServerFn(saveReward);
  const remove = useServerFn(deleteReward);
  const fetchRedemptions = useServerFn(listRedemptions);
  const decide = useServerFn(decideRedemption);

  const { data: rwData, isLoading } = useQuery({ queryKey: ["rewards"], queryFn: () => fetchAll() });
  const { data: rdData } = useQuery({ queryKey: ["redemptions"], queryFn: () => fetchRedemptions() });

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<R, "id">>(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openNew() { setEditingId(null); setForm(empty); setError(null); setOpen(true); }
  function openEdit(r: R) { setEditingId(r.id); setForm({ ...r }); setError(null); setOpen(true); }
  function close() { setOpen(false); }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await save({ data: { id: editingId ?? undefined, patch: form as any } });
      await qc.invalidateQueries({ queryKey: ["rewards"] });
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally { setSaving(false); }
  }

  async function onDelete(id: string) {
    if (!confirm("Excluir este prêmio?")) return;
    await remove({ data: { id } });
    await qc.invalidateQueries({ queryKey: ["rewards"] });
  }

  async function onDecide(id: string, status: "entregue" | "cancelado") {
    await decide({ data: { id, status, notes: "" } });
    await qc.invalidateQueries({ queryKey: ["redemptions"] });
  }

  const rewards: R[] = rwData?.rewards ?? [];
  const redemptions = rdData?.redemptions ?? [];

  return (
    <AppShell>
      <div className="space-y-8">
        <section className="space-y-4">
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Prêmios</h1>
              <p className="text-sm text-muted-foreground">
                {rewards.length} prêmio{rewards.length === 1 ? "" : "s"} no catálogo
              </p>
            </div>
            <button onClick={openNew} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4" /> Novo prêmio
            </button>
          </header>

          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && rewards.length === 0 && (
            <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
              Nenhum prêmio cadastrado ainda.
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rewards.map((r) => (
              <div key={r.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-amber-100 text-amber-700">
                    <Gift className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.costMiles} milhas • estoque: {r.stock}</div>
                  </div>
                </div>
                {r.description && <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{r.description}</p>}
                <div className="mt-3 flex justify-end gap-2">
                  <button onClick={() => openEdit(r)} className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent">
                    <Pencil className="h-3 w-3" /> Editar
                  </button>
                  <button onClick={() => onDelete(r.id)} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                    <Trash2 className="h-3 w-3" /> Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Resgates recentes</h2>
          {redemptions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Nenhum resgate registrado.
            </div>
          ) : (
            <div className="space-y-2">
              {redemptions.map((r: any) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{r.rewardName}</div>
                    <div className="text-xs text-muted-foreground">{r.clientName} • {r.costMiles} milhas • {r.status}</div>
                  </div>
                  {(r.status === "pendente" || r.status === "solicitado" || r.status === "aprovado" || r.status === "liberado") && (
                    <div className="flex gap-2">
                      <button onClick={() => onDecide(r.id, "entregue")} className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white">
                        <Check className="h-3 w-3" /> Entregar
                      </button>
                      <button onClick={() => onDecide(r.id, "cancelado")} className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs">
                        <X className="h-3 w-3" /> Cancelar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {open && (
        <Dialog onClose={close} title={editingId ? "Editar prêmio" : "Novo prêmio"}>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Nome *">
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Custo (milhas)">
                <Input type="number" min={0} value={form.costMiles} onChange={(e) => setForm({ ...form, costMiles: Number(e.target.value) || 0 })} />
              </Field>
              <Field label="Estoque">
                <Input type="number" min={0} value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) || 0 })} />
              </Field>
            </div>
            <Field label="Descrição">
              <textarea className="min-h-[80px] w-full rounded-md border border-input bg-background p-2 text-sm" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Status">
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="ativo">Ativo</option>
                <option value="esgotado">Esgotado</option>
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
