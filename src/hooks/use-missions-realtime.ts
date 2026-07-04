import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Deduplicação por ID exato do registro de hidratação criado/removido pela
// mutation local. A janela temporal existe apenas para GC dos IDs; a decisão
// de ignorar um evento Realtime é sempre por igualdade de ID.
const LOCAL_HYDRATION_ID_TTL_MS = 30_000;
const localHydrationLogIds = new Map<string, Map<string, number>>();

function getSet(clientId: string) {
  let m = localHydrationLogIds.get(clientId);
  if (!m) {
    m = new Map();
    localHydrationLogIds.set(clientId, m);
  }
  return m;
}
function gc(clientId: string) {
  const m = localHydrationLogIds.get(clientId);
  if (!m) return;
  const cutoff = Date.now() - LOCAL_HYDRATION_ID_TTL_MS;
  for (const [id, t] of m) if (t < cutoff) m.delete(id);
}
export function markLocalHydrationLogId(clientId: string, hydrationLogId: string) {
  if (!clientId || !hydrationLogId) return;
  gc(clientId);
  getSet(clientId).set(hydrationLogId, Date.now());
}
function consumeLocalHydrationLogId(clientId: string, hydrationLogId: string | null | undefined) {
  if (!clientId || !hydrationLogId) return false;
  const m = localHydrationLogIds.get(clientId);
  if (!m || !m.has(hydrationLogId)) return false;
  m.delete(hydrationLogId);
  return true;
}



// Hook único de sincronização das Missões.
// Escuta as tabelas oficiais e invalida todas as queries que dependem delas,
// para que toda tela (Home, Missões, Vídeos, Hidratação, Fotos, Prêmios,
// Conquistas, visão admin) reflita o estado real sem refresh manual.
//
// Filtro por client_id é aplicado em cada subscrição para reduzir tráfego.
const TABLES = [
  "miles_ledger",
  "client_missions",
  "client_video_progress",
  "client_mission_completions",
  "client_hydration_logs",
  "client_progress_photos",
  "client_task_responses",
  "client_daily_responses",
  "client_seals",
  "client_journey_milestones",
  "reward_redemptions",
] as const;

// Query keys que precisam ser invalidadas em qualquer evento.
// Todas as telas consomem destas chaves — nunca calcular paralelo.
export function invalidateHydrationScope(qc: ReturnType<typeof useQueryClient>, clientId: string) {
  // Invalidação direcionada para eventos de hidratação:
  // atualiza somente Hidratação, Home, Missões e Milhas do cliente.
  // Queries inativas ficam stale sem refetch imediato (refetchType: 'active').
  const keys = [
    ["client-hydration", clientId],
    ["mission-summary", clientId],
    ["client-home", clientId],
    ["client-missions", clientId],
    ["client-missions-today", clientId],
    ["client-miles", clientId],
    ["journey-progress", clientId],
  ];
  for (const k of keys) qc.invalidateQueries({ queryKey: k, refetchType: "active" });
}

export function invalidateClientMissionData(qc: ReturnType<typeof useQueryClient>, clientId: string) {
  const keys = [
    ["client-identity", clientId],
    ["mission-summary", clientId],
    ["client-missions", clientId],
    ["client-home", clientId],
    ["client-miles", clientId],
    ["client-hydration", clientId],
    ["journey-progress", clientId],
    ["weekly-photo-state", clientId],
    ["client-photos", clientId],
    ["post-video-task-state", clientId],
    ["client-video-day-state", clientId],
    ["client-post-video-tasks", clientId],
    ["daily-routine", clientId],
    ["client-rewards", clientId],
    ["client-redemptions", clientId],
    ["client-achievements", clientId],
    ["client-notifications", clientId],
    ["client-rewards-admin", clientId],
    ["client-missions-today", clientId],
    ["client-stats", clientId],
    ["admin-client-photos", clientId],
  ];
  for (const k of keys) qc.invalidateQueries({ queryKey: k, refetchType: "active" });
  qc.invalidateQueries({
    predicate: (q) => {
      const k = q.queryKey as unknown[];
      const head = String(k[0] ?? "");
      if (head !== "client-videos" && head !== "client-video-missions" && head !== "client-video-playback" && head !== "client-video-day-state") {
        return false;
      }
      return k.includes(clientId);
    },
    refetchType: "active",
  });
  qc.invalidateQueries({ queryKey: ["missions-central"], refetchType: "active" });
  qc.invalidateQueries({ queryKey: ["missions-overview"], refetchType: "active" });
}



export function useMissionsRealtime(clientId: string | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!clientId) return;
    const channel = supabase.channel(`missions-realtime:${clientId}`);
    let hydrationDebounce: ReturnType<typeof setTimeout> | null = null;
    let genericDebounce: ReturnType<typeof setTimeout> | null = null;
    for (const table of TABLES) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `client_id=eq.${clientId}`,
        },
        () => {
          // Eventos de hidratação usam invalidação direcionada (Hidratação/Home/Missões/Milhas),
          // sem tocar em Vídeos, Treino, Nutrição, Fotos etc.
          if (table === "client_hydration_logs") {
            // Dedupe: mutation local já reconciliou; ignora eco Realtime da mesma sessão.
            if (isRecentLocalHydrationMutation(clientId)) return;
            if (hydrationDebounce) clearTimeout(hydrationDebounce);
            hydrationDebounce = setTimeout(() => invalidateHydrationScope(qc, clientId), 250);
            return;
          }

          if (genericDebounce) clearTimeout(genericDebounce);
          genericDebounce = setTimeout(() => invalidateClientMissionData(qc, clientId), 250);
        },
      );
    }
    channel.subscribe();
    return () => {
      if (hydrationDebounce) clearTimeout(hydrationDebounce);
      if (genericDebounce) clearTimeout(genericDebounce);
      supabase.removeChannel(channel);
    };
  }, [clientId, qc]);
}

