import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DEFAULT_MODULES, DEFAULT_QUICK_TOPICS } from "./thermofit-app-settings.functions";
import { getClientJourneyDay } from "./journey";




async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function loadClient(clientId: string) {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("clients")
    .select("id, name, tenant_id, plan, hydration_goal_ml, status, start_date, goal")
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Cliente não encontrada.");
  return data;
}

export const getClientHome = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    return {
      client: {
        id: client.id,
        name: client.name,
        plan: client.plan,
        goal: client.goal,
        hydrationGoalMl: client.hydration_goal_ml,
        status: client.status,
        startDate: client.start_date,
      },
    };
  });

export const listClientVideos = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("videos")
      .select("id, title, description, url, thumbnail_url, thumbnail_storage_key, duration_seconds, category, storage_key, video_type, phase, miles_on_complete")
      .eq("tenant_id", client.tenant_id)
      .eq("status", "ativo")
      .order("created_at", { ascending: true });
    if (error) throw error;
    const list = rows ?? [];
    const signed = await Promise.all(
      list.map(async (r: any) => {
        if (!r.thumbnail_storage_key) return r.thumbnail_url ?? "";
        const { data: s } = await admin.storage
          .from("video-thumbnails")
          .createSignedUrl(r.thumbnail_storage_key, 3600);
        return s?.signedUrl ?? r.thumbnail_url ?? "";
      }),
    );
    return {
      videos: list.map((r: any, i: number) => ({ ...r, thumbnail_url: signed[i] })),
    };
  });


export const getClientVideoPlayback = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid(), videoId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const { data: v, error } = await admin
      .from("videos")
      .select("id, title, url, storage_key")
      .eq("tenant_id", client.tenant_id)
      .eq("id", data.videoId)
      .maybeSingle();
    if (error) throw error;
    if (!v) throw new Error("Vídeo não encontrado.");
    let playUrl: string | null = v.url || null;
    let kind: "youtube" | "file" | "external" = "external";
    if (v.storage_key) {
      const { data: signed, error: sErr } = await admin.storage
        .from("videos")
        .createSignedUrl(v.storage_key, 3600);
      if (sErr) throw sErr;
      playUrl = signed?.signedUrl ?? null;
      kind = "file";
    } else if (v.url && /youtube\.com|youtu\.be/i.test(v.url)) {
      kind = "youtube";
    }
    return { id: v.id, title: v.title, kind, playUrl };
  });

export const listClientRewards = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("rewards")
      .select("*")
      .eq("tenant_id", client.tenant_id)
      .eq("status", "ativo")
      .order("cost_miles", { ascending: true });
    if (error) throw error;
    return { rewards: rows ?? [] };
  });

const helpSchema = z.object({
  clientId: z.string().uuid(),
  quickTopic: z.string().trim().max(80).optional().nullable(),
  body: z.string().trim().min(1, "Mensagem obrigatória").max(500),
  createAlert: z.boolean().default(false),
});

export const sendHelpMessage = createServerFn({ method: "POST" })
  .inputValidator((i) => helpSchema.parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const tenantId = client.tenant_id;

    let alertId: string | null = null;
    if (data.createAlert) {
      const { data: alert, error: aErr } = await admin
        .from("risk_alerts")
        .insert({
          tenant_id: tenantId,
          client_id: client.id,
          type: data.quickTopic || "ajuda",
          description: data.body,
          severity: "alta",
        })
        .select("id")
        .single();
      if (aErr) console.error("[sendHelpMessage] alert error", aErr);
      else alertId = alert.id;
    }

    const { data: row, error } = await admin
      .from("help_messages")
      .insert({
        tenant_id: tenantId,
        client_id: client.id,
        quick_topic: data.quickTopic ?? null,
        body: data.body,
        created_alert_id: alertId,
      })
      .select("*")
      .single();
    if (error) {
      console.error("[sendHelpMessage] insert error", error);
      throw new Error(error.message || "Falha ao enviar mensagem.");
    }

    return { ok: true, alertCreated: !!alertId };
  });

export const listHelpMessages = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("help_messages")
      .select("*")
      .eq("tenant_id", client.tenant_id)
      .eq("client_id", data.clientId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return { messages: rows ?? [] };
  });

