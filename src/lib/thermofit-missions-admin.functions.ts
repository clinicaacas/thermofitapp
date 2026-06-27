// Central Administrativa de Missões — funções consolidadas.
// Reutiliza tabelas existentes; não cria estruturas paralelas.
// Acesso restrito a dono/admin/super_admin do tenant.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function callerTenant(context: Ctx) {
  const { data, error } = await context.supabase
    .from("profiles")
    .select("tenant_id, profile, status")
    .eq("id", context.userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "ativo") throw new Error("Usuário sem acesso ativo.");
  const role = data.profile as string;
  return { tenantId: data.tenant_id as string, role };
}

function isManager(role: string) {
  return role === "super_admin" || role === "dono" || role === "admin";
}

function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// ============================================================
// Tipos consolidados
// ============================================================
export type MissionRow = {
  refId: string;          // chave estável "kind:client:date:sub"
  clientId: string;
  clientName: string;
  journeyId: string | null;
  journeyDay: number | null;
  week: number | null;
  type: string;           // canonical kind
  typeLabel: string;
  title: string;
  status: "completed" | "pending" | "blocked" | "late";
  date: string;           // YYYY-MM-DD
  miles: number;          // milhas efetivamente creditadas (miles_ledger)
  predictedMiles: number; // milhas previstas (mission_settings)
  inconsistent: boolean;  // concluída sem crédito correspondente no ledger
  origin: "auto" | "manual" | "derived";
  updatedAt: string | null;
  missionId: string | null;
  totalMiles: number;
  details: any | null;
};


const TYPE_LABEL: Record<string, string> = {
  daily_checkin: "Check-in",
  daily_meal: "Alimentação",
  daily_workout: "Treino",
  workout_photo: "Foto do treino",
  hydration_goal: "Hidratação",
  video_complete: "Vídeo",
  post_video_task: "Tarefa pós-vídeo",
  weekly_photo: "Foto de evolução",
  manual: "Missão manual",
};

