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
import { getClientJourneyDay } from "./journey";

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
    .select("id, tenant_id, active_journey_id, start_date, hydration_goal_ml")
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

async function ensureMissionCompletion(
  admin: any,
  mission: any,
  miles: number,
  sourceKind: string,
  sourceRef: string,
  idempotencyKey: string,
  completedAt?: string | null,
) {
  if (!mission?.id || !mission?.journey_id) return;
  const payload: any = {
    tenant_id: mission.tenant_id,
    client_id: mission.client_id,
    mission_id: mission.id,
    journey_id: mission.journey_id,
    miles_awarded: miles,
    source_kind: sourceKind,
    source_ref: sourceRef,
    idempotency_key: idempotencyKey,
  };
  if (completedAt) payload.completed_at = completedAt;
  const { error } = await admin
    .from("client_mission_completions")
    .upsert(payload, { onConflict: "mission_id,client_id" });
  if (error) throw error;
}

async function syncHydrationCompletion(admin: any, client: any, day: string) {
  const journeyId = client.active_journey_id as string | null;
  if (!journeyId) return null;
  const goal = Number(client.hydration_goal_ml ?? 2000);
  const { data: logs, error: logErr } = await admin
    .from("client_hydration_logs")
    .select("ml")
    .eq("client_id", client.id)
    .eq("log_date", day);
  if (logErr) throw logErr;
  const total = (logs ?? []).reduce((s: number, r: any) => s + Number(r.ml ?? 0), 0);
  if (total < goal) return null;

  await admin.rpc("ensure_daily_missions", {
    _client_id: client.id,
    _journey_id: journeyId,
    _day: day,
  });

  const miles = await getMilesFor(client.tenant_id, "hydration_goal");
  let ledger: any = null;
  if (miles > 0) {
    const { data: awardData, error: awardErr } = await admin.rpc("award_miles", {
      _client_id: client.id,
      _source_kind: "hydration_goal",
      _source_ref: day,
      _miles: miles,
      _idempotency_key: `hydration_goal:${day}`,
      _reason: "Meta de hidratação atingida",
      _metadata: { total, goal, syncedBy: "summary_sync" } as any,
      _journey_id: journeyId,
    });
    if (awardErr) throw awardErr;
    ledger = awardData;
  } else {
    ledger = { miles: 0, awarded_at: new Date().toISOString() };
  }

  const { data: mission, error: mErr } = await admin
    .from("client_missions")
    .select("id, tenant_id, client_id, journey_id")
    .eq("client_id", client.id)
    .eq("journey_id", journeyId)
    .eq("mission_type", "hydration_goal")
    .eq("due_date", day)
    .maybeSingle();
  if (mErr) throw mErr;
  if (mission) {
    await ensureMissionCompletion(
      admin,
      mission,
      Number(ledger?.miles ?? miles ?? 0),
      "hydration_goal",
      day,
      `hydration_goal:${day}`,
      ledger?.awarded_at ?? new Date().toISOString(),
    );
  }
  return { ledger, total, goal };
}

