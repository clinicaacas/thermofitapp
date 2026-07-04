import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ────────────────────────────────────────────────────────────────
// Deduplicação por ID exato (sem janela temporal como critério).
// Escopo lógico: tenantId:clientId:journeyId:kind:id.
// A subscrição Realtime já é por clientId, então mantemos os mapas
// indexados por clientId; tenantId/journeyId compõem apenas a chave
// registrada para evitar colisão entre jornadas do mesmo cliente.
// TTL existe unicamente para GC de memória.
// ────────────────────────────────────────────────────────────────
type Kind = "hydration" | "miles" | "completion";
const LOCAL_ID_TTL_MS = 60_000;

const registered = new Map<string, Map<Kind, Map<string, number>>>();
const inFlight = new Map<string, number>();
const buffers = new Map<string, Array<{ kind: Kind; id: string; process: () => void }>>();

function kindMap(clientId: string, kind: Kind) {
  let byKind = registered.get(clientId);
  if (!byKind) {
    byKind = new Map();
    registered.set(clientId, byKind);
  }
  let m = byKind.get(kind);
  if (!m) {
    m = new Map();
    byKind.set(kind, m);
  }
  return m;
}
function gc(clientId: string) {
  const byKind = registered.get(clientId);
  if (!byKind) return;
  const cutoff = Date.now() - LOCAL_ID_TTL_MS;
  for (const m of byKind.values()) for (const [id, t] of m) if (t < cutoff) m.delete(id);
}
function registerId(clientId: string, kind: Kind, id: string) {
  if (!clientId || !id) return;
  gc(clientId);
  kindMap(clientId, kind).set(id, Date.now());
}
function consume(clientId: string, kind: Kind, id: string | null | undefined) {
  if (!clientId || !id) return false;
  const m = registered.get(clientId)?.get(kind);
  if (!m || !m.has(id)) return false;
  m.delete(id);
  return true;
}

/** Compat: mantido para não quebrar imports existentes. */
export function markLocalHydrationLogId(clientId: string, hydrationLogId: string) {
  registerId(clientId, "hydration", hydrationLogId);
}

export function beginLocalMutation(clientId: string) {
  if (!clientId) return;
  inFlight.set(clientId, (inFlight.get(clientId) ?? 0) + 1);
}
export function finishLocalMutation(
  clientId: string,
  ids: { hydrationLogId?: string | null; ledgerId?: string | null; completionId?: string | null },
) {
  if (!clientId) return;
  if (ids.hydrationLogId) registerId(clientId, "hydration", ids.hydrationLogId);
  if (ids.ledgerId) registerId(clientId, "miles", ids.ledgerId);
  if (ids.completionId) registerId(clientId, "completion", ids.completionId);
  const c = (inFlight.get(clientId) ?? 1) - 1;
  if (c <= 0) inFlight.delete(clientId);
  else inFlight.set(clientId, c);
  const buf = buffers.get(clientId);
  if (buf && (inFlight.get(clientId) ?? 0) === 0) {
    buffers.delete(clientId);
    for (const ev of buf) {
      if (!consume(clientId, ev.kind, ev.id)) ev.process();
    }
  }
}
export function abortLocalMutation(clientId: string) {
  if (!clientId) return;
  const c = (inFlight.get(clientId) ?? 1) - 1;
  if (c <= 0) inFlight.delete(clientId);
  else inFlight.set(clientId, c);
  const buf = buffers.get(clientId);
  if (buf && (inFlight.get(clientId) ?? 0) === 0) {
    buffers.delete(clientId);
    // erro: nunca perder atualização externa — processa tudo.
    for (const ev of buf) ev.process();
  }
}
function clearClientState(clientId: string) {
  registered.delete(clientId);
  inFlight.delete(clientId);
  buffers.delete(clientId);
}

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

export function invalidateHydrationScope(qc: ReturnType<typeof useQueryClient>, clientId: string) {
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

    const scheduleHydration = () => {
      if (hydrationDebounce) clearTimeout(hydrationDebounce);
      hydrationDebounce = setTimeout(() => invalidateHydrationScope(qc, clientId), 250);
    };
    const scheduleGeneric = () => {
      if (genericDebounce) clearTimeout(genericDebounce);
      genericDebounce = setTimeout(() => invalidateClientMissionData(qc, clientId), 250);
    };

    const handle = (kind: Kind, id: string | undefined, process: () => void) => {
      // ID conhecido: eco de mutation local — descarta apenas este.
      if (id && consume(clientId, kind, id)) return;
      // Mutation local em andamento e evento tem ID: aguarda finish para decidir.
      if (id && (inFlight.get(clientId) ?? 0) > 0) {
        const list = buffers.get(clientId) ?? [];
        list.push({ kind, id, process });
        buffers.set(clientId, list);
        return;
      }
      process();
    };

    for (const table of TABLES) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `client_id=eq.${clientId}` },
        (payload: any) => {
          const rowId: string | undefined = payload?.new?.id ?? payload?.old?.id;
          if (table === "client_hydration_logs") {
            handle("hydration", rowId, scheduleHydration);
            return;
          }
          if (table === "miles_ledger") {
            const sourceKind: string | undefined = payload?.new?.source_kind ?? payload?.old?.source_kind;
            // Eco de Milhas de hidratação: dedupe por ledgerId + scope reduzido.
            if (sourceKind === "hydration_goal") {
              handle("miles", rowId, scheduleHydration);
              return;
            }
            // Outras fontes (vídeo, treino, etc.): fluxo genérico.
            scheduleGeneric();
            return;
          }
          if (table === "client_mission_completions") {
            const sourceKind: string | undefined = payload?.new?.source_kind ?? payload?.old?.source_kind;
            if (sourceKind === "hydration_goal") {
              handle("completion", rowId, scheduleHydration);
              return;
            }
            scheduleGeneric();
            return;
          }
          scheduleGeneric();
        },
      );
    }
    channel.subscribe();
    return () => {
      if (hydrationDebounce) clearTimeout(hydrationDebounce);
      if (genericDebounce) clearTimeout(genericDebounce);
      supabase.removeChannel(channel);
      // Isolamento entre trocas de cliente/jornada/sessão/logout.
      clearClientState(clientId);
    };
  }, [clientId, qc]);
}