export const getAppSettingsForClient = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const tenantId = client.tenant_id;
    const admin = await getAdmin();
    const [s, m, t] = await Promise.all([
      admin.from("client_app_settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
      admin.from("app_module_settings").select("*").eq("tenant_id", tenantId),
      admin.from("app_templates").select("*").eq("tenant_id", tenantId),
    ]);
    if (s.error) throw s.error;
    if (m.error) throw m.error;
    if (t.error) throw t.error;

    const settings = s.data ?? {
      tenant_id: tenantId,
      app_name: "ThermoFit",
      app_subtitle: "Plano de Voo da Transformação",
      welcome_text: "Bem-vinda ao seu Plano de Voo!",
      primary_color: "#5b6cff",
      accent_color: "#7c83ff",
      config: {},
    };

    const moduleMap = new Map((m.data ?? []).map((r: any) => [r.module_key, r.enabled]));
    const modules = DEFAULT_MODULES.map((d) => ({
      ...d,
      enabled: moduleMap.has(d.key) ? !!moduleMap.get(d.key) : true,
    }));

    const quickTopics = (t.data ?? []).filter((r: any) => r.kind === "quick_topic");
    const finalQuickTopics =
      quickTopics.length > 0
        ? quickTopics.map((r: any) => ({ key: r.key, label: r.label, creates_alert: r.creates_alert }))
        : DEFAULT_QUICK_TOPICS;

    return { settings, modules, quickTopics: finalQuickTopics, templates: t.data ?? [] };
  });

// ============ MISSÕES ============

function todayISO() {
  // YYYY-MM-DD in São Paulo
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return d.toISOString().slice(0, 10);
}

export const listClientMissions = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const day = todayISO();
    const [{ data: missions, error: mErr }, { data: completions, error: cErr }] = await Promise.all([
      admin
        .from("client_missions")
        .select("id, title, description, miles, due_date")
        .eq("tenant_id", client.tenant_id)
        .eq("client_id", client.id)
        .eq("active", true)
        .eq("due_date", day)
        .order("created_at", { ascending: true }),
      admin
        .from("client_mission_completions")
        .select("mission_id, completed_at, miles_awarded")
        .eq("client_id", client.id),
    ]);
    if (mErr) throw mErr;
    if (cErr) throw cErr;
    const doneSet = new Map((completions ?? []).map((c: any) => [c.mission_id, c]));
    return {
      day,
      missions: (missions ?? []).map((m: any) => ({
        ...m,
        completed: doneSet.has(m.id),
      })),
    };
  });

export const toggleMissionCompletion = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({ clientId: z.string().uuid(), missionId: z.string().uuid(), done: z.boolean() }).parse(i),
  )
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    if (data.done) {
      const { data: mission, error: mErr } = await admin
        .from("client_missions")
        .select("id, miles, tenant_id, client_id")
        .eq("id", data.missionId)
        .eq("client_id", client.id)
        .maybeSingle();
      if (mErr) throw mErr;
      if (!mission) throw new Error("Missão não encontrada.");
      const { error } = await admin.from("client_mission_completions").upsert(
        {
          tenant_id: mission.tenant_id,
          client_id: mission.client_id,
          mission_id: mission.id,
          miles_awarded: mission.miles ?? 0,
        },
        { onConflict: "mission_id,client_id" },
      );
      if (error) throw error;
    } else {
      const { error } = await admin
        .from("client_mission_completions")
        .delete()
        .eq("mission_id", data.missionId)
        .eq("client_id", client.id);
      if (error) throw error;
    }
    return { ok: true };
  });


// ============ HIDRATAÇÃO ============

export const getHydrationToday = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const day = todayISO();
    const { data: rows, error } = await admin
      .from("client_hydration_logs")
      .select("id, ml, created_at")
      .eq("client_id", client.id)
      .eq("log_date", day)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const total = (rows ?? []).reduce((s: number, r: any) => s + (r.ml ?? 0), 0);
    return {
      day,
      total,
      goal: client.hydration_goal_ml ?? 2000,
      logs: rows ?? [],
    };
  });

export const addHydration = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({ clientId: z.string().uuid(), ml: z.number().int().refine((n) => n !== 0) }).parse(i),
  )
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const { error } = await admin.from("client_hydration_logs").insert({
      tenant_id: client.tenant_id,
      client_id: client.id,
      ml: data.ml,
    });
    if (error) throw error;
    return { ok: true };
  });

export const undoLastHydration = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const day = todayISO();
    const { data: last, error: lErr } = await admin
      .from("client_hydration_logs")
      .select("id")
      .eq("client_id", client.id)
      .eq("log_date", day)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lErr) throw lErr;
    if (!last) return { ok: true, removed: false };
    const { error } = await admin.from("client_hydration_logs").delete().eq("id", last.id);
    if (error) throw error;
    return { ok: true, removed: true };
  });