async function syncWeeklyPhotoMission(admin: any, clientId: string) {
  const { client, journeyId, week } = await resolveJourneyWeek(clientId);
  const day = todayKey();
  const miles = await getMilesFor(client.tenant_id, "weekly_photo");
  const title = `Foto de evolução — Semana ${week}`;

  let mission: any = null;
  const { data: existing, error: exErr } = await admin
    .from("client_missions")
    .select("id, tenant_id, client_id, journey_id")
    .eq("client_id", client.id)
    .eq("journey_id", journeyId)
    .eq("mission_type", "weekly_photo")
    .eq("week_number", week)
    .maybeSingle();
  if (exErr) throw exErr;
  if (existing) {
    const { data: updated, error: upErr } = await admin
      .from("client_missions")
      .update({ title, miles, due_date: day, active: true })
      .eq("id", existing.id)
      .select("id, tenant_id, client_id, journey_id")
      .single();
    if (upErr) throw upErr;
    mission = updated;
  } else {
    const { data: created, error: insErr } = await admin
      .from("client_missions")
      .insert({
        tenant_id: client.tenant_id,
        client_id: client.id,
        journey_id: journeyId,
        title,
        description: "Registre sua foto desta semana para acompanhar sua evolução.",
        miles,
        due_date: day,
        active: true,
        mission_type: "weekly_photo",
        week_number: week,
      })
      .select("id, tenant_id, client_id, journey_id")
      .single();
    if (insErr) throw insErr;
    mission = created;
  }

  const { data: firstPhoto, error: photoErr } = await admin
    .from("client_progress_photos")
    .select("id, taken_at, storage_key, notes")
    .eq("client_id", client.id)
    .eq("journey_id", journeyId)
    .eq("week", week)
    .eq("source", "client_upload")
    .order("taken_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (photoErr) throw photoErr;
  if (!firstPhoto) return { week, completed: false, missionId: mission?.id ?? null, firstPhoto: null, ledger: null };

  const idempotencyKey = `weekly_photo:${journeyId}:w${week}`;
  let ledger: any = null;
  if (miles > 0) {
    const occurredOn = String(firstPhoto.taken_at ?? day).slice(0, 10);
    const { data: inserted, error: ledgerErr } = await admin
      .from("miles_ledger")
      .insert({
        tenant_id: client.tenant_id,
        client_id: client.id,
        journey_id: journeyId,
        source_kind: "weekly_photo",
        source_ref: firstPhoto.id,
        miles,
        reason: "Foto de evolução semanal",
        idempotency_key: idempotencyKey,
        occurred_on: occurredOn,
        metadata: { week, photoId: firstPhoto.id, syncedBy: "weekly_photo_sync" },
      })
      .select("id, miles, awarded_at, occurred_on")
      .maybeSingle();
    if (ledgerErr && ledgerErr.code !== "23505") throw ledgerErr;
    ledger = inserted;
    if (!ledger) {
      const { data: existingLedger, error: existingLedgerErr } = await admin
        .from("miles_ledger")
        .select("id, miles, awarded_at, occurred_on")
        .eq("client_id", client.id)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existingLedgerErr) throw existingLedgerErr;
      ledger = existingLedger;
    }
  } else {
    ledger = { miles: 0, awarded_at: firstPhoto.taken_at ?? new Date().toISOString() };
  }
  await ensureMissionCompletion(
    admin,
    mission,
    Number(ledger?.miles ?? miles ?? 0),
    "weekly_photo",
    firstPhoto.id,
    idempotencyKey,
    ledger?.awarded_at ?? firstPhoto.taken_at ?? new Date().toISOString(),
  );
  return { week, completed: true, missionId: mission?.id ?? null, firstPhoto, ledger };
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
    _journey_id: (client as any).active_journey_id ?? null,
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
    const day = todayKey();
    const client = await loadClient(data.clientId);
    const journeyId = (client as any).active_journey_id as string | null;
    if (!journeyId) {
      return { date: day, journeyId: null, total: 0, completed: 0, pending: 0, blocked: 0, milesToday: 0, milesTotal: 0 };
    }

    // READ-ONLY: nenhuma escrita (sem ensure_daily_missions, sem ensure_video_mission,
    // sem sync de hidratação/foto, sem award_miles). A criação estrutural de missões
    // ocorre apenas em fluxos de escrita explícitos:
    //  - generate_journey_missions / ensureClientJourney → ao ativar a jornada
    //  - saveVideoProgress → cria missão de vídeo no primeiro progresso
    //  - addHydration / saveDailyResponse → criam missões diárias no primeiro evento
    //  - upload de foto → cria/conclui weekly_photo
    // Abrir a tela apenas lê os dados existentes.

    const [{ data: missions, error: mErr }, { data: completions, error: cErr }, { data: dayMiles }, { data: allMiles }, { data: videoDone }, { data: routine }] = await Promise.all([
      admin
        .from("client_missions")
        .select("id, mission_type, linked_video_id, task_ref, due_date, active")
        .eq("client_id", client.id)
        .eq("journey_id", journeyId)
        .eq("due_date", day)
        .eq("active", true),
      admin
        .from("client_mission_completions")
        .select("mission_id")
        .eq("client_id", client.id)
        .eq("journey_id", journeyId),
      admin.from("miles_ledger").select("miles").eq("client_id", client.id).eq("journey_id", journeyId).eq("occurred_on", day),
      admin.from("miles_ledger").select("miles").eq("client_id", client.id).eq("journey_id", journeyId),
      admin
        .from("client_video_progress")
        .select("video_id")
        .eq("client_id", client.id)
        .eq("journey_id", journeyId)
        .eq("is_completed", true),
      admin
        .from("client_daily_responses")
        .select("workout_choice")
        .eq("client_id", client.id)
        .eq("journey_id", journeyId)
        .eq("response_date", day)
        .maybeSingle(),
    ]);
    if (mErr) throw mErr;
    if (cErr) throw cErr;

    const completedSet = new Set((completions ?? []).map((c: any) => c.mission_id));
    const completedVideos = new Set((videoDone ?? []).map((v: any) => v.video_id));
    const workoutChoice = (routine as any)?.workout_choice ?? null;
    let total = 0;
    let completed = 0;
    let blocked = 0;
    for (const m of missions ?? []) {
      const genericPostVideoTask =
        m.mission_type === "post_video_task" &&
        !m.linked_video_id &&
        (!m.task_ref || m.task_ref === "daily") &&
        !completedSet.has(m.id);
      if (genericPostVideoTask) {
        blocked += 1;
        continue;
      }
      const videoTaskBlocked =
        m.mission_type === "post_video_task" &&
        m.linked_video_id &&
        !completedVideos.has(m.linked_video_id) &&
        !completedSet.has(m.id);
      const workoutPhotoBlocked =
        m.mission_type === "workout_photo" &&
        workoutChoice !== "musc_cardio" &&
        workoutChoice !== "cardio" &&
        !completedSet.has(m.id);
      if (videoTaskBlocked || workoutPhotoBlocked) {
        blocked += 1;
        continue;
      }
      total += 1;
      if (completedSet.has(m.id)) completed += 1;
    }
    const milesToday = (dayMiles ?? []).reduce((s: number, r: any) => s + Number(r.miles ?? 0), 0);
    const milesTotal = (allMiles ?? []).reduce((s: number, r: any) => s + Number(r.miles ?? 0), 0);
    return {
      date: day,
      journeyId,
      total,
      completed,
      pending: Math.max(total - completed, 0),
      blocked,
      milesToday,
      milesTotal,
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

// Marca a missão estrutural diária como concluída em client_mission_completions,
// usando a mesma idempotency_key do ledger para manter a auditoria casada.
async function completeDailyStructuralMission(
  clientId: string,
  missionType: "daily_checkin" | "daily_meal" | "daily_workout" | "workout_photo",
  sourceKind: string,
  sourceRef: string,
  idempotencyKey: string,
  milesAwarded: number,
  completedAt?: string,
) {
  const client = await loadClient(clientId);
  const journeyId = (client as any).active_journey_id as string | null;
  if (!journeyId) return;
  const admin = await getAdmin();
  const day = todayKey();
  await admin.rpc("ensure_daily_missions", {
    _client_id: clientId,
    _journey_id: journeyId,
    _day: day,
  });
  const { data: mission, error } = await admin
    .from("client_missions")
    .select("id, tenant_id, client_id, journey_id")
    .eq("client_id", clientId)
    .eq("journey_id", journeyId)
    .eq("mission_type", missionType)
    .eq("due_date", day)
    .maybeSingle();
  if (error) throw error;
  if (!mission) return;
  await ensureMissionCompletion(
    admin,
    mission,
    milesAwarded,
    sourceKind,
    sourceRef,
    idempotencyKey,
    completedAt ?? new Date().toISOString(),
  );
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
    await completeDailyStructuralMission(
      data.clientId,
      "daily_checkin",
      "daily_checkin",
      todayKey(),
      key,
      Number((res as any)?.miles ?? 0),
    );
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
    await completeDailyStructuralMission(
      data.clientId,
      "daily_meal",
      "daily_meal",
      todayKey(),
      key,
      Number((res as any)?.miles ?? 0),
    );
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
    await completeDailyStructuralMission(
      data.clientId,
      "daily_workout",
      "daily_workout",
      todayKey(),
      key,
      Number((res as any)?.miles ?? 0),
    );
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
    await completeDailyStructuralMission(
      client.id,
      "workout_photo",
      "workout_photo",
      day,
      key,
      Number((res as any)?.miles ?? 0),
    );
    return { ok: true, path, ...res };
  });

// =====================================================================
// Tarefa pós-vídeo — resposta em client_task_responses (separado do ledger).
// Regras de desbloqueio:
//   - vinculada a um vídeo (videoId): exige video_complete daquele vídeo;
//   - diária (sem videoId): exige >=1 video_complete no dia.
// Idempotência por missão: post_video_task:<journeyId>:<missionId>.
// =====================================================================

async function resolveActiveJourney(clientId: string) {
  const admin = await getAdmin();
  const { data: client } = await admin
    .from("clients").select("id, tenant_id, active_journey_id")
    .eq("id", clientId).maybeSingle();
  if (!client) throw new Error("Cliente não encontrada.");
  const journeyId = (client as any).active_journey_id as string | null;
  if (!journeyId) throw new Error("Jornada ativa não definida.");
  return { client: client as { id: string; tenant_id: string }, journeyId };
}

async function resolvePostVideoTaskMission(
  clientId: string,
  journeyId: string,
  day: string,
  videoId: string | null,
  taskRef: string,
): Promise<string> {
  const admin = await getAdmin();
  const { data, error } = await admin.rpc("ensure_post_video_task", {
    _client_id: clientId,
    _journey_id: journeyId,
    _day: day,
    _video_id: videoId as any,
    _task_ref: taskRef,
  } as any);
  if (error) throw error;
  const missionId = (data as any) as string | null;
  if (!missionId) throw new Error("Não foi possível resolver a missão de tarefa pós-vídeo.");
  return missionId;
}

async function isVideoCompleted(
  clientId: string, journeyId: string, day: string, videoId: string,
) {
  const admin = await getAdmin();
  const { count } = await admin
    .from("miles_ledger").select("id", { count: "exact", head: true })
    .eq("client_id", clientId).eq("journey_id", journeyId)
    .eq("source_kind", "video_complete").eq("occurred_on", day)
    .eq("source_ref", videoId);
  return (count ?? 0) > 0;
}

async function allRequiredVideosCompleted(clientId: string, journeyId: string, day: string) {
  const admin = await getAdmin();
  // Vídeos obrigatórios do dia = missões video_complete ativas com due_date = day.
  const { data: required, error } = await admin
    .from("client_missions")
    .select("linked_video_id")
    .eq("client_id", clientId).eq("journey_id", journeyId)
    .eq("mission_type", "video_complete").eq("due_date", day).eq("active", true);
  if (error) throw error;
  const ids = (required ?? [])
    .map((r: any) => r.linked_video_id as string | null)
    .filter((v): v is string => !!v);
  if (ids.length === 0) return false; // nenhum vídeo obrigatório => mantém bloqueado
  const { data: done } = await admin
    .from("miles_ledger").select("source_ref")
    .eq("client_id", clientId).eq("journey_id", journeyId)
    .eq("source_kind", "video_complete").eq("occurred_on", day)
    .in("source_ref", ids);
  const doneSet = new Set((done ?? []).map((r: any) => r.source_ref as string));
  return ids.every((id) => doneSet.has(id));
}

export const getPostVideoTaskState = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({
    clientId: z.string().uuid(),
    videoId: z.string().uuid().optional(),
    taskRef: z.string().trim().min(1).max(80).optional(),
  }).parse(i))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const day = todayKey();
    const { data: client } = await admin
      .from("clients").select("active_journey_id").eq("id", data.clientId).maybeSingle();
    const journeyId = (client as any)?.active_journey_id ?? null;
    if (!journeyId) {
      return { day, unlocked: false, completed: false, response: null, missionId: null, videoId: data.videoId ?? null };
    }
    const videoId = data.videoId ?? null;
    const taskRef = data.taskRef ?? (videoId ? "default" : "daily");
    if (!videoId && !data.taskRef) {
      return { day, hidden: true, unlocked: false, completed: false, response: null, missionId: null, videoId: null };
    }
    const missionId = await resolvePostVideoTaskMission(
      data.clientId, journeyId, day, videoId, taskRef,
    );
    const unlocked = videoId
      ? await isVideoCompleted(data.clientId, journeyId, day, videoId)
      : await allRequiredVideosCompleted(data.clientId, journeyId, day);
    const { data: row } = await admin
      .from("client_task_responses")
      .select("response, completed_at, linked_video_id, task_ref")
      .eq("client_id", data.clientId).eq("mission_id", missionId)
      .maybeSingle();
    return {
      day,
      missionId,
      videoId,
      unlocked,
      completed: !!row,
      response: (row?.response as string | null) ?? null,
      completedAt: (row?.completed_at as string | null) ?? null,
    };
  });

