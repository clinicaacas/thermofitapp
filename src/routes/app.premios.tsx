import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ClientAppShell } from "@/components/client-app-shell";
import {
  listClientRewards,
  getClientMiles,
  requestRewardRedemption,
  listClientRedemptions,
} from "@/lib/thermofit-client-app.functions";
import { Award, Plane, CheckCircle2, Clock, XCircle } from "lucide-react";

export const Route = createFileRoute("/app/premios")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

const STATUS_META: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  pendente: { label: "Pendente", icon: Clock, color: "#B7791F" },
  aprovado: { label: "Aprovado", icon: CheckCircle2, color: "#2F855A" },
  entregue: { label: "Entregue", icon: CheckCircle2, color: "#2F855A" },
  recusado: { label: "Recusado", icon: XCircle, color: "#C53030" },
  cancelado: { label: "Cancelado", icon: XCircle, color: "#7A6A52" },
};

function Page() {
  const { clientId } = useSearch({ from: "/app/premios" });
  const qc = useQueryClient();
  const fetchRewards = useServerFn(listClientRewards);
  const fetchMiles = useServerFn(getClientMiles);
  const redeem = useServerFn(requestRewardRedemption);
  const fetchRedemptions = useServerFn(listClientRedemptions);

  const { data: rewardsData, isLoading } = useQuery({
    queryKey: ["client-rewards", clientId],
    queryFn: () => fetchRewards({ data: { clientId } }),
    enabled: !!clientId,
  });
  const { data: milesData } = useQuery({
    queryKey: ["client-miles", clientId],
    queryFn: () => fetchMiles({ data: { clientId } }),
    enabled: !!clientId,
  });
  const { data: redemptionsData } = useQuery({
    queryKey: ["client-redemptions", clientId],
    queryFn: () => fetchRedemptions({ data: { clientId } }),
    enabled: !!clientId,
  });

  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const redeemMut = useMutation({
    mutationFn: (rewardId: string) => redeem({ data: { clientId, rewardId } }),
    onSuccess: () => {
      setMsg({ type: "ok", text: "Resgate solicitado! Aguarde aprovação." });
      qc.invalidateQueries({ queryKey: ["client-miles", clientId] });
      qc.invalidateQueries({ queryKey: ["client-rewards", clientId] });
      qc.invalidateQueries({ queryKey: ["client-redemptions", clientId] });
    },
    onError: (e: any) => setMsg({ type: "err", text: e?.message ?? "Erro ao resgatar." }),
  });

  const rewards = rewardsData?.rewards ?? [];
  const balance = milesData?.balance ?? 0;
  const redemptions = redemptionsData?.redemptions ?? [];

  return (
    <ClientAppShell title="Prêmios">
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl border border-[#E5D6BD] bg-gradient-to-br from-[#F8F1E6] to-[#F3E8D2] p-4">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-[#8A6A3D] text-white">
            <Plane className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#7A6A52]">
              Saldo de milhas
            </p>
            <p className="text-2xl font-bold text-[#3D2E1C]">{balance}</p>
          </div>
        </div>

        {msg && (
          <div
            className={`rounded-lg px-3 py-2 text-sm ${
              msg.type === "ok"
                ? "border border-green-200 bg-green-50 text-green-700"
                : "border border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {msg.text}
          </div>
        )}

        {isLoading && <p className="text-sm text-[#7A6A52]">Carregando…</p>}
        {!isLoading && rewards.length === 0 && (
          <div className="rounded-xl border border-dashed border-[#E5D6BD] bg-white p-8 text-center">
            <p className="text-sm text-[#7A6A52]">Nenhum prêmio disponível ainda.</p>
          </div>
        )}

        <ul className="space-y-3">
          {rewards.map((r: any) => {
            const canAfford = balance >= (r.cost_miles ?? 0);
            const inStock = (r.stock ?? 0) > 0;
            const disabled = !canAfford || !inStock || redeemMut.isPending;
            return (
              <li
                key={r.id}
                className="flex items-center gap-3 rounded-xl border border-[#E5D6BD] bg-white p-3"
              >
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-[#F3E8D2] text-[#8A6A3D]">
                  <Award className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#3D2E1C]">{r.name}</p>
                  <p className="text-xs text-[#7A6A52]">
                    {r.cost_miles} milhas · {inStock ? `${r.stock} em estoque` : "sem estoque"}
                  </p>
                </div>
                <button
                  disabled={disabled}
                  onClick={() => {
                    setMsg(null);
                    redeemMut.mutate(r.id);
                  }}
                  className="rounded-full bg-[#8A6A3D] px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#C9B591]"
                >
                  {!inStock ? "Esgotado" : !canAfford ? "Sem milhas" : "Resgatar"}
                </button>
              </li>
            );
          })}
        </ul>

        {redemptions.length > 0 && (
          <div className="rounded-2xl border border-[#E5D6BD] bg-white p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7A6A52]">
              Meus resgates
            </p>
            <ul className="divide-y divide-[#F3E8D2]">
              {redemptions.map((rd: any) => {
                const meta = STATUS_META[rd.status] ?? STATUS_META.pendente;
                const Icon = meta.icon;
                return (
                  <li key={rd.id} className="flex items-center justify-between py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[#3D2E1C]">
                        {rd.rewards?.name ?? "Prêmio"}
                      </p>
                      <p className="text-xs text-[#7A6A52]">{rd.cost_miles} milhas</p>
                    </div>
                    <span
                      className="inline-flex items-center gap-1 text-xs font-medium"
                      style={{ color: meta.color }}
                    >
                      <Icon className="h-3 w-3" /> {meta.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </ClientAppShell>
  );
}
