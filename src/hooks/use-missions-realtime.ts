import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
export function invalidateClientMissionData(qc: ReturnType<typeof useQueryClient>, clientId: string) {
  const keys = [
    ["mission-summary", clientId],
    ["client-missions", clientId],
    ["client-home", clientId],
    ["client-miles", clientId],
    ["client-hydration", clientId],
    ["journey-progress", clientId],
    ["weekly-photo-state", clientId],
    ["client-photos", clientId],
    ["post-video-task-state", clientId],
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
  for (const k of keys) qc.invalidateQueries({ queryKey: k, refetchType: "all" });
  // Chaves de vídeo são escopadas por (tenantId, clientId, journeyId).
  // Invalida por predicate para alcançar a chave exata da identidade ativa
  // sem reativar caches de jornadas anteriores.
  qc.invalidateQueries({
    predicate: (q) => {
      const k = q.queryKey as unknown[];
      const head = String(k[0] ?? "");
      if (head !== "client-videos" && head !== "client-video-missions" && head !== "client-video-playback") {
        return false;
      }
      return k.includes(clientId);
    },
    refetchType: "all",
  });
  qc.invalidateQueries({ queryKey: ["missions-central"], refetchType: "all" });
  qc.invalidateQueries({ queryKey: ["missions-overview"], refetchType: "all" });
}


export function useMissionsRealtime(clientId: string | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!clientId) return;
    const channel = supabase.channel(`missions-realtime:${clientId}`);
    for (const table of TABLES) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `client_id=eq.${clientId}`,
        },
        () => invalidateClientMissionData(qc, clientId),
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, qc]);
}