export const submitPostVideoTask = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({
    clientId: z.string().uuid(),
    videoId: z.string().uuid().optional(),
    taskRef: z.string().trim().min(1).max(80).optional(),
    response: z.string().trim().min(2).max(2000),
  }).parse(i))
  .handler(async ({ data }) => {
    const day = todayKey();
    const { client, journeyId } = await resolveActiveJourney(data.clientId);
    const videoId = data.videoId ?? null;
    const taskRef = data.taskRef ?? (videoId ? "default" : "daily");

    // Regra de desbloqueio server-side
    const unlocked = videoId
      ? await isVideoCompleted(client.id, journeyId, day, videoId)
      : await allRequiredVideosCompleted(client.id, journeyId, day);
    if (!unlocked) {
      throw new Error(
        videoId
          ? "Conclua este vídeo antes de responder a tarefa."
          : "Conclua todos os vídeos obrigatórios do dia antes de responder.",
      );
    }

    const missionId = await resolvePostVideoTaskMission(
      client.id, journeyId, day, videoId, taskRef,
    );

    // Persistir resposta (fonte primária)
    const admin = await getAdmin();
    const { error: upErr } = await admin
      .from("client_task_responses")
      .upsert({
        tenant_id: client.tenant_id,
        client_id: client.id,
        journey_id: journeyId,
        mission_id: missionId,
        linked_video_id: videoId,
        task_ref: taskRef,
        due_date: day,
        response: data.response,
        completed_at: new Date().toISOString(),
      }, { onConflict: "client_id,mission_id" });
    if (upErr) throw upErr;

    // Conceder Milhas de forma idempotente por missão
    const key = `post_video_task:${journeyId}:${missionId}`;
    const res = await award(
      client.id, "post_video_task", missionId, key, "Tarefa pós-vídeo",
      { missionId, videoId, taskRef, day },
    );
    return { ok: true, day, missionId, videoId, ...res };
  });


