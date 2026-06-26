import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  listMissionsCentral,
  createManualMission,
  adjustMilesManual,
} from "@/lib/thermofit-missions-admin.functions";
import { ArrowLeft, Plus, Coins } from "lucide-react";

export const Route = createFileRoute("/clientes/$id/missoes")({
  head: () => ({ meta: [{ title: "Missões da cliente — ThermoFit" }] }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const fetcher = useServerFn(listMissionsCentral);
  const createFn = useServerFn(createManualMission);
  const adjustFn = useServerFn(adjustMilesManual);
  const qc = useQueryClient();

  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const { data, isLoading } = useQuery({
    queryKey: ["client-missions", id, from, today],
    queryFn: () => fetcher({ data: { clientId: id, from, to: today } }),
  });

  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState({ title: "", description: "", miles: 5, dueDate: today });
  const [showAdjust, setShowAdjust] = useState(false);
  const [adj, setAdj] = useState({ miles: 0, justification: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submitManual() {
    setBusy(true); setErr(null);
    try {
      await createFn({ data: { clientId: id, ...manual } });
      setShowManual(false);
      setManual({ title: "", description: "", miles: 5, dueDate: today });
      await qc.invalidateQueries({ queryKey: ["client-missions", id] });
    } catch (e: any) { setErr(e.message ?? "Erro"); } finally { setBusy(false); }
  }
  async function submitAdjust() {
    setBusy(true); setErr(null);
    try {
      await adjustFn({ data: { clientId: id, miles: adj.miles, justification: adj.justification } });
      setShowAdjust(false);
      setAdj({ miles: 0, justification: "" });
    } catch (e: any) { setErr(e.message ?? "Erro"); } finally { setBusy(false); }
  }

  const rows = data?.rows ?? [];
  const todayRows = rows.filter((r) => r.date === today);
  const byType = (t: string) => rows.filter((r) => r.type === t);

  return (
    <AppShell>
      <div className="space-y-5">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/clientes/$id" params={{ id }} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input hover:bg-accent">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold">Missões da cliente</h1>
              <p className="text-xs text-muted-foreground">Últimos 30 dias · {rows.length} registros</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowAdjust(true)} className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent">
              <Coins className="h-4 w-4" /> Ajustar milhas
            </button>
            <button onClick={() => setShowManual(true)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
              <Plus className="h-4 w-4" /> Missão manual
            </button>
          </div>
        </header>

        {err && <div className="rounded-md border border-destructive bg-destructive/10 p-2 text-xs text-destructive">{err}</div>}

        <Section title={`Missões de hoje (${todayRows.length})`}>
          <RowList rows={todayRows} loading={isLoading} />
        </Section>

        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Vídeos e tarefas pós-vídeo">
            <RowList rows={[...byType("video_complete"), ...byType("post_video_task")]} loading={isLoading} compact />
          </Section>
          <Section title="Rotina diária">
            <RowList rows={[...byType("daily_checkin"), ...byType("daily_meal"), ...byType("daily_workout"), ...byType("workout_photo"), ...byType("hydration_goal")]} loading={isLoading} compact />
          </Section>
          <Section title="Foto de evolução">
            <RowList rows={byType("weekly_photo")} loading={isLoading} compact />
          </Section>
          <Section title="Missões manuais">
            <RowList rows={byType("manual")} loading={isLoading} compact />
          </Section>
        </div>

        {showManual && (
          <Modal title="Nova missão manual" onClose={() => setShowManual(false)}>
            <Field label="Título"><input value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} className="input" /></Field>
            <Field label="Descrição"><textarea value={manual.description} onChange={(e) => setManual({ ...manual, description: e.target.value })} className="input min-h-[60px]" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Milhas"><input type="number" min={0} value={manual.miles} onChange={(e) => setManual({ ...manual, miles: Number(e.target.value) })} className="input" /></Field>
              <Field label="Data"><input type="date" value={manual.dueDate} onChange={(e) => setManual({ ...manual, dueDate: e.target.value })} className="input" /></Field>
            </div>
            <button disabled={busy || !manual.title} onClick={submitManual} className="mt-2 w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-40">
              {busy ? "Salvando…" : "Criar missão"}
            </button>
          </Modal>
        )}

        {showAdjust && (
          <Modal title="Ajustar milhas (com auditoria)" onClose={() => setShowAdjust(false)}>
            <Field label="Milhas (positivas ou negativas)"><input type="number" value={adj.miles} onChange={(e) => setAdj({ ...adj, miles: Number(e.target.value) })} className="input" /></Field>
            <Field label="Justificativa (obrigatória)"><textarea value={adj.justification} onChange={(e) => setAdj({ ...adj, justification: e.target.value })} className="input min-h-[80px]" /></Field>
            <button disabled={busy || adj.miles === 0 || adj.justification.length < 5} onClick={submitAdjust} className="mt-2 w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-40">
              {busy ? "Aplicando…" : "Aplicar ajuste"}
            </button>
          </Modal>
        )}
      </div>
      <style>{`.input{display:block;width:100%;border:1px solid hsl(var(--input));background:hsl(var(--background));border-radius:6px;padding:6px 8px;font-size:14px}`}</style>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-input bg-card">
      <h2 className="border-b border-border px-3 py-2 text-sm font-semibold">{title}</h2>
      <div className="p-2">{children}</div>
    </section>
  );
}

function RowList({ rows, loading, compact }: { rows: any[]; loading?: boolean; compact?: boolean }) {
  if (loading) return <p className="p-3 text-xs text-muted-foreground">Carregando…</p>;
  if (rows.length === 0) return <p className="p-3 text-xs text-muted-foreground">Nada por aqui.</p>;
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => (
        <li key={r.refId} className="flex items-center justify-between gap-2 px-2 py-2 text-sm">
          <div className="min-w-0">
            <div className="truncate font-medium">{r.title}</div>
            {!compact && <div className="text-xs text-muted-foreground">{r.typeLabel} · {r.date} · dia {r.journeyDay ?? "—"}</div>}
            {compact && <div className="text-xs text-muted-foreground">{r.date}</div>}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className={`rounded px-2 py-0.5 ${r.status === "completed" ? "bg-green-100 text-green-800" : r.status === "late" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}`}>{r.status}</span>
            <span className="tabular-nums text-muted-foreground">{r.miles}m</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs"><span className="mb-1 block text-muted-foreground">{label}</span>{children}</label>;
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md space-y-3 rounded-lg border border-input bg-card p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Fechar</button>
        </div>
        {children}
      </div>
    </div>
  );
}
