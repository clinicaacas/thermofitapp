import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  getClientRewardsAdminView,
  decideRedemption,
} from "@/lib/thermofit-content.functions";
import {
  ArrowLeft,
  Gift,
  Sparkles,
  Ticket,
  Camera,
  Award,
  Trophy,
  Flag,
  Check,
  X,
  Lock,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/clientes/$id/premios")({
  head: () => ({ meta: [{ title: "Prêmios e Conquistas — ThermoFit" }] }),
  component: Page,
});

const TYPE_ICON: Record<string, typeof Gift> = {
  mimo: Gift,
  sessao: Sparkles,
  voucher: Ticket,
  ensaio: Camera,
  outro: Award,
};

const SEAL_META: Record<string, string> = {
  streak_7: "Constância 7 dias",
  streak_14: "Constância 14 dias",
  streak_21: "Constância 21 dias",
  program_complete: "Programa Completo",
};

const MILESTONES = [
  { code: "milestone_checkin", label: "Check-in", threshold: 0 },
  { code: "milestone_300", label: "Decolagem", threshold: 300 },
  { code: "milestone_600", label: "Subida", threshold: 600 },
  { code: "milestone_900", label: "Altitude", threshold: 900 },
  { code: "milestone_1300", label: "Ponto B", threshold: 1300 },
];

function fmt(date: string | null | undefined) {
  if (!date) return "—";
  try {
    return new Date(date).toLocaleString("pt-BR");
  } catch {
    return date;
  }
}