// =====================================================================
// Foto de Evolução semanal — 1x por semana da jornada (1..12), +15 Milhas.
// Fonte oficial: public.client_progress_photos + bucket privado client-photos.
// Não criar sistema paralelo de fotos.
// =====================================================================
function detectImageMime(bytes: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.slice(0, 4).toString("ascii") === "RIFF" && bytes.slice(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

function extForMime(mime: "image/jpeg" | "image/png" | "image/webp"): "jpg" | "png" | "webp" {
  return mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
}

async function resolveJourneyWeek(clientId: string) {
  const admin = await getAdmin();
  const { data: client } = await admin
    .from("clients").select("id, tenant_id, active_journey_id")
    .eq("id", clientId).maybeSingle();
  if (!client) throw new Error("Cliente não encontrada.");
  const journeyId = (client as any).active_journey_id as string | null;
  if (!journeyId) throw new Error("Jornada ativa não definida.");
  const { data: journey } = await admin
    .from("client_journeys").select("started_on")
    .eq("id", journeyId).maybeSingle();
  if (!journey?.started_on) throw new Error("Jornada sem data de início.");
  const start = new Date(String(journey.started_on).slice(0, 10) + "T00:00:00Z");
  const today = new Date(todayKey() + "T00:00:00Z");
  const diffDays = Math.floor((today.getTime() - start.getTime()) / 86400000);
  const week = Math.min(12, Math.max(1, Math.floor(diffDays / 7) + 1));
  return { client: client as { id: string; tenant_id: string }, journeyId, week };
}

export const getWeeklyPhotoState = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: client } = await admin
      .from("clients").select("active_journey_id").eq("id", data.clientId).maybeSingle();
    const journeyId = (client as any)?.active_journey_id ?? null;
    if (!journeyId) return { week: null, completed: false, storageKey: null, notes: null };
    const { week } = await resolveJourneyWeek(data.clientId);
    const { data: row } = await admin
      .from("client_progress_photos")
      .select("id, storage_key, notes, taken_at")
      .eq("client_id", data.clientId).eq("journey_id", journeyId).eq("week", week)
      .order("taken_at", { ascending: false }).limit(1).maybeSingle();
    return {
      week,
      completed: !!row,
      storageKey: (row?.storage_key as string | null) ?? null,
      notes: (row?.notes as string | null) ?? null,
    };
  });

