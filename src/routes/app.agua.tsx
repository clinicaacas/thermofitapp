import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClientAppShell } from "@/components/client-app-shell";
import {
  getHydrationToday,
  addHydration,
  undoLastHydration,
} from "@/lib/thermofit-client-app.functions";
import { invalidateClientMissionData, useMissionsRealtime } from "@/hooks/use-missions-realtime";
import { Droplet, Undo2 } from "lucide-react";

export const Route = createFileRoute("/app/agua")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

const QUICK_MLS = [100, 200, 300, 500];

function Page() {
  const { clientId } = useSearch({ from: "/app/agua" });
  const qc = useQueryClient();
  const fetchToday = useServerFn(getHydrationToday);
  const addFn = useServerFn(addHydration);
  const undoFn = useServerFn(undoLastHydration);
  useMissionsRealtime(clientId || null);

  const { data, isLoading } = useQuery({
    queryKey: ["client-hydration", clientId],
    queryFn: () => fetchToday({ data: { clientId } }),
    enabled: !!clientId,
  });

  const addMut = useMutation({
    mutationFn: (ml: number) => addFn({ data: { clientId, ml } }),
    onSuccess: () => {
      invalidateClientMissionData(qc, clientId);
    },
  });

  const undoMut = useMutation({
    mutationFn: () => undoFn({ data: { clientId } }),
    onSuccess: () => {
      invalidateClientMissionData(qc, clientId);
    },
  });

  const total = data?.total ?? 0;
  const goal = data?.goal ?? 2000;
  const pct = Math.min(100, Math.round((total / goal) * 100));
  const remaining = Math.max(0, goal - total);
  const busy = addMut.isPending || undoMut.isPending || isLoading;

  return (
    <ClientAppShell title="Hidratação">
      <div className="space-y-4">
        <div className="rounded-2xl border border-[#E5D6BD] bg-white p-6 text-center">
          <Droplet className="mx-auto h-10 w-10 text-[#8A6A3D]" />
          <p className="mt-2 text-3xl font-bold text-[#3D2E1C]">
            {total}
            <span className="ml-1 text-base font-medium text-[#7A6A52]">/ {goal} ml</span>
          </p>
          <p className="mt-1 text-xs text-[#7A6A52]">
            {remaining === 0 ? "Meta atingida hoje!" : `Faltam ${remaining} ml`}
          </p>
          <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-[#F3E8D2]">
            <div
              className="h-full rounded-full bg-[#8A6A3D] transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="mt-6 grid grid-cols-4 gap-2">
            {QUICK_MLS.map((q) => (
              <button
                key={q}
                disabled={busy}
                onClick={() => addMut.mutate(q)}
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