function dayDiff(a: string, b: string): number {
  const da = Date.parse(a + "T00:00:00Z");
  const db = Date.parse(b + "T00:00:00Z");
  return Math.floor((da - db) / 86400000);
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function signedClientPhotoUrl(storageKey: string | null | undefined) {
  if (!storageKey) return null;
  try {
    const admin = await getAdmin();
    const { data } = await admin.storage.from("client-photos").createSignedUrl(storageKey, 3600);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

// ============================================================
// listMissionsCentral
// ============================================================
export const listMissionsCentral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    from?: string; to?: string;
    clientId?: string | null;
    type?: string | null;
    status?: string | null;
  } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { tenantId, role } = await callerTenant(context as Ctx);
    if (!isManager(role) && role !== "equipe") throw new Error("Sem permissão.");
    const today = todayISO();
    const from = data.from ?? today;
    const to = data.to ?? today;

    // Caller já validado como membro do tenant. Usamos o admin client para
    // leitura agregada, evitando que RLS silenciosamente devolva conjuntos
    // vazios em joins/aggregations e gere zeros falsos no painel.
    const sb = await getAdmin();

    // Defaults previstos por tipo de missão (mission_settings)
    const { data: settings } = await sb
      .from("mission_settings")
      .select("mission_kind, default_miles, label")
      .eq("tenant_id", tenantId);
    const predictedByKind = new Map<string, number>();
    for (const s of settings ?? []) {
      predictedByKind.set(s.mission_kind, Number(s.default_miles ?? 0));
    }
    const predictedFor = (kind: string, fallback = 0) =>
      predictedByKind.get(kind) ?? fallback;

    // Clientes do tenant + jornada ativa
    const { data: clientsRaw, error: cErr } = await sb
      .from("clients")
      .select("id, name, tenant_id, active_journey_id, hydration_goal_ml, client_journeys!clients_active_journey_id_fkey(id, started_on, status)")
      .eq("tenant_id", tenantId);
    if (cErr) throw cErr;
    const clients = (clientsRaw ?? []).filter((c: any) => (data.clientId ? c.id === data.clientId : true));
    const journeysByClient = new Map<string, { id: string; startedOn: string } | null>();
    for (const c of clients) {
      const j = c.client_journeys;
      journeysByClient.set(c.id, j ? { id: j.id, startedOn: j.started_on } : null);
    }
    const nameById = new Map<string, string>(clients.map((c: any) => [c.id as string, c.name as string]));
    const hydrationGoalById = new Map<string, number>(
      clients.map((c: any) => [c.id as string, Number(c.hydration_goal_ml ?? 2000)]),
    );
    const clientIds = clients.map((c: any) => c.id);
    if (clientIds.length === 0) return { rows: [] as MissionRow[] };

    const rows: MissionRow[] = [];
    const ledgerByClient = new Map<string, number>();
    const ledgerByKindDay = new Map<string, any>();
    const ledgerByKindRef = new Map<string, any>();
    const { data: ledgerRows } = await sb
      .from("miles_ledger")
      .select("client_id, journey_id, source_kind, source_ref, miles, occurred_on, awarded_at, reason, idempotency_key")
      .in("client_id", clientIds);
    for (const l of ledgerRows ?? []) {
      ledgerByClient.set(l.client_id, (ledgerByClient.get(l.client_id) ?? 0) + Number(l.miles ?? 0));
      if (l.occurred_on) ledgerByKindDay.set(`${l.client_id}:${l.occurred_on}:${l.source_kind}`, l);
      if (l.source_ref) ledgerByKindRef.set(`${l.client_id}:${l.source_kind}:${l.source_ref}`, l);
    }

    function pushRow(r: MissionRow) {
      if (data.type && r.type !== data.type) return;
      rows.push(r);
    }

    function mergeExistingRow(
      predicate: (r: MissionRow) => boolean,
      patch: Partial<MissionRow> & { details?: any },
    ) {
      const existing = rows.find(predicate);
      if (!existing) return false;
      if (patch.status) existing.status = patch.status as MissionRow["status"];
      if (patch.title !== undefined) existing.title = patch.title;
      // Nunca sobrescrever milhas já creditadas com 0. Só atualiza quando o
      // patch traz um valor positivo (ledger encontrado).
      if (patch.miles !== undefined && patch.miles > 0) existing.miles = patch.miles;
      if (patch.predictedMiles !== undefined && patch.predictedMiles > 0) existing.predictedMiles = patch.predictedMiles;
      if (patch.updatedAt !== undefined) existing.updatedAt = patch.updatedAt;
      if (patch.origin !== undefined) existing.origin = patch.origin;
      if (patch.details !== undefined) {
        existing.details = { ...(existing.details ?? {}), ...patch.details };
      }
      // Recalcula inconsistência: concluída sem crédito.
      existing.inconsistent = existing.status === "completed" && (existing.miles ?? 0) <= 0;
      return true;
    }


    function jDay(clientId: string, date: string) {
      const j = journeysByClient.get(clientId);
      if (!j) return { day: null as number | null, week: null as number | null, jid: null as string | null };
      const d = dayDiff(date, j.startedOn) + 1;
      const w = Math.max(1, Math.ceil(d / 7));
      return { day: d, week: w, jid: j.id };
    }

    // 1) client_missions + completions
    const { data: missions } = await sb
      .from("client_missions")
      .select("id, client_id, journey_id, title, miles, due_date, mission_type, week_number, linked_video_id, task_ref, created_by, updated_at, created_at, active")
      .in("client_id", clientIds)
      .gte("due_date", from).lte("due_date", to);
    const missionIds = (missions ?? []).map((m: any) => m.id);
    const completionsByMission = new Map<string, any>();
    const taskResponsesByMission = new Map<string, any>();
    if (missionIds.length > 0) {
      const [{ data: comps }, { data: taskResponses }] = await Promise.all([
        sb
          .from("client_mission_completions")
          .select("mission_id, completed_at, miles_awarded, source_kind, source_ref, idempotency_key")
          .in("mission_id", missionIds),
        sb
          .from("client_task_responses")
          .select("mission_id, response, completed_at, linked_video_id, task_ref")
          .in("mission_id", missionIds),
      ]);
      for (const c of comps ?? []) completionsByMission.set(c.mission_id, c);
      for (const t of taskResponses ?? []) taskResponsesByMission.set(t.mission_id, t);
    }
    for (const m of missions ?? []) {
      const comp = completionsByMission.get(m.id);
      const taskResponse = taskResponsesByMission.get(m.id);
      const kind = m.mission_type ?? "manual";
      if (
        kind === "post_video_task" &&
        !m.linked_video_id &&
        (!m.task_ref || m.task_ref === "daily") &&
        !taskResponse
      ) {
        continue;
      }
      const jinfo = jDay(m.client_id, m.due_date);
      const isPast = m.due_date < today;
      // Prioriza o crédito real no ledger para a missão; cai para completion;
      // por último, 0. Nunca usa m.miles (default) como crédito real.
      const ledgerForMission =
        (m.linked_video_id ? ledgerByKindRef.get(`${m.client_id}:${kind}:${m.linked_video_id}`) : null) ||
        ledgerByKindDay.get(`${m.client_id}:${m.due_date}:${kind}`);
      const actualMiles = Number(ledgerForMission?.miles ?? comp?.miles_awarded ?? 0);
      const predicted = Number(m.miles ?? predictedFor(kind, 0));
      const status: MissionRow["status"] = comp ? "completed" : isPast ? "late" : "pending";
      pushRow({
        refId: `cm:${m.id}`,
        clientId: m.client_id,
        clientName: nameById.get(m.client_id) ?? "—",
        journeyId: m.journey_id,
        journeyDay: jinfo.day,
        week: m.week_number ?? jinfo.week,
        type: kind,
        typeLabel: TYPE_LABEL[kind] ?? kind,
        title: m.title,
        status,
        date: m.due_date,
        miles: actualMiles,
        predictedMiles: predicted,
        inconsistent: status === "completed" && actualMiles <= 0,
        origin: m.created_by ? "manual" : "auto",
        updatedAt: comp?.completed_at ?? m.updated_at ?? m.created_at,
        missionId: m.id,
        totalMiles: ledgerByClient.get(m.client_id) ?? 0,
        details: {
          missionId: m.id,
          linkedVideoId: m.linked_video_id ?? null,
          taskRef: m.task_ref ?? null,
          response: taskResponse?.response ?? null,
          taskCompletedAt: taskResponse?.completed_at ?? null,
          ledger: ledgerForMission ?? null,
          completion: comp ?? null,
        },
      });
    }


    // 2) client_daily_responses → derived rows (check-in, alimentação, treino, foto treino)
    const { data: dailies } = await sb
      .from("client_daily_responses")
      .select("client_id, journey_id, response_date, checkin_done, checkin_at, meal_choice, meal_at, workout_choice, workout_at, workout_photo_path, workout_photo_note, workout_photo_at, updated_at")
      .in("client_id", clientIds)
      .gte("response_date", from).lte("response_date", to);
    for (const d of dailies ?? []) {
      const jinfo = jDay(d.client_id, d.response_date);
      const totalMiles = ledgerByClient.get(d.client_id) ?? 0;
      const base = {
        clientId: d.client_id,
        clientName: nameById.get(d.client_id) ?? "—",
        journeyId: d.journey_id,
        journeyDay: jinfo.day,
        week: jinfo.week,
        date: d.response_date,
        origin: "derived" as const,
        missionId: null,
        totalMiles,
      };
      // Só agrega se não houver linha equivalente vinda de client_missions
      const has = (kind: string) => rows.some((r) => r.clientId === d.client_id && r.date === d.response_date && r.type === kind);
      const checkinLedger = ledgerByKindDay.get(`${d.client_id}:${d.response_date}:daily_checkin`);
      const mealLedger = ledgerByKindDay.get(`${d.client_id}:${d.response_date}:daily_meal`);
      const workoutLedger = ledgerByKindDay.get(`${d.client_id}:${d.response_date}:daily_workout`);
      const workoutPhotoLedger = ledgerByKindDay.get(`${d.client_id}:${d.response_date}:workout_photo`);
      const workoutPhotoUrl = await signedClientPhotoUrl(d.workout_photo_path);

      const mkPatch = (kind: string, ledger: any, completed: boolean, updatedAt: any, extraDetails: any) => {
        const miles = Number(ledger?.miles ?? 0);
        const predicted = predictedFor(kind, 0);
        return {
          status: (completed ? "completed" : "pending") as "completed" | "pending",
          miles,
          predictedMiles: predicted,
          inconsistent: completed && miles <= 0,
          updatedAt,
          details: { ...extraDetails, ledger: ledger ?? null },
        };
      };

      const checkinPatch = mkPatch("daily_checkin", checkinLedger, !!d.checkin_done, d.checkin_at ?? d.updated_at, { checkinDone: !!d.checkin_done, completedAt: d.checkin_at ?? null });
      if (has("daily_checkin")) mergeExistingRow((r) => r.clientId === d.client_id && r.date === d.response_date && r.type === "daily_checkin", checkinPatch);
      else pushRow({ ...base, refId: `dr:${d.client_id}:${d.response_date}:checkin`, type: "daily_checkin", typeLabel: TYPE_LABEL.daily_checkin, title: "Check-in diário", ...checkinPatch });

      const mealPatch = mkPatch("daily_meal", mealLedger, !!d.meal_choice, d.meal_at ?? d.updated_at, { mealChoice: d.meal_choice ?? null, completedAt: d.meal_at ?? null });
      if (has("daily_meal")) mergeExistingRow((r) => r.clientId === d.client_id && r.date === d.response_date && r.type === "daily_meal", mealPatch);
      else pushRow({ ...base, refId: `dr:${d.client_id}:${d.response_date}:meal`, type: "daily_meal", typeLabel: TYPE_LABEL.daily_meal, title: "Alimentação do dia", ...mealPatch });

      const workoutPatch = mkPatch("daily_workout", workoutLedger, !!d.workout_choice, d.workout_at ?? d.updated_at, { workoutChoice: d.workout_choice ?? null, completedAt: d.workout_at ?? null });
      if (has("daily_workout")) mergeExistingRow((r) => r.clientId === d.client_id && r.date === d.response_date && r.type === "daily_workout", workoutPatch);
      else pushRow({ ...base, refId: `dr:${d.client_id}:${d.response_date}:workout`, type: "daily_workout", typeLabel: TYPE_LABEL.daily_workout, title: "Treino do dia", ...workoutPatch });

      const workoutPhotoPatch = mkPatch("workout_photo", workoutPhotoLedger, !!d.workout_photo_path, d.workout_photo_at ?? d.updated_at, {
        workoutChoice: d.workout_choice ?? null,
        photoPath: d.workout_photo_path ?? null,
        note: d.workout_photo_note ?? null,
        photoUrl: workoutPhotoUrl,
        completedAt: d.workout_photo_at ?? null,
      });
      if (has("workout_photo")) mergeExistingRow((r) => r.clientId === d.client_id && r.date === d.response_date && r.type === "workout_photo", workoutPhotoPatch);
      else pushRow({ ...base, refId: `dr:${d.client_id}:${d.response_date}:wphoto`, type: "workout_photo", typeLabel: TYPE_LABEL.workout_photo, title: "Foto do treino", ...workoutPhotoPatch });
    }


    // 3) Hidratação — agrega por (cliente, dia) ≥ 2000ml = completed
    const { data: hydro } = await sb
      .from("client_hydration_logs")
      .select("client_id, log_date, ml")
      .in("client_id", clientIds)
      .gte("log_date", from).lte("log_date", to);
    const hydroAgg = new Map<string, { client_id: string; date: string; ml: number }>();
    for (const h of hydro ?? []) {
      const k = `${h.client_id}:${h.log_date}`;
      const cur = hydroAgg.get(k) ?? { client_id: h.client_id, date: h.log_date, ml: 0 };
      cur.ml += Number(h.ml) || 0;
      hydroAgg.set(k, cur);
    }
    for (const [, agg] of hydroAgg) {
      const jinfo = jDay(agg.client_id, agg.date);
      const hydrationLedger = ledgerByKindDay.get(`${agg.client_id}:${agg.date}:hydration_goal`);
      const goal = hydrationGoalById.get(agg.client_id) ?? 2000;
      const hydrationPatch = {
        title: `Hidratação (${agg.ml} ml)`,
        status: agg.ml >= goal ? "completed" as const : "pending" as const,
        miles: Number(hydrationLedger?.miles ?? 0),
        updatedAt: hydrationLedger?.awarded_at ?? hydrationLedger?.created_at ?? null,
        details: { totalMl: agg.ml, goalMl: goal, completedAt: hydrationLedger?.awarded_at ?? hydrationLedger?.created_at ?? null, ledger: hydrationLedger ?? null },
      };
      const has = mergeExistingRow((r) => r.clientId === agg.client_id && r.date === agg.date && r.type === "hydration_goal", hydrationPatch);
      if (has) continue;
      pushRow({
        refId: `hy:${agg.client_id}:${agg.date}`,
        clientId: agg.client_id,
        clientName: nameById.get(agg.client_id) ?? "—",
        journeyId: jinfo.jid, journeyDay: jinfo.day, week: jinfo.week,
        type: "hydration_goal", typeLabel: TYPE_LABEL.hydration_goal,
        title: hydrationPatch.title,
        status: hydrationPatch.status,
        date: agg.date, miles: hydrationPatch.miles, predictedMiles: predictedFor("hydration_goal", 0), inconsistent: hydrationPatch.status === "completed" && hydrationPatch.miles <= 0, origin: "derived", updatedAt: hydrationPatch.updatedAt, missionId: null,
        totalMiles: ledgerByClient.get(agg.client_id) ?? 0,
        details: hydrationPatch.details,

      });
    }

    // 4) Fotos de evolução — detalhes e miniaturas privadas para a visão admin.
    const { data: photos } = await sb
      .from("client_progress_photos")
      .select("id, client_id, journey_id, week, storage_key, notes, taken_at, source, updated_at")
      .in("client_id", clientIds)
      .gte("taken_at", from).lte("taken_at", `${to}T23:59:59.999Z`);
    for (const p of photos ?? []) {
      const date = String(p.taken_at ?? "").slice(0, 10);
      if (!date) continue;
      const jinfo = jDay(p.client_id, date);
      const ledger = ledgerByKindRef.get(`${p.client_id}:weekly_photo:${p.id}`) ?? ledgerByKindDay.get(`${p.client_id}:${date}:weekly_photo`);
      const photoUrl = await signedClientPhotoUrl(p.storage_key);
      const photoPatch = {
        status: "completed" as const,
        miles: Number(ledger?.miles ?? 0),
        updatedAt: p.updated_at ?? p.taken_at,
        details: { photoId: p.id, week: p.week ?? null, note: p.notes ?? null, takenAt: p.taken_at ?? null, source: p.source ?? null, photoUrl, ledger: ledger ?? null },
      };
      const has = mergeExistingRow(
        (r) => r.clientId === p.client_id && r.type === "weekly_photo" && (r.date === date || (p.week != null && r.week === p.week)),
        photoPatch,
      );
      if (has) continue;
      pushRow({
        refId: `ph:${p.id}`,
        clientId: p.client_id,
        clientName: nameById.get(p.client_id) ?? "—",
        journeyId: p.journey_id ?? jinfo.jid,
        journeyDay: jinfo.day,
        week: p.week ?? jinfo.week,
        type: "weekly_photo",
        typeLabel: TYPE_LABEL.weekly_photo,
        title: `Foto de evolução — Semana ${p.week ?? jinfo.week ?? "—"}`,
        status: "completed",
        date,
        miles: photoPatch.miles,
        predictedMiles: predictedFor("weekly_photo", 0),
        inconsistent: photoPatch.miles <= 0,
        origin: "derived",
        updatedAt: photoPatch.updatedAt,

        missionId: null,
        totalMiles: ledgerByClient.get(p.client_id) ?? 0,
        details: photoPatch.details,
      });
    }

    // 5) Vídeos — título, percentual e horário final quando não houver missão estrutural equivalente no período.
    const { data: videoProgress } = await sb
      .from("client_video_progress")
      .select("client_id, journey_id, video_id, progress_percent, is_completed, completed_at, updated_at, videos(title)")
      .in("client_id", clientIds)
      .gte("updated_at", `${from}T00:00:00.000Z`).lte("updated_at", `${to}T23:59:59.999Z`);
    for (const v of videoProgress ?? []) {
      const date = String(v.completed_at ?? v.updated_at ?? "").slice(0, 10);
      if (!date) continue;
      const jinfo = jDay(v.client_id, date);
      const ledger = ledgerByKindRef.get(`${v.client_id}:video_complete:${v.video_id}`) ?? ledgerByKindDay.get(`${v.client_id}:${date}:video_complete`);
      const videoPatch = {
        title: (v as any).videos?.title ?? "Vídeo",
        status: v.is_completed ? "completed" as const : "pending" as const,
        miles: Number(ledger?.miles ?? 0),
        updatedAt: v.completed_at ?? v.updated_at ?? null,
        details: { videoId: v.video_id, title: (v as any).videos?.title ?? "Vídeo", progressPercent: Number(v.progress_percent ?? 0), completedAt: v.completed_at ?? null, ledger: ledger ?? null },
      };
      const has = mergeExistingRow(
        (r) => r.clientId === v.client_id && r.type === "video_complete" && ((r.details as any)?.linkedVideoId === v.video_id || (r.details as any)?.videoId === v.video_id),
        videoPatch,
      );
      if (has) continue;
      pushRow({
        refId: `vp:${v.client_id}:${v.video_id}`,
        clientId: v.client_id,
        clientName: nameById.get(v.client_id) ?? "—",
        journeyId: v.journey_id ?? jinfo.jid,
        journeyDay: jinfo.day,
        week: jinfo.week,
        type: "video_complete",
        typeLabel: TYPE_LABEL.video_complete,
        title: videoPatch.title,
        status: videoPatch.status,
        date,
        miles: videoPatch.miles,
        predictedMiles: predictedFor("video_complete", 0),
        inconsistent: videoPatch.status === "completed" && videoPatch.miles <= 0,
        origin: "derived",
        updatedAt: videoPatch.updatedAt,

        missionId: null,
        totalMiles: ledgerByClient.get(v.client_id) ?? 0,
        details: videoPatch.details,
      });
    }

    const filteredRows = data.status ? rows.filter((r) => r.status === data.status) : rows;
    filteredRows.sort((a, b) => (b.date.localeCompare(a.date)) || a.clientName.localeCompare(b.clientName));
    return { rows: filteredRows };
  });

