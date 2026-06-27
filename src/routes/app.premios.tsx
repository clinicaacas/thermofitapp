import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ClientAppShell } from "@/components/client-app-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listClientRewards,
  getClientMiles,
  requestRewardRedemption,
  listClientRedemptions,
  listClientAchievements,
} from "@/lib/thermofit-client-app.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  Award,
  Plane,
  Gift,
  Sparkles,
  Ticket,
  Camera,
  Lock,
  CheckCircle2,
  Trophy,
  Flag,
} from "lucide-react";

export const Route = createFileRoute("/app/premios")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

const REWARD_ICON: Record<string, typeof Gift> = {
  mimo: Gift,
  sessao: Sparkles,
  voucher: Ticket,
  ensaio: Camera,
};

const SEAL_META: Record<string, { label: string; threshold: number }> = {
  streak_7: { label: "Constância 7 dias", threshold: 7 },
  streak_14: { label: "Constância 14 dias", threshold: 14 },
  streak_21: { label: "Constância 21 dias", threshold: 21 },
  program_complete: { label: "Programa Completo", threshold: 84 },
};

const MILESTONES = [
  { code: "milestone_checkin", label: "Check-in", threshold: 0 },
  { code: "milestone_300", label: "Decolagem", threshold: 300 },
  { code: "milestone_600", label: "Subida", threshold: 600 },
  { code: "milestone_900", label: "Altitude", threshold: 900 },
  { code: "milestone_1300", label: "Ponto B", threshold: 1300 },
];