export const submitWeeklyPhoto = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({
    clientId: z.string().uuid(),
    contentBase64: z.string().min(20),
    mimeHint: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
    note: z.string().trim().max(500).optional(),
  }).parse(i))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { client, journeyId, week } = await resolveJourneyWeek(data.clientId);

    // LGPD: respeitar consentimento de uso interno de fotos.
    const { data: consent } = await admin
      .from("consents").select("photos_internal")
      .eq("client_id", client.id).maybeSingle();
    if (consent && (consent as any).photos_internal === false) {
      throw new Error("Consentimento de fotos desativado.");
    }

    const bytes = Buffer.from(data.contentBase64, "base64");
    if (bytes.length === 0) throw new Error("Arquivo vazio.");
    if (bytes.length > 8 * 1024 * 1024) throw new Error("Arquivo maior que 8MB.");
    const realMime = detectImageMime(bytes);
    if (!realMime) throw new Error("Formato de imagem inválido (use JPG, PNG ou WEBP).");
    if (data.mimeHint && data.mimeHint !== realMime) {
      throw new Error("Extensão/MIME incoerente com o conteúdo do arquivo.");
    }
    const ext = extForMime(realMime);

    // Chave oficial do bucket: <tenant>/<client>/weekly-<journey>-w<N>-<ts>.<ext>
    const storageKey = `${client.tenant_id}/${client.id}/weekly-${journeyId}-w${week}-${Date.now()}.${ext}`;
    const { error: upErr } = await admin.storage
      .from("client-photos")
      .upload(storageKey, bytes, { contentType: realMime, upsert: false });
    if (upErr) throw upErr;

    const { data: inserted, error: insErr } = await admin
      .from("client_progress_photos")
      .insert({
        tenant_id: client.tenant_id,
        client_id: client.id,
        journey_id: journeyId,
        week,
        storage_key: storageKey,
        notes: data.note ?? null,
        source: "client_upload",
        visible_to_client: true,
      })
      .select("id")
      .single();
    if (insErr) {
      await admin.storage.from("client-photos").remove([storageKey]);
      throw insErr;
    }

    // +15 Milhas uma única vez por semana da jornada.
    const key = `weekly_photo:${journeyId}:w${week}`;
    const res = await award(
      client.id, "weekly_photo", `w${week}`, key, "Foto de evolução semanal",
      { storageKey, journeyId, week, photoId: inserted.id },
    );
    await syncWeeklyPhotoMission(admin, client.id);
    return { ok: true, week, storageKey, photoId: inserted.id, ...res };
  });