// ============================================================
// getMissionsOverview
// ============================================================
export const getMissionsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tenantId, role } = await callerTenant(context as Ctx);
    if (!isManager(role) && role !== "equipe") throw new Error("Sem permissão.");
    const today = todayISO();
    const sb = (context as Ctx).supabase;

    const { data: clientsRaw } = await sb
      .from("clients")
      .select("id, active_journey_id")
      .eq("tenant_id", tenantId);
    const activeClients = (clientsRaw ?? []).filter((c: any) => c.active_journey_id);
    const ids = activeClients.map((c: any) => c.id);

    let missionsToday = 0, completedToday = 0, milesToday = 0, lowAdherence = 0;
    if (ids.length > 0) {
      const { count: tot } = await sb
        .from("client_missions")
        .select("id", { count: "exact", head: true })
        .in("client_id", ids).eq("due_date", today).eq("active", true);
      missionsToday = tot ?? 0;

      const { data: comps } = await sb
        .from("client_mission_completions")
        .select("mission_id, miles_awarded, client_missions!inner(due_date, client_id)")
        .in("client_id", ids)
        .eq("client_missions.due_date", today);
      completedToday = (comps ?? []).length;

      const { data: ml } = await sb
        .from("miles_ledger")
        .select("miles")
        .in("client_id", ids).eq("occurred_on", today);
      milesToday = (ml ?? []).reduce((s: number, r: any) => s + (r.miles || 0), 0);

      // baixa adesão: <50% últimos 7 dias
      const sevenAgo = new Date(Date.parse(today + "T00:00:00Z") - 6 * 86400000)
        .toISOString().slice(0, 10);
      const { data: weekM } = await sb
        .from("client_missions")
        .select("client_id, id")
        .in("client_id", ids).gte("due_date", sevenAgo).lte("due_date", today).eq("active", true);
      const { data: weekC } = await sb
        .from("client_mission_completions")
        .select("mission_id, client_id")
        .in("client_id", ids);
      const totByClient = new Map<string, number>();
      const cmpIds = new Set((weekC ?? []).map((c: any) => c.mission_id));
      const doneByClient = new Map<string, number>();
      for (const m of weekM ?? []) {
        totByClient.set(m.client_id, (totByClient.get(m.client_id) ?? 0) + 1);
        if (cmpIds.has(m.id)) doneByClient.set(m.client_id, (doneByClient.get(m.client_id) ?? 0) + 1);
      }
      for (const [cid, tot2] of totByClient) {
        const done = doneByClient.get(cid) ?? 0;
        if (tot2 > 0 && done / tot2 < 0.5) lowAdherence += 1;
      }
    }

    return {
      activeJourneys: activeClients.length,
      missionsToday,
      completedToday,
      pendingToday: Math.max(missionsToday - completedToday, 0),
      milesToday,
      lowAdherence,
    };
  });

