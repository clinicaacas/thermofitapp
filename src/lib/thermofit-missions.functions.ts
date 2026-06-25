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

// Chaves OFICIAIS de mission_kind — devem casar com public.mission_settings.
type MissionKind =
  | "daily_checkin"
  | "daily_meal"
  | "daily_workout"
  | "hydration_goal"
  | "video_complete"
  | "post_video_task"
  | "workout_photo"
  | "weekly_photo"
  | "streak_7"
  | "streak_14"
  | "streak_21"
  | "program_complete";

// Mapeamento de aliases legados → chave canônica.
const KIND_ALIAS: Record<string, MissionKind> = {
  checkin: "daily_checkin",
  meal: "daily_meal",
  workout: "daily_workout",
  video_task: "post_video_task",
  daily_checkin: "daily_checkin",
  daily_meal: "daily_meal",
  daily_workout: "daily_workout",
  hydration_goal: "hydration_goal",
  video_complete: "video_complete",
  post_video_task: "post_video_task",
  workout_photo: "workout_photo",
  weekly_photo: "weekly_photo",
};
function canon(kind: string): MissionKind {
  const k = KIND_ALIAS[kind];
  if (!k) throw new Error(`Mission kind desconhecido: ${kind}`);
  return k;
}

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
  rawKind: string,
  ref: string,
  idempotencyKey: string,
  reason = "",
  metadata: Record<string, unknown> = {},
) {
  const kind = canon(rawKind);
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

export const getJourneyProgress = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: progress, error } = await admin.rpc("get_journey_progress", {
      _client_id: data.clientId,
    });
    if (error) throw error;
    return (progress as any) ?? { journeyId: null, milesTotal: 0, streakDays: 0, seals: [], milestones: [] };
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

// =====================================================================
// Rotina Diária — Check-in, Alimentação, Treino, Foto do Treino
// Persistência em client_daily_responses (UNIQUE client_id+response_date)
// permite editar a resposta no mesmo dia. Milhas ficam idempotentes pelo
// miles_ledger (idempotency_key = "<kind>:<YYYY-MM-DD>").
// =====================================================================

export const getDailyRoutine = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const day = todayKey();
    const { data: row } = await admin
      .from("client_daily_responses")
      .select(
        "checkin_done, meal_choice, workout_choice, workout_photo_path, workout_photo_note",
      )
      .eq("client_id", data.clientId)
      .eq("response_date", day)
      .maybeSingle();
    return {
      date: day,
      checkinDone: !!row?.checkin_done,
      mealChoice: (row?.meal_choice as string | null) ?? null,
      workoutChoice: (row?.workout_choice as string | null) ?? null,
      workoutPhotoPath: (row?.workout_photo_path as string | null) ?? null,
      workoutPhotoNote: (row?.workout_photo_note as string | null) ?? null,
    };
  });

async function upsertDaily(
  clientId: string,
  patch: Record<string, unknown>,
) {
  const client = await loadClient(clientId);
  const admin = await getAdmin();
  const day = todayKey();
  const journeyId = (client as any).active_journey_id as string;
  // Garantir row do dia, depois aplicar patch.
  await admin
    .from("client_daily_responses")
    .upsert(
      { tenant_id: client.tenant_id, client_id: clientId, journey_id: journeyId, response_date: day },
      { onConflict: "client_id,journey_id,response_date" },
    );
  const { error } = await admin
    .from("client_daily_responses")
    .update(patch as any)
    .eq("client_id", clientId)
    .eq("journey_id", journeyId)
    .eq("response_date", day);
  if (error) throw error;
  return { client, day };
}

export const submitCheckin = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    await upsertDaily(data.clientId, {
      checkin_done: true,
      checkin_at: new Date().toISOString(),
    });
    const key = `checkin:${todayKey()}`;
    const res = await award(data.clientId, "checkin", todayKey(), key, "Check-in diário");
    return { ok: true, ...res };
  });

export const submitMeal = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        clientId: z.string().uuid(),
        choice: z.enum(["otima", "ok", "dificil"]),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    await upsertDaily(data.clientId, {
      meal_choice: data.choice,
      meal_at: new Date().toISOString(),
    });
    const key = `meal:${todayKey()}`;
    const res = await award(data.clientId, "meal", todayKey(), key, "Alimentação registrada", {
      choice: data.choice,
    });
    return { ok: true, ...res };
  });

export const submitWorkout = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        clientId: z.string().uuid(),
        choice: z.enum(["musc_cardio", "cardio", "descanso"]),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    await upsertDaily(data.clientId, {
      workout_choice: data.choice,
      workout_at: new Date().toISOString(),
    });
    if (data.choice === "descanso") {
      // Sem pontuação e sem penalização
      return { ok: true, awarded: false, miles: 0 };
    }
    const key = `workout:${todayKey()}`;
    const res = await award(data.clientId, "workout", todayKey(), key, "Treino realizado", {
      choice: data.choice,
    });
    return { ok: true, ...res };
  });

export const submitWorkoutPhoto = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        clientId: z.string().uuid(),
        contentBase64: z.string().min(20),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        note: z.string().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const day = todayKey();

    // Exige que o treino do dia tenha sido marcado como realizado
    const { data: row } = await admin
      .from("client_daily_responses")
      .select("workout_choice")
      .eq("client_id", client.id)
      .eq("response_date", day)
      .maybeSingle();
    const wc = row?.workout_choice as string | null;
    if (wc !== "musc_cardio" && wc !== "cardio") {
      throw new Error("Marque o treino realizado antes de enviar a foto.");
    }

    const ext = data.mimeType === "image/png" ? "png" : data.mimeType === "image/webp" ? "webp" : "jpg";
    const path = `workout/${client.id}/${day}.${ext}`;
    const bytes = Buffer.from(data.contentBase64, "base64");
    const { error: upErr } = await admin.storage
      .from("client-photos")
      .upload(path, bytes, { contentType: data.mimeType, upsert: true });
    if (upErr) throw upErr;

    await upsertDaily(client.id, {
      workout_photo_path: path,
      workout_photo_note: data.note ?? null,
      workout_photo_at: new Date().toISOString(),
    });

    const key = `workout_photo:${day}`;
    const res = await award(
      client.id,
      "workout_photo",
      day,
      key,
      "Foto do treino (bônus)",
      { path },
    );
    return { ok: true, path, ...res };
  });

