import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ────────────────────────────────────────────────────────────────
// Deduplicação por ID exato usando chave composta REAL:
//   tenantId:clientId:journeyId:kind:id
// Nunca por janela temporal. TTL só para GC de memória.
// ────────────────────────────────────────────────────────────────
type Kind = "hydration" | "miles" | "completion";
type Scope = { tenantId: string; clientId: string; journeyId: string };
const LOCAL_ID_TTL_MS = 60_000;

function scopeKey(s: Scope, kind: Kind) {
  return `${s.tenantId}:${s.clientId}:${s.journeyId}:${kind}`;
}

// registered: scopeKey -> Map<recordId, timestamp>
const registered = new Map<string, Map<string, number>>();
// inFlight/buffers indexados por `tenantId:clientId:journeyId` — mas como
// `onMutate` roda antes de conhecermos tenantId/journeyId, permitimos também
// uma chave parcial por clientId no momento de begin/end. A dedupe final,
// dentro do buffer, é sempre feita pela chave composta completa do evento.
const inFlight = new Map<string, number>(); // clientId -> count
const buffers = new Map<
  string, // clientId
  Array<{ scope: Scope; kind: Kind; id: string; process: () => void }>
>();

function gc(key: string) {
  const m = registered.get(key);
  if (!m) return;
  const cutoff = Date.now() - LOCAL_ID_TTL_MS;
  for (const [id, t] of m) if (t < cutoff) m.delete(id);
  if (m.size === 0) registered.delete(key);
}
function register(scope: Scope, kind: Kind, id: string) {
  if (!scope.tenantId || !scope.clientId || !scope.journeyId || !id) return;
  const key = scopeKey(scope, kind);
  gc(key);
  let m = registered.get(key);
  if (!m) {
    m = new Map();
    registered.set(key, m);
  }
  m.set(id, Date.now());
}
function consume(scope: Scope, kind: Kind, id: string | null | undefined) {
  if (!scope.tenantId || !scope.clientId || !scope.journeyId || !id) return false;
  const key = scopeKey(scope, kind);
  const m = registered.get(key);
  if (!m || !m.has(id)) return false;
  m.delete(id);
  if (m.size === 0) registered.delete(key);
  return true;
}

export function beginLocalMutation(clientId: string) {
  if (!clientId) return;
  inFlight.set(clientId, (inFlight.get(clientId) ?? 0) + 1);
}
function drainBuffer(clientId: string, matcher?: {
  scope: Scope;
  ids: { hydrationLogId?: string | null; ledgerId?: string | null; completionId?: string | null };
}) {
  const buf = buffers.get(clientId);
  if (!buf) return;
  if ((inFlight.get(clientId) ?? 0) > 0) return; // ainda há outra mutation
  buffers.delete(clientId);
  for (const ev of buf) {
    // Match final: mesma chave composta E mesmo ID retornado pela mutation local.
    if (matcher && sameScope(ev.scope, matcher.scope)) {
      const localId =
        ev.kind === "hydration" ? matcher.ids.hydrationLogId :
        ev.kind === "miles"     ? matcher.ids.ledgerId :
        ev.kind === "completion"? matcher.ids.completionId : null;
      if (localId && localId === ev.id) continue; // eco local → descarta
    }
    // Também respeita IDs já registrados (caso outra mutation tenha marcado).
    if (consume(ev.scope, ev.kind, ev.id)) continue;
    ev.process();
  }
}
function sameScope(a: Scope, b: Scope) {
  return a.tenantId === b.tenantId && a.clientId === b.clientId && a.journeyId === b.journeyId;
}
export function finishLocalMutation(
  clientId: string,
  scope: { tenantId?: string | null; journeyId?: string | null },
  ids: { hydrationLogId?: string | null; ledgerId?: string | null; completionId?: string | null },
) {
  if (!clientId) return;
  const fullScope: Scope | null =
    scope.tenantId && scope.journeyId
      ? { tenantId: scope.tenantId, clientId, journeyId: scope.journeyId }
      : null;
  if (fullScope) {
    if (ids.hydrationLogId) register(fullScope, "hydration", ids.hydrationLogId);
    if (ids.ledgerId) register(fullScope, "miles", ids.ledgerId);
    if (ids.completionId) register(fullScope, "completion", ids.completionId);
  }
  const c = (inFlight.get(clientId) ?? 1) - 1;
  if (c <= 0) inFlight.delete(clientId);
  else inFlight.set(clientId, c);
  drainBuffer(clientId, fullScope ? { scope: fullScope, ids } : undefined);
}
export function abortLocalMutation(clientId: string) {
  if (!clientId) return;
  const c = (inFlight.get(clientId) ?? 1) - 1;
  if (c <= 0) inFlight.delete(clientId);
  else inFlight.set(clientId, c);
  // Erro: nunca perder atualização externa — processa tudo.
  const buf = buffers.get(clientId);
  if (buf && (inFlight.get(clientId) ?? 0) === 0) {
    buffers.delete(clientId);
    for (const ev of buf) ev.process();
  }
}
/** Compat: assinatura antiga; mantida somente para não quebrar imports. */
export function markLocalHydrationLogId(_clientId: string, _hydrationLogId: string) {
  // No-op: a dedupe agora exige chave composta completa via finishLocalMutation.
}

function clearClientState(clientId: string) {
  inFlight.delete(clientId);
  buffers.delete(clientId);
  // Remove todas as entradas registradas cuja chave contém este clientId.
  for (const k of Array.from(registered.keys())) {
    if (k.includes(`:${clientId}:`)) registered.delete(k);
  }
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

    const handle = (
      kind: Kind,
      tenantId: string | undefined,
      journeyId: string | undefined,
      id: string | undefined,
      process: () => void,
    ) => {
      // Sem chave composta completa → não dá para deduplicar com segurança.
      if (!tenantId || !journeyId || !id) {
        process();
        return;
      }
      const scope: Scope = { tenantId, clientId, journeyId };
      // ID já registrado por mutation local finalizada → descarta este eco.
      if (consume(scope, kind, id)) return;
      // Mutation local em andamento (mesma cliente): buffer para decidir no finish.
      if ((inFlight.get(clientId) ?? 0) > 0) {
        const list = buffers.get(clientId) ?? [];
        list.push({ scope, kind, id, process });
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
          const tenantId: string | undefined = payload?.new?.tenant_id ?? payload?.old?.tenant_id;
          const journeyId: string | undefined = payload?.new?.journey_id ?? payload?.old?.journey_id;

          if (table === "client_hydration_logs") {
            handle("hydration", tenantId, journeyId, rowId, scheduleHydration);
            return;
          }
          if (table === "miles_ledger") {
            const sourceKind: string | undefined = payload?.new?.source_kind ?? payload?.old?.source_kind;
            if (sourceKind === "hydration_goal") {
              handle("miles", tenantId, journeyId, rowId, scheduleHydration);
              return;
            }
            scheduleGeneric();
            return;
          }
          if (table === "client_mission_completions") {
            const sourceKind: string | undefined = payload?.new?.source_kind ?? payload?.old?.source_kind;
            if (sourceKind === "hydration_goal") {
              handle("completion", tenantId, journeyId, rowId, scheduleHydration);
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
      // Isolamento: limpa qualquer estado indexado por este clientId.
      clearClientState(clientId);
    };
  }, [clientId, qc]);
}