// ============================================================
// listMissionSettings / updateMissionSetting
// ============================================================
export const listMissionSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tenantId, role } = await callerTenant(context as Ctx);
    if (!isManager(role)) throw new Error("Sem permissão.");
    const { data, error } = await (context as Ctx).supabase
      .from("mission_settings")
      .select("id, mission_kind, label, default_miles, active, metadata")
      .eq("tenant_id", tenantId)
      .order("mission_kind");
    if (error) throw error;
    return { settings: data ?? [] };
  });

export const updateMissionSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; label?: string; defaultMiles?: number; active?: boolean }) =>
    z.object({
      id: z.string().uuid(),
      label: z.string().min(1).max(120).optional(),
      defaultMiles: z.number().int().min(0).max(1000).optional(),
      active: z.boolean().optional(),
    }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, role } = await callerTenant(context as Ctx);
    if (!isManager(role)) throw new Error("Sem permissão.");
    const patch: any = {};
    if (data.label !== undefined) patch.label = data.label;
    if (data.defaultMiles !== undefined) patch.default_miles = data.defaultMiles;
    if (data.active !== undefined) patch.active = data.active;
    const { error } = await (context as Ctx).supabase
      .from("mission_settings").update(patch)
      .eq("id", data.id).eq("tenant_id", tenantId);
    if (error) throw error;
    return { ok: true };
  });