// ============ MILHAS / PRÊMIOS ============

export const getClientMiles = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const [{ data: earnedRows, error: eErr }, { data: spentRows, error: sErr }] = await Promise.all([
      admin
        .from("client_mission_completions")
        .select("miles_awarded")
        .eq("client_id", client.id),
      admin
        .from("reward_redemptions")
        .select("cost_miles, status")
        .eq("client_id", client.id)
        .in("status", ["pendente", "aprovado", "entregue"]),
    ]);
    if (eErr) throw eErr;
    if (sErr) throw sErr;
    const earned = (earnedRows ?? []).reduce((s: number, r: any) => s + (r.miles_awarded ?? 0), 0);
    const spent = (spentRows ?? []).reduce((s: number, r: any) => s + (r.cost_miles ?? 0), 0);
    return { earned, spent, balance: earned - spent };
  });

export const requestRewardRedemption = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({ clientId: z.string().uuid(), rewardId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const { data: reward, error: rErr } = await admin
      .from("rewards")
      .select("id, cost_miles, stock, status, tenant_id")
      .eq("id", data.rewardId)
      .eq("tenant_id", client.tenant_id)
      .maybeSingle();
    if (rErr) throw rErr;
    if (!reward) throw new Error("Prêmio não encontrado.");
    if (reward.status !== "ativo") throw new Error("Prêmio indisponível.");
    if ((reward.stock ?? 0) <= 0) throw new Error("Sem estoque.");

    const [{ data: earnedRows }, { data: spentRows }] = await Promise.all([
      admin.from("client_mission_completions").select("miles_awarded").eq("client_id", client.id),
      admin
        .from("reward_redemptions")
        .select("cost_miles")
        .eq("client_id", client.id)
        .in("status", ["pendente", "aprovado", "entregue"]),
    ]);
    const earned = (earnedRows ?? []).reduce((s: number, r: any) => s + (r.miles_awarded ?? 0), 0);
    const spent = (spentRows ?? []).reduce((s: number, r: any) => s + (r.cost_miles ?? 0), 0);
    const balance = earned - spent;
    if (balance < (reward.cost_miles ?? 0)) {
      throw new Error("Milhas insuficientes para este prêmio.");
    }

    const { error } = await admin.from("reward_redemptions").insert({
      tenant_id: client.tenant_id,
      client_id: client.id,
      reward_id: reward.id,
      cost_miles: reward.cost_miles,
      status: "pendente",
    });
    if (error) throw error;
    return { ok: true };
  });

export const listClientRedemptions = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("reward_redemptions")
      .select("id, status, cost_miles, created_at, reward_id, rewards(name)")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return { redemptions: rows ?? [] };
  });

// ============ FOTOS DE EVOLUÇÃO ============

export const listClientPhotos = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("client_progress_photos")
      .select("id, storage_key, taken_at, week, notes")
      .eq("client_id", client.id)
      .order("taken_at", { ascending: false });
    if (error) throw error;
    const items = await Promise.all(
      (rows ?? []).map(async (r: any) => {
        const { data: signed } = await admin.storage
          .from("client-photos")
          .createSignedUrl(r.storage_key, 3600);
        return { ...r, url: signed?.signedUrl ?? null };
      }),
    );
    return { photos: items };
  });