function useRewardsRealtime(clientId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!clientId) return;
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ["client-miles", clientId] });
      qc.invalidateQueries({ queryKey: ["client-rewards", clientId] });
      qc.invalidateQueries({ queryKey: ["client-redemptions", clientId] });
      qc.invalidateQueries({ queryKey: ["client-achievements", clientId] });
      qc.invalidateQueries({ queryKey: ["client-notifications", clientId] });
    };
    const channel = supabase
      .channel(`rewards-${clientId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "miles_ledger", filter: `client_id=eq.${clientId}` }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "client_seals", filter: `client_id=eq.${clientId}` }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "client_journey_milestones", filter: `client_id=eq.${clientId}` }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "reward_redemptions", filter: `client_id=eq.${clientId}` }, invalidate)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, qc]);
}

function Page() {
  const { clientId } = useSearch({ from: "/app/premios" });
  const qc = useQueryClient();
  const fetchRewards = useServerFn(listClientRewards);
  const fetchMiles = useServerFn(getClientMiles);
  const redeem = useServerFn(requestRewardRedemption);
  const fetchRedemptions = useServerFn(listClientRedemptions);
  const fetchAchievements = useServerFn(listClientAchievements);

  useRewardsRealtime(clientId);

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
  const { data: achievementsData } = useQuery({
    queryKey: ["client-achievements", clientId],
    queryFn: () => fetchAchievements({ data: { clientId } }),
    enabled: !!clientId,
  });
  useQuery({
    queryKey: ["client-redemptions", clientId],
    queryFn: () => fetchRedemptions({ data: { clientId } }),
    enabled: !!clientId,
  });

  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const redeemMut = useMutation({
    mutationFn: (rewardId: string) => redeem({ data: { clientId, rewardId } }),
    onSuccess: () => {
      setMsg({ type: "ok", text: "Prêmio solicitado! Em breve a equipe entra em contato." });
      qc.invalidateQueries({ queryKey: ["client-rewards", clientId] });
      qc.invalidateQueries({ queryKey: ["client-redemptions", clientId] });
    },
    onError: (e: any) => setMsg({ type: "err", text: e?.message ?? "Erro ao solicitar." }),
  });

  const rewards = rewardsData?.rewards ?? [];
  const balance = milesData?.balance ?? 0;
  const seals = (achievementsData?.seals ?? []) as Array<{ seal_code: string }>;
  const milestones = (achievementsData?.milestones ?? []) as Array<{ milestone_code: string }>;
  const sealCodes = new Set(seals.map((s) => s.seal_code));
  const msCodes = new Set(milestones.map((m) => m.milestone_code));

  return (
    <ClientAppShell title="Prêmios">
      <div className="space-y-4">
        {/* Card premium saldo */}
        <div className="flex items-center gap-3 rounded-2xl border border-[#E5D6BD] bg-gradient-to-br from-[#F8F1E6] to-[#F3E8D2] p-4 shadow-sm">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-[#8A6A3D] text-white">
            <Plane className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7A6A52]">
              Saldo de Milhas
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

        <Tabs defaultValue="premios" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-[#F3E8D2]">
            <TabsTrigger value="premios" className="data-[state=active]:bg-white">
              🎁 Prêmios
            </TabsTrigger>
            <TabsTrigger value="conquistas" className="data-[state=active]:bg-white">
              🖼️ Conquistas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="premios" className="space-y-3 pt-3">
            {isLoading && <p className="text-sm text-[#7A6A52]">Carregando…</p>}
            {!isLoading && rewards.length === 0 && (
              <div className="rounded-xl border border-dashed border-[#E5D6BD] bg-white p-8 text-center">
                <p className="text-sm text-[#7A6A52]">Nenhum prêmio disponível ainda.</p>
              </div>
            )}
            <ul className="space-y-3">
              {rewards.map((r: any) => {
                const Icon = REWARD_ICON[r.rewardType ?? ""] ?? Award;
                const state: string = r.state;
                let label = "";
                let actionable = false;
                if (state === "entregue") label = "Entregue";
                else if (state === "solicitado") label = "Solicitado";
                else if (state === "liberado") {
                  label = "Liberado";
                  actionable = true;
                } else label = `Faltam ${r.missing} Milhas`;

                const badgeStyle =
                  state === "entregue"
                    ? "bg-emerald-100 text-emerald-700"
                    : state === "solicitado"
                      ? "bg-amber-100 text-amber-700"
                      : state === "liberado"
                        ? "bg-[#8A6A3D] text-white"
                        : "bg-[#F3E8D2] text-[#7A6A52]";

                return (
                  <li
                    key={r.id}
                    className="flex items-center gap-3 rounded-2xl border border-[#E5D6BD] bg-white p-3 shadow-sm"
                  >
                    <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#F3E8D2] to-[#E5D6BD] text-[#8A6A3D]">
                      <Icon className="h-7 w-7" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#3D2E1C]">{r.name}</p>
                      <p className="text-xs text-[#7A6A52]">{r.milestoneMiles} Milhas</p>
                      <span
                        className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeStyle}`}
                      >
                        {label}
                      </span>
                    </div>
                    {actionable && (
                      <button
                        disabled={redeemMut.isPending}
                        onClick={() => {
                          setMsg(null);
                          redeemMut.mutate(r.id);
                        }}
                        className="rounded-full bg-[#8A6A3D] px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Solicitar
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </TabsContent>

          <TabsContent value="conquistas" className="space-y-4 pt-3">
            <Section title="Selos de Constância" icon={Trophy}>
              <div className="grid grid-cols-4 gap-3">
                {Object.entries(SEAL_META).map(([code, meta]) => {
                  const earned = sealCodes.has(code);
                  return (
                    <AchievementCircle
                      key={code}
                      earned={earned}
                      label={meta.label}
                      icon={earned ? Trophy : Lock}
                    />
                  );
                })}
              </div>
            </Section>

            <Section title="Marcos da Jornada" icon={Flag}>
              <div className="grid grid-cols-5 gap-2">
                {MILESTONES.map((m) => {
                  const reached = msCodes.has(m.code) || balance >= m.threshold;
                  return (
                    <AchievementCircle
                      key={m.code}
                      earned={reached}
                      label={m.label}
                      sub={m.threshold === 0 ? "Início" : `${m.threshold}`}
                      icon={reached ? CheckCircle2 : Lock}
                    />
                  );
                })}
              </div>
            </Section>
          </TabsContent>
        </Tabs>
      </div>
    </ClientAppShell>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Trophy;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#E5D6BD] bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-[#8A6A3D]" />
        <p className="text-xs font-semibold uppercase tracking-wide text-[#7A6A52]">{title}</p>
      </div>
      {children}
    </div>
  );
}

function AchievementCircle({
  earned,
  label,
  sub,
  icon: Icon,
}: {
  earned: boolean;
  label: string;
  sub?: string;
  icon: typeof Trophy;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div
        className={`grid h-14 w-14 place-items-center rounded-full border-2 ${
          earned ? "border-[#C9A85B] bg-gradient-to-br from-[#F5D67A] to-[#C9A85B] text-white" : "border-[#E5D6BD] bg-[#F3E8D2] text-[#C9B591]"
        }`}
      >
        <Icon className="h-6 w-6" />
      </div>
      <p
        className={`mt-1 text-[10px] leading-tight ${earned ? "font-semibold text-[#3D2E1C]" : "text-[#7A6A52]"}`}
      >
        {label}
      </p>
      {sub && <p className="text-[9px] text-[#7A6A52]">{sub}</p>}
    </div>
  );
}
