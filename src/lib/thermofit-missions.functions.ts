// Server functions oficiais para o sistema de Missões e Milhas.
// - Valores de milhas vêm SEMPRE de public.mission_settings (nunca confiar no cliente).
// - Idempotência derivada server-side (kind + ref + data/semana).
// - award_miles é SECURITY DEFINER e só pode ser chamada por service_role.
//
// IMPORTANTE: este módulo é importado por componentes do cliente; só os corpos
// dos .handler() são removidos do bundle do navegador. Por isso o
// supabaseAdmin é carregado dentro de cada handler via dynamic import.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type MissionKind =
  | "video_complete"
  | "video_task"
  | "checkin"
  | "hydration_goal"
  | "meal"
  | "workout"
  | "workout_photo"
  | "weekly_photo"
  | "streak_7"
  | "streak_14"
  | "streak_21"
  | "program_complete";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function loadClient(clientId: string) {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("clients")
    .select("id, tenant_id")
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Cliente não encontrada.");
  return data;
}

async function getMilesFor(tenantId: string, kind: MissionKind): Promise<number> {
  const admin = await getAdmin();
  const { data } = await admin
    .from("mission_settings")
    .select("default_miles, active")
    .eq("tenant_id", tenantId)
    .eq("mission_kind", kind)
    .maybeSingle();
  if (!data || data.active === false) return 0;
  return Number(data.default_miles ?? 0);
}

function todayKey(): string {
  // YYYY-MM-DD em America/Sao_Paulo
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function isoWeekKey(): string {
  // Semana ISO em America/Sao_Paulo (ex.: 2026-W26)
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = fmt.format(new Date()).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Algoritmo ISO 8601
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function award(
  clientId: string,
  kind: MissionKind,
  ref: string,
  idempotencyKey: string,
  reason = "",
  metadata: Record<string, unknown> = {},
) {
  const client = await loadClient(clientId);
  const miles = await getMilesFor(client.tenant_id, kind);
  if (miles <= 0) {
    return { awarded: false, miles: 0, reason: "kind inactive or zero miles" };
  }
  const admin = await getAdmin();
  const { data, error } = await admin.rpc("award_miles", {
    _client_id: clientId,
    _source_kind: kind,
    _source_ref: ref,
    _miles: miles,
    _idempotency_key: idempotencyKey,
    _reason: reason,
    _metadata: metadata as any,
  });
  if (error) throw error;
  return { awarded: true, miles, ledger: data };
}

// =====================================================================
// Resumo unificado de Missões de Hoje (fonte única de verdade)
// =====================================================================
export const getTodayMissionSummary = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: summary, error } = await admin.rpc("get_today_mission_summary", {
      _client_id: data.clientId,
    });
    if (error) throw error;
    return (summary as any) ?? {
      date: todayKey(),
      total: 0,
      completed: 0,
      pending: 0,
      milesToday: 0,
      milesTotal: 0,
    };
  });

// =====================================================================
// Conclusões de missão (cada uma idempotente por chave determinística)
// =====================================================================

export const completeVideoMission = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({ clientId: z.string().uuid(), videoId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data }) => {
    const key = `video_complete:${data.videoId}`;
    return award(data.clientId, "video_complete", data.videoId, key, "Vídeo concluído 90%+");
  });

export const completeVideoTask = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({ clientId: z.string().uuid(), videoId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data }) => {
    const key = `video_task:${data.videoId}`;
    return award(data.clientId, "video_task", data.videoId, key, "Tarefa pós-vídeo");
  });

export const completeCheckin = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const key = `checkin:${todayKey()}`;
    return award(data.clientId, "checkin", todayKey(), key, "Check-in diário");
  });

export const completeHydrationGoal = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const key = `hydration_goal:${todayKey()}`;
    return award(data.clientId, "hydration_goal", todayKey(), key, "Meta de hidratação");
  });

export const completeMeal = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const key = `meal:${todayKey()}`;
    return award(data.clientId, "meal", todayKey(), key, "Alimentação registrada");
  });

export const completeWorkout = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const key = `workout:${todayKey()}`;
    return award(data.clientId, "workout", todayKey(), key, "Treino realizado");
  });

export const completeWorkoutPhoto = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({ clientId: z.string().uuid(), photoId: z.string().uuid().optional() }).parse(i),
  )
  .handler(async ({ data }) => {
    // Bônus de foto do treino: 1x por dia
    const key = `workout_photo:${todayKey()}`;
    return award(
      data.clientId,
      "workout_photo",
      data.photoId ?? todayKey(),
      key,
      "Foto do treino (bônus)",
    );
  });

export const completeWeeklyPhoto = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({ clientId: z.string().uuid(), photoId: z.string().uuid().optional() }).parse(i),
  )
  .handler(async ({ data }) => {
    // Foto semanal de evolução: 1x por semana ISO
    const week = isoWeekKey();
    const key = `weekly_photo:${week}`;
    return award(
      data.clientId,
      "weekly_photo",
      data.photoId ?? week,
      key,
      "Foto semanal de evolução",
    );
  });
