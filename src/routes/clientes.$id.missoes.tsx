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
import { ArrowLeft, Plus, Coins, Droplet, Camera, Video, ClipboardCheck, Dumbbell } from "lucide-react";

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
  const hydrationRows = byType("hydration_goal");
  const weeklyPhotoRows = byType("weekly_photo");
  const workoutPhotoRows = byType("workout_photo");
  const videoRows = byType("video_complete");
  const routineRows = [
    ...byType("daily_checkin"),
    ...byType("daily_meal"),
    ...byType("daily_workout"),
  ];

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
          <DetailSection title="Hidratação" icon={Droplet} loading={isLoading} empty={hydrationRows.length === 0}>
            {hydrationRows.map((r: any) => <HydrationDetail key={r.refId} row={r} />)}
          </DetailSection>
          <DetailSection title="Vídeos" icon={Video} loading={isLoading} empty={videoRows.length === 0}>
            {videoRows.map((r: any) => <VideoDetail key={r.refId} row={r} />)}
          </DetailSection>
          <DetailSection title="Rotina" icon={ClipboardCheck} loading={isLoading} empty={routineRows.length === 0}>
            <RoutineDetail rows={routineRows} />
          </DetailSection>
          <DetailSection title="Foto do treino" icon={Dumbbell} loading={isLoading} empty={workoutPhotoRows.length === 0}>
            {workoutPhotoRows.map((r: any) => <PhotoDetail key={r.refId} row={r} kind="workout" />)}
          </DetailSection>
          <DetailSection title="Foto de evolução" icon={Camera} loading={isLoading} empty={weeklyPhotoRows.length === 0}>
            {weeklyPhotoRows.map((r: any) => <PhotoDetail key={r.refId} row={r} kind="weekly" />)}
          </DetailSection>
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

function DetailSection({ title, icon: Icon, loading, empty, children }: { title: string; icon: any; loading?: boolean; empty?: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-input bg-card">
      <h2 className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </h2>
      <div className="space-y-2 p-2">
        {loading ? <p className="p-3 text-xs text-muted-foreground">Carregando…</p> : empty ? <p className="p-3 text-xs text-muted-foreground">Nada por aqui.</p> : children}
      </div>
    </section>
  );
}

function statusLabel(status: string) {
  if (status === "completed") return "Concluída";
  if (status === "late") return "Atrasada";
  if (status === "blocked") return "Bloqueada";
  return "Pendente";
}

function DetailShell({ row, children }: { row: any; children: React.ReactNode }) {
  return (
    <article className={`rounded-md border p-2 text-xs ${row.status === "completed" ? "border-emerald-200 bg-emerald-50/70" : "border-border bg-background"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-foreground">{row.title}</div>
          <div className="text-muted-foreground">{row.date} · Dia {row.journeyDay ?? "—"} · Semana {row.week ?? "—"}</div>
        </div>
        <span className={`shrink-0 rounded px-2 py-0.5 ${row.status === "completed" ? "bg-emerald-100 text-emerald-800" : "bg-yellow-100 text-yellow-800"}`}>{statusLabel(row.status)}</span>
      </div>
      <div className="mt-2 grid gap-1 sm:grid-cols-2">{children}</div>
    </article>
  );
}

function SmallInfo({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><span className="text-muted-foreground">{label}: </span><span className="font-medium text-foreground">{value || "—"}</span></div>;
}

function HydrationDetail({ row }: { row: any }) {
  const d = row.details ?? {};
  return (
    <DetailShell row={row}>
      <SmallInfo label="Litros registrados" value={`${((Number(d.totalMl ?? 0)) / 1000).toFixed(1).replace(".", ",")} L`} />
      <SmallInfo label="Meta" value={`${Number(d.goalMl ?? 2000)} ml`} />
      <SmallInfo label="Horário de conclusão" value={fmt(d.completedAt)} />
      <SmallInfo label="Milhas" value={`+${row.miles}`} />
      <SmallInfo label="Origem no ledger" value={d.ledger?.source_kind ?? "hydration_goal"} />
      <SmallInfo label="Status" value={statusLabel(row.status)} />
    </DetailShell>
  );
}

function PhotoDetail({ row, kind }: { row: any; kind: "weekly" | "workout" }) {
  const d = row.details ?? {};
  return (
    <DetailShell row={row}>
      <div className="sm:row-span-4">
        {d.photoUrl ? <img src={d.photoUrl} alt="Miniatura privada" className="h-24 w-24 rounded-md object-cover" /> : <div className="grid h-24 w-24 place-items-center rounded-md bg-muted text-muted-foreground">Sem foto</div>}
      </div>
      {kind === "weekly" ? <SmallInfo label="Semana" value={d.week ?? row.week} /> : <SmallInfo label="Treino informado" value={choiceLabel(d.workoutChoice)} />}
      <SmallInfo label="Observação" value={d.note ?? "—"} />
      <SmallInfo label="Data" value={fmt(d.takenAt ?? d.completedAt ?? row.updatedAt)} />
      <SmallInfo label="Milhas" value={`+${row.miles}`} />
      <SmallInfo label="Status" value={statusLabel(row.status)} />
    </DetailShell>
  );
}

function VideoDetail({ row }: { row: any }) {
  const d = row.details ?? {};
  return (
    <DetailShell row={row}>
      <SmallInfo label="Título" value={d.title ?? row.title} />
      <SmallInfo label="Percentual assistido" value={`${Number(d.progressPercent ?? 0)}%`} />
      <SmallInfo label="Horário da conclusão" value={fmt(d.completedAt ?? row.updatedAt)} />
      <SmallInfo label="Milhas" value={`+${row.miles}`} />
      <SmallInfo label="Status" value={statusLabel(row.status)} />
    </DetailShell>
  );
}

function RoutineDetail({ rows }: { rows: any[] }) {
  const checkin = rows.find((r) => r.type === "daily_checkin");
  const meal = rows.find((r) => r.type === "daily_meal");
  const workout = rows.find((r) => r.type === "daily_workout");
  const shellRow = rows[0] ?? { title: "Rotina", status: "pending", date: "—" };
  const miles = rows.reduce((s, r) => s + Number(r.miles ?? 0), 0);
  const done = rows.length > 0 && rows.every((r) => r.status === "completed");
  return (
    <DetailShell row={{ ...shellRow, title: "Rotina diária", status: done ? "completed" : shellRow.status, miles }}>
      <SmallInfo label="Resposta de check-in" value={checkin?.details?.checkinDone ? "Realizado" : "Pendente"} />
      <SmallInfo label="Alimentação selecionada" value={choiceLabel(meal?.details?.mealChoice)} />
      <SmallInfo label="Treino selecionado" value={choiceLabel(workout?.details?.workoutChoice)} />
      <SmallInfo label="Status" value={done ? "Concluída" : "Pendente"} />
      <SmallInfo label="Milhas" value={`+${miles}`} />
      <SmallInfo label="Data" value={shellRow.date} />
    </DetailShell>
  );
}

function choiceLabel(value?: string | null) {
  const map: Record<string, string> = {
    otima: "Ótima",
    ok: "Ok",
    dificil: "Difícil",
    musc_cardio: "Musculação + cardio",
    cardio: "Só cardio",
    descanso: "Descanso",
  };
  return value ? map[value] ?? value : "—";
}

function fmt(value?: string | null) {
  if (!value) return "—";
  try { return new Date(value).toLocaleString("pt-BR"); } catch { return value; }
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