// =====================================================================
// Tarefa pós-vídeo — desbloqueada após pelo menos 1 vídeo concluído no dia.
// 1x por dia, +10 Milhas, idempotente por (cliente, jornada, dia).
// =====================================================================
export const getPostVideoTaskState = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const day = todayKey();
    const { data: client } = await admin
      .from("clients").select("active_journey_id").eq("id", data.clientId).maybeSingle();
    const journeyId = (client as any)?.active_journey_id ?? null;
    if (!journeyId) return { unlocked: false, completed: false, response: null, day };
    const { count: videosDone } = await admin
      .from("miles_ledger")
      .select("id", { count: "exact", head: true })
      .eq("client_id", data.clientId).eq("journey_id", journeyId)
      .eq("source_kind", "video_complete").eq("occurred_on", day);
    const { data: row } = await admin
      .from("miles_ledger").select("metadata, occurred_on")
      .eq("client_id", data.clientId).eq("journey_id", journeyId)
      .eq("source_kind", "post_video_task").eq("occurred_on", day)
      .maybeSingle();
    return {
      day,
      unlocked: (videosDone ?? 0) > 0,
      completed: !!row,
      response: (row?.metadata as any)?.response ?? null,
    };
  });

export const submitPostVideoTask = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({
    clientId: z.string().uuid(),
    videoId: z.string().uuid().optional(),
    response: z.string().trim().min(2).max(2000),
  }).parse(i))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const day = todayKey();
    const { data: client } = await admin
      .from("clients").select("id, tenant_id, active_journey_id")
      .eq("id", data.clientId).maybeSingle();
    if (!client) throw new Error("Cliente não encontrada.");
    const journeyId = (client as any).active_journey_id;
    if (!journeyId) throw new Error("Jornada ativa não definida.");
    // Desbloqueio: exige >=1 video_complete hoje
    const { count: videosDone } = await admin
      .from("miles_ledger")
      .select("id", { count: "exact", head: true })
      .eq("client_id", client.id).eq("journey_id", journeyId)
      .eq("source_kind", "video_complete").eq("occurred_on", day);
    if (!videosDone || videosDone <= 0) {
      throw new Error("Conclua um vídeo antes de responder a tarefa do dia.");
    }
    const key = `post_video_task:${day}`;
    const res = await award(
      client.id, "post_video_task", day, key, "Tarefa pós-vídeo",
      { response: data.response, videoId: data.videoId ?? null },
    );
    return { ok: true, day, ...res };
  });

// =====================================================================
// Foto de Evolução semanal — 1x por semana ISO, +15 Milhas.
// Upload privado em client-photos/weekly/<clientId>/<isoWeek>.<ext>.
// Validação MIME (header), tamanho (<=8MB), ownership e jornada ativa.
// =====================================================================
function detectImageMime(bytes: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.slice(0, 4).toString("ascii") === "RIFF" && bytes.slice(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export const getWeeklyPhotoState = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const week = isoWeekKey();
    const { data: client } = await admin
      .from("clients").select("active_journey_id").eq("id", data.clientId).maybeSingle();
    const journeyId = (client as any)?.active_journey_id ?? null;
    if (!journeyId) return { week, completed: false, path: null };
    const { data: row } = await admin
      .from("miles_ledger").select("metadata")
      .eq("client_id", data.clientId).eq("journey_id", journeyId)
      .eq("source_kind", "weekly_photo")
      .eq("idempotency_key", `weekly_photo:${week}`)
      .maybeSingle();
    return { week, completed: !!row, path: (row?.metadata as any)?.path ?? null };
  });

export const submitWeeklyPhoto = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({
    clientId: z.string().uuid(),
    contentBase64: z.string().min(20),
    mimeHint: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
  }).parse(i))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: client } = await admin
      .from("clients").select("id, tenant_id, active_journey_id")
      .eq("id", data.clientId).maybeSingle();
    if (!client) throw new Error("Cliente não encontrada.");
    const journeyId = (client as any).active_journey_id;
    if (!journeyId) throw new Error("Jornada ativa não definida.");
    const bytes = Buffer.from(data.contentBase64, "base64");
    if (bytes.length === 0) throw new Error("Arquivo vazio.");
    if (bytes.length > 8 * 1024 * 1024) throw new Error("Arquivo maior que 8MB.");
    const realMime = detectImageMime(bytes);
    if (!realMime) throw new Error("Formato de imagem inválido (use JPG, PNG ou WEBP).");
    const week = isoWeekKey();
    const ext = realMime === "image/png" ? "png" : realMime === "image/webp" ? "webp" : "jpg";
    const path = `weekly/${client.id}/${week}.${ext}`;
    const { error: upErr } = await admin.storage
      .from("client-photos")
      .upload(path, bytes, { contentType: realMime, upsert: true });
    if (upErr) throw upErr;
    const key = `weekly_photo:${week}`;
    const res = await award(client.id, "weekly_photo", week, key, "Foto de evolução semanal", { path, week });
    return { ok: true, path, week, ...res };
  });