function Page() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const fetcher = useServerFn(getClientRewardsAdminView);
  const decide = useServerFn(decideRedemption);

  const { data, isLoading } = useQuery({
    queryKey: ["client-rewards-admin", id],
    queryFn: () => fetcher({ data: { clientId: id } }),
  });

  const [decision, setDecision] = useState<{ id: string; status: "entregue" | "cancelado" } | null>(null);
  const [just, setJust] = useState("");

  async function confirmDecision() {
    if (!decision || !just.trim()) return;
    await decide({ data: { id: decision.id, status: decision.status, notes: "", justification: just } });
    setDecision(null);
    setJust("");
    await qc.invalidateQueries({ queryKey: ["client-rewards-admin", id] });
  }

  const sealCodes = new Set((data?.seals ?? []).map((s: any) => s.seal_code));
  const msCodes = new Set((data?.milestones ?? []).map((m: any) => m.milestone_code));

  const grouped = {
    bloqueado: [] as any[],
    liberado: [] as any[],
    solicitado: [] as any[],
    entregue: [] as any[],
  };
  for (const r of data?.rewards ?? []) grouped[r.state as keyof typeof grouped]?.push(r);

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/clientes/$id" params={{ id }} className="grid h-8 w-8 place-items-center rounded-md border border-input">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-2xl font-semibold">Prêmios e Conquistas</h1>
              <p className="text-sm text-muted-foreground">{data?.client?.name ?? "—"}</p>
            </div>
          </div>
        </header>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

        {data && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Saldo de Milhas" value={data.balance} />
              <Stat label="Milhas hoje" value={data.milesToday} />
              <Stat label="Jornada ativa" value={data.journeyId ? "Sim" : "Não"} />
            </div>

            {/* Prêmios por status */}
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Prêmios</h2>
              <div className="grid gap-3 lg:grid-cols-2">
                <RewardGroup title="Liberados" items={grouped.liberado} />
                <RewardGroup title="Solicitados" items={grouped.solicitado} onDecide={(id, status) => { setDecision({ id, status }); setJust(""); }} />
                <RewardGroup title="Entregues" items={grouped.entregue} />
                <RewardGroup title="Bloqueados" items={grouped.bloqueado} />
              </div>
            </section>

            {/* Selos */}
            <section className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2"><Trophy className="h-4 w-4" /> Selos</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(SEAL_META).map(([code, label]) => {
                  const earned = sealCodes.has(code);
                  const meta = (data.seals ?? []).find((s: any) => s.seal_code === code);
                  return (
                    <div key={code} className={`rounded-lg border p-3 ${earned ? "border-amber-300 bg-amber-50" : "border-dashed border-border bg-card"}`}>
                      <div className="flex items-center gap-2 text-xs font-medium">
                        {earned ? <CheckCircle2 className="h-4 w-4 text-amber-600" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
                        {label}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">{earned ? fmt(meta?.awarded_at) : "Não conquistado"}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Marcos */}
            <section className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2"><Flag className="h-4 w-4" /> Marcos</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {MILESTONES.map((m) => {
                  const meta = (data.milestones ?? []).find((x: any) => x.milestone_code === m.code);
                  const reached = msCodes.has(m.code);
                  return (
                    <div key={m.code} className={`rounded-lg border p-3 ${reached ? "border-amber-300 bg-amber-50" : "border-dashed border-border bg-card"}`}>
                      <div className="flex items-center gap-2 text-xs font-medium">
                        {reached ? <CheckCircle2 className="h-4 w-4 text-amber-600" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
                        {m.label}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">{m.threshold} Milhas</p>
                      {reached && <p className="text-[11px] text-muted-foreground">{fmt(meta?.reached_at)}</p>}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Histórico de redenções com responsável */}
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Histórico de Resgates</h2>
              {data.redemptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum resgate registrado.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted text-xs">
                      <tr>
                        <th className="px-3 py-2 text-left">Prêmio</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-left">Solicitado</th>
                        <th className="px-3 py-2 text-left">Decidido</th>
                        <th className="px-3 py-2 text-left">Responsável</th>
                        <th className="px-3 py-2 text-left">Justificativa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.redemptions.map((r: any) => (
                        <tr key={r.id} className="border-t border-border">
                          <td className="px-3 py-2">{r.rewardName}</td>
                          <td className="px-3 py-2">{r.status}</td>
                          <td className="px-3 py-2 text-xs">{fmt(r.createdAt)}</td>
                          <td className="px-3 py-2 text-xs">{fmt(r.decidedAt)}</td>
                          <td className="px-3 py-2 text-xs">{r.decidedBy ?? "—"}</td>
                          <td className="px-3 py-2 text-xs">{r.justification || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Ledger */}
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Extrato de Milhas (últimos 100)</h2>
              {data.ledger.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem movimentações.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted text-xs">
                      <tr>
                        <th className="px-3 py-2 text-left">Data</th>
                        <th className="px-3 py-2 text-left">Origem</th>
                        <th className="px-3 py-2 text-left">Motivo</th>
                        <th className="px-3 py-2 text-right">Milhas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ledger.map((l: any) => (
                        <tr key={l.id} className="border-t border-border">
                          <td className="px-3 py-2 text-xs">{fmt(l.created_at)}</td>
                          <td className="px-3 py-2 text-xs">{l.source_kind}</td>
                          <td className="px-3 py-2 text-xs">{l.reason || "—"}</td>
                          <td className="px-3 py-2 text-right text-xs font-semibold text-emerald-700">+{l.miles}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Audit log */}
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Auditoria de Ajustes</h2>
              {data.audit.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem registros.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.audit.map((a: any) => (
                    <li key={a.id} className="rounded-md border border-border bg-card px-3 py-2 text-xs">
                      <div className="flex justify-between">
                        <span className="font-medium">{a.action}</span>
                        <span className="text-muted-foreground">{fmt(a.createdAt)}</span>
                      </div>
                      <p className="text-muted-foreground">Responsável: {a.actor ?? "—"}</p>
                      {a.justification && <p>{a.justification}</p>}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-muted-foreground">
                Edição direta de Milhas não está disponível nesta tela. Use o módulo Missões → Ajustar Milhas para registrar mudanças com auditoria obrigatória.
              </p>
            </section>
          </>
        )}
      </div>

      {decision && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setDecision(null)}>
          <div className="w-full max-w-md rounded-lg bg-card p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 text-base font-semibold">
              {decision.status === "entregue" ? "Marcar como entregue" : "Cancelar resgate"}
            </h2>
            <textarea
              required
              placeholder="Justificativa obrigatória"
              className="min-h-[80px] w-full rounded-md border border-input bg-background p-2 text-sm"
              value={just}
              onChange={(e) => setJust(e.target.value)}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setDecision(null)} className="rounded-md border border-input px-3 py-2 text-sm">
                <X className="mr-1 inline h-3 w-3" /> Voltar
              </button>
              <button
                onClick={confirmDecision}
                disabled={!just.trim()}
                className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                <Check className="mr-1 inline h-3 w-3" /> Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function RewardGroup({
  title,
  items,
  onDecide,
}: {
  title: string;
  items: any[];
  onDecide?: (id: string, status: "entregue" | "cancelado") => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => {
            const Icon = TYPE_ICON[r.rewardType ?? "outro"] ?? Award;
            return (
              <li key={r.id} className="flex items-center gap-2 rounded-md border border-border bg-background p-2 text-xs">
                <Icon className="h-4 w-4 text-amber-700" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {r.milestoneMiles} Milhas
                    {r.state === "bloqueado" && r.missing > 0 && ` • Faltam ${r.missing}`}
                    {r.redemption?.decidedBy && ` • por ${r.redemption.decidedBy}`}
                  </p>
                </div>
                {onDecide && r.redemption?.id && (
                  <div className="flex gap-1">
                    <button onClick={() => onDecide(r.redemption.id, "entregue")} className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] text-white">
                      Entregar
                    </button>
                    <button onClick={() => onDecide(r.redemption.id, "cancelado")} className="rounded-md border border-input px-2 py-1 text-[11px]">
                      Cancelar
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