// ============================================================
// createManualMission
// ============================================================
export const createManualMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    clientId: string;
    title: string;
    description?: string | null;
    miles: number;
    dueDate: string;
  }) => z.object({
    clientId: z.string().uuid(),
    title: z.string().min(2).max(160),
    description: z.string().max(1000).nullable().optional(),
    miles: z.number().int().min(0).max(500),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, role } = await callerTenant(context as Ctx);
    if (!isManager(role)) throw new Error("Sem permissão.");
    const sb = (context as Ctx).supabase;
    const { data: client } = await sb
      .from("clients").select("id, tenant_id, active_journey_id")
      .eq("id", data.clientId).eq("tenant_id", tenantId).maybeSingle();
    if (!client) throw new Error("Cliente não encontrada neste tenant.");
    if (!client.active_journey_id) throw new Error("Cliente sem jornada ativa.");
    const { data: row, error } = await sb.from("client_missions").insert({
      tenant_id: tenantId,
      client_id: data.clientId,
      journey_id: client.active_journey_id,
      title: data.title,
      description: data.description ?? null,
      miles: data.miles,
      due_date: data.dueDate,
      active: true,
      mission_type: "manual",
      created_by: (context as Ctx).userId,
    }).select("id").single();
    if (error) throw error;
    return { id: row.id };
  });