export const uploadClientPhoto = createServerFn({ method: "POST" })
  .inputValidator((d) => {
    if (!(d instanceof FormData)) throw new Error("FormData esperado");
    const clientId = String(d.get("clientId") || "");
    const file = d.get("file");
    const notes = String(d.get("notes") || "");
    const weekRaw = d.get("week");
    if (!clientId) throw new Error("clientId obrigatório");
    if (!(file instanceof File)) throw new Error("Arquivo obrigatório");
    return {
      clientId,
      file,
      notes: notes || null,
      week: weekRaw ? Number(weekRaw) || null : null,
    };
  })
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const file = data.file as File;
    if (file.size > 10 * 1024 * 1024) throw new Error("Arquivo acima de 10MB.");
    if (!file.type.startsWith("image/")) throw new Error("Envie uma imagem.");
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = `${client.tenant_id}/${client.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const buf = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from("client-photos")
      .upload(key, buf, { contentType: file.type, upsert: false });
    if (upErr) throw upErr;
    const { error: insErr } = await admin.from("client_progress_photos").insert({
      tenant_id: client.tenant_id,
      client_id: client.id,
      storage_key: key,
      week: data.week,
      notes: data.notes,
    });
    if (insErr) {
      await admin.storage.from("client-photos").remove([key]);
      throw insErr;
    }
    return { ok: true };
  });

export const deleteClientPhoto = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({ clientId: z.string().uuid(), photoId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const { data: row, error } = await admin
      .from("client_progress_photos")
      .select("id, storage_key")
      .eq("id", data.photoId)
      .eq("client_id", client.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) return { ok: true };
    await admin.storage.from("client-photos").remove([row.storage_key]);
    const { error: dErr } = await admin
      .from("client_progress_photos")
      .delete()
      .eq("id", row.id);
    if (dErr) throw dErr;
    return { ok: true };
  });

// ============ PULSO SEMANAL ============

function weekStartISO(): string {
  // Monday-start week in São Paulo
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

const pulseSchema = z.object({
  clientId: z.string().uuid(),
  mood: z.number().int().min(1).max(5),
  energy: z.number().int().min(1).max(5),
  hunger: z.number().int().min(1).max(5),
  sleep: z.number().int().min(1).max(5),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const getCurrentPulse = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const week = weekStartISO();
    const { data: row, error } = await admin
      .from("client_weekly_pulse")
      .select("*")
      .eq("client_id", client.id)
      .eq("week_start", week)
      .maybeSingle();
    if (error) throw error;
    return { weekStart: week, pulse: row };
  });

export const submitPulse = createServerFn({ method: "POST" })
  .inputValidator((i) => pulseSchema.parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const week = weekStartISO();
    const { error } = await admin.from("client_weekly_pulse").upsert(
      {
        tenant_id: client.tenant_id,
        client_id: client.id,
        week_start: week,
        mood: data.mood,
        energy: data.energy,
        hunger: data.hunger,
        sleep: data.sleep,
        notes: data.notes ?? null,
      },
      { onConflict: "client_id,week_start" },
    );
    if (error) throw error;
    return { ok: true };
  });

export const listPulseHistory = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("client_weekly_pulse")
      .select("id, week_start, mood, energy, hunger, sleep, notes")
      .eq("client_id", client.id)
      .order("week_start", { ascending: false })
      .limit(12);
    if (error) throw error;
    return { history: rows ?? [] };
  });

// ============ VACUUM (CINTURA ATIVA) ============

export const logVacuumSession = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        clientId: z.string().uuid(),
        rounds: z.number().int().min(1).max(50),
        totalSeconds: z.number().int().min(0).max(60 * 60),
        notes: z.string().trim().max(300).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const { error } = await admin.from("client_vacuum_sessions").insert({
      tenant_id: client.tenant_id,
      client_id: client.id,
      rounds: data.rounds,
      total_seconds: data.totalSeconds,
      notes: data.notes ?? null,
    });
    if (error) throw error;
    return { ok: true };
  });

export const listVacuumSessions = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("client_vacuum_sessions")
      .select("id, performed_at, rounds, total_seconds")
      .eq("client_id", client.id)
      .order("performed_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    const totalRounds = (rows ?? []).reduce((s: number, r: any) => s + (r.rounds ?? 0), 0);
    const totalSeconds = (rows ?? []).reduce(
      (s: number, r: any) => s + (r.total_seconds ?? 0),
      0,
    );
    return { sessions: rows ?? [], totalRounds, totalSeconds };
  });

// ============ NUTRIÇÃO ============

export const getClientNutritionPlan = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const { data: row, error } = await admin
      .from("client_nutrition_plans")
      .select("id, title, weekly_calories, water_ml, restrictions, notes, meals, updated_at")
      .eq("client_id", client.id)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return { plan: row ?? null };
  });

// ============ TREINO ============

export const getClientWorkoutPlan = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const { data: row, error } = await admin
      .from("client_workout_plans")
      .select("id, title, frequency_per_week, duration_minutes, focus, notes, sessions, updated_at")
      .eq("client_id", client.id)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return { plan: row ?? null };
  });

// ============ CARTAS ============

export const listClientLetters = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("client_letters")
      .select("id, title, body, sent_at, read_at")
      .eq("client_id", client.id)
      .order("sent_at", { ascending: false });
    if (error) throw error;
    return { letters: rows ?? [] };
  });

export const markLetterRead = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({ clientId: z.string().uuid(), letterId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const { error } = await admin
      .from("client_letters")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.letterId)
      .eq("client_id", client.id)
      .is("read_at", null);
    if (error) throw error;
    return { ok: true };
  });
