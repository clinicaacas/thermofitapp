import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef } from "react";
import { ClientAppShell } from "@/components/client-app-shell";
import {
  getHydrationToday,
  addHydration,
  undoLastHydration,
} from "@/lib/thermofit-client-app.functions";
import {
  invalidateHydrationScope,
  beginLocalMutation,
  finishLocalMutation,
  abortLocalMutation,
  useMissionsRealtime,
} from "@/hooks/use-missions-realtime";
import { Droplet, Undo2 } from "lucide-react";

export const Route = createFileRoute("/app/agua")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

const QUICK_MLS = [100, 200, 300, 500];

type HydrationSnapshot = {
  day: string;
  total: number;
  goal: number;
  creditedToday: boolean;
  creditedMiles: number;
  creditedAt: string | null;
  logs: Array<{ id: string; ml: number; created_at: string }>;
};

function Page() {
  const { clientId } = useSearch({ from: "/app/agua" });
  const qc = useQueryClient();
  const fetchToday = useServerFn(getHydrationToday);
  const addFn = useServerFn(addHydration);
  const undoFn = useServerFn(undoLastHydration);
  useMissionsRealtime(clientId || null);
  const lastClickRef = useRef(0);

  const queryKey = ["client-hydration", clientId] as const;
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchToday({ data: { clientId } }),
    enabled: !!clientId,
  });

  const addMut = useMutation({
    mutationFn: (ml: number) => addFn({ data: { clientId, ml } }),
    onMutate: async (ml: number) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<HydrationSnapshot>(queryKey);
      if (prev) {
        const optimistic: HydrationSnapshot = {
          ...prev,
          total: prev.total + ml,
          logs: [
            { id: `optimistic-${Date.now()}`, ml, created_at: new Date().toISOString() },
            ...prev.logs,
          ],
        };
        qc.setQueryData(queryKey, optimistic);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
    },
    onSuccess: (resp) => {
      const r = resp as any;
      // Registra o ID exato do log criado para dedupe do eco Realtime desta sessão.
      if (r?.hydrationLogId) markLocalHydrationLogId(clientId, r.hydrationLogId);
      // Reconcilia hidratação com resposta autoritativa — sem refetch adicional.
      const prev = qc.getQueryData<HydrationSnapshot>(queryKey);
      if (prev && r) {
        qc.setQueryData<HydrationSnapshot>(queryKey, {
          ...prev,
          total: r.total ?? prev.total,
          goal: r.goal ?? prev.goal,
          creditedToday: r.creditedToday ?? prev.creditedToday,
          creditedMiles: r.creditedMiles ?? prev.creditedMiles,
        });
      }
      // Home/Missões/Milhas: invalidação direcionada, uma única vez.
      invalidateHydrationScope(qc, clientId);
    },
  });

  const undoMut = useMutation({
    mutationFn: () => undoFn({ data: { clientId } }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<HydrationSnapshot>(queryKey);
      if (prev && prev.logs.length > 0) {
        const [removed, ...rest] = prev.logs;
        qc.setQueryData<HydrationSnapshot>(queryKey, {
          ...prev,
          total: Math.max(0, prev.total - (removed?.ml ?? 0)),
          logs: rest,
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
    },
    onSuccess: (resp) => {
      const r = resp as any;
      if (r?.hydrationLogId) markLocalHydrationLogId(clientId, r.hydrationLogId);
      invalidateHydrationScope(qc, clientId);
    },
  });



  const handleAdd = (ml: number) => {
    const now = Date.now();
    if (now - lastClickRef.current < 350) return; // debounce ~350ms
    if (addMut.isPending) return;
    lastClickRef.current = now;
    addMut.mutate(ml);
  };


  const total = data?.total ?? 0;
  const goal = data?.goal ?? 2000;
  const pct = Math.min(100, Math.round((total / goal) * 100));
  const remaining = Math.max(0, goal - total);
  const completed = goal > 0 && total >= goal;
  const busy = addMut.isPending || undoMut.isPending || isLoading;

  return (
    <ClientAppShell title="Hidratação">
      <div className="space-y-4">
        <div className={`rounded-2xl border p-6 text-center ${completed ? "border-[#BFD8B7] bg-[#E8F2E5]" : "border-[#E5D6BD] bg-white"}`}>
          <Droplet className={`mx-auto h-10 w-10 ${completed ? "text-[#3F7A3A]" : "text-[#8A6A3D]"}`} />
          <p className="mt-2 text-3xl font-bold text-[#3D2E1C]">
            {total}
            <span className="ml-1 text-base font-medium text-[#7A6A52]">/ {goal} ml</span>
          </p>
          {completed ? (
            <span className="mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold text-[#2F6D34]" style={{ background: "#BFD8B7" }}>
              Meta concluída · +10 Milhas
            </span>
          ) : (
            <p className="mt-1 text-xs text-[#7A6A52]">Faltam {remaining} ml</p>
          )}
          <div className={`mt-4 h-3 w-full overflow-hidden rounded-full ${completed ? "bg-[#BFD8B7]" : "bg-[#F3E8D2]"}`}>
            <div
              className={`h-full rounded-full transition-all ${completed ? "bg-[#3F7A3A]" : "bg-[#8A6A3D]"}`}
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="mt-6 grid grid-cols-4 gap-2">
            {QUICK_MLS.map((q) => (
              <button
                key={q}
                disabled={isLoading}
                onClick={() => handleAdd(q)}
                className="rounded-xl border border-[#E5D6BD] bg-[#F8F1E6] px-2 py-3 text-sm font-semibold text-[#5C4528] transition hover:border-[#8A6A3D] disabled:opacity-50"

              >
                +{q}
              </button>
            ))}
          </div>

          <button
            disabled={busy || (data?.logs?.length ?? 0) === 0}
            onClick={() => undoMut.mutate()}
            className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-[#7A6A52] hover:text-[#5C4528] disabled:opacity-40"
          >
            <Undo2 className="h-3 w-3" /> Desfazer último
          </button>
        </div>

        <div className="rounded-2xl border border-[#E5D6BD] bg-white p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7A6A52]">
            Registros de hoje
          </p>
          {(data?.logs?.length ?? 0) === 0 ? (
            <p className="text-sm text-[#7A6A52]">Nenhum registro ainda.</p>
          ) : (
            <ul className="divide-y divide-[#F3E8D2]">
              {data!.logs.map((l: any) => (
                <li key={l.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-[#3D2E1C]">+{l.ml} ml</span>
                  <span className="text-xs text-[#7A6A52]">
                    {new Date(l.created_at).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ClientAppShell>
  );
}