// ============================================================
// adjustMilesManual — com audit log obrigatório
// ============================================================
export const adjustMilesManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { clientId: string; miles: number; justification: string }) =>
    z.object({
      clientId: z.string().uuid(),
      miles: z.number().int().refine((n) => n !== 0, "Milhas não podem ser zero"),
      justification: z.string().min(5).max(500),
    }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, role } = await callerTenant(context as Ctx);
    if (!isManager(role)) throw new Error("Sem permissão.");
    const sb = (context as Ctx).supabase;
    const { data: client } = await sb.from("clients").select("id, tenant_id, active_journey_id")
      .eq("id", data.clientId).eq("tenant_id", tenantId).maybeSingle();
    if (!client) throw new Error("Cliente não encontrada neste tenant.");
    const key = `manual:${data.clientId}:${Date.now()}`;
    const { error: rpcErr } = await sb.rpc("award_miles", {
      _client_id: data.clientId,
      _source_kind: "manual_adjust",
      _source_ref: key,
      _miles: data.miles,
      _idempotency_key: key,
      _reason: data.justification,
      _metadata: {},
      _journey_id: client.active_journey_id,
    });
    if (rpcErr) throw rpcErr;
    await sb.from("miles_audit_log").insert({
      tenant_id: tenantId,
      client_id: data.clientId,
      actor_id: (context as Ctx).userId,
      action: "manual_adjust",
      justification: data.justification,
      payload: { miles: data.miles, key },
    });
    return { ok: true };
  });
