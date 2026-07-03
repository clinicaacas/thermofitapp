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
    .select("id, name, tenant_id, plan, hydration_goal_ml, status, start_date, goal, active_journey_id")
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Cliente não encontrada.");
  return data;
}

// Emite evento mínimo de Broadcast no canal privado da cliente.
// Nunca envia storage_key, URL, notes, week, source, visible_to_client.
export async function emitClientPhotoEvent(
  admin: any,
  clientId: string,
  change: "created" | "updated" | "deleted",
  photoId: string | null,
) {
  try {
    await admin.rpc("broadcast_client_photo_event", {
      p_client_id: clientId,
      p_change: change,
      p_photo_id: photoId,
    });
  } catch (err) {
    console.error("broadcast_client_photo_event failed", err);
  }
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

// Identidade mínima da cliente — usada para escopo de cache (tenant + jornada ativa).
export const getClientIdentity = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    return {
      clientId: client.id,
      tenantId: client.tenant_id as string,
      journeyId: (client as any).active_journey_id as string | null,
    };
  });


export const listClientVideos = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    // Convenção oficial: `release_day` é 1-indexado (Dia 1 = release_day 1).
    // release_day = 0 é conteúdo inicial (sempre liberado a partir do Dia 1).
    const journeyDay = getClientJourneyDay(client.start_date) + 1; // 1..N
    const journeyId = (client as any).active_journey_id as string | null;
    const admin = await getAdmin();
    let query = admin
      .from("videos")
      .select(
        "id, title, description, url, thumbnail_url, thumbnail_storage_key, duration_seconds, category, storage_key, video_type, phase, release_day, miles_on_complete, min_completion_pct, journey_id",
      )
      .eq("tenant_id", client.tenant_id)
      .eq("status", "ativo");
    // Isolamento de jornada: vídeos sem journey_id são do catálogo do tenant;
    // vídeos com journey_id só aparecem para essa jornada específica.
    query = journeyId
      ? query.or(`journey_id.is.null,journey_id.eq.${journeyId}`)
      : query.is("journey_id", null);
    const { data: rows, error } = await query
      .order("release_day", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    // Apenas vídeos liberados: release_day <= dia atual (NULL trata como inicial).
    const list = (rows ?? []).filter((r: any) => {
      const rd = r.release_day == null ? 0 : Number(r.release_day);
      return rd <= journeyDay;
    });
    // Progresso da cliente
    const { data: progressRows } = await admin
      .from("client_video_progress")
      .select("video_id, progress_percent, is_completed, completed_at")
      .eq("client_id", client.id);
    const progMap = new Map((progressRows ?? []).map((p: any) => [p.video_id, p]));
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
      journeyDay,
      journeyId,
      videos: list.map((r: any, i: number) => ({
        ...r,
        thumbnail_url: signed[i],
        progress: progMap.get(r.id) ?? null,
      })),
    };
  });


export const listTodayVideoMissions = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    // Convenção 1-indexada: Dia 1 = release_day 1.
    const journeyDay = getClientJourneyDay(client.start_date) + 1;
    const admin = await getAdmin();
    const journeyId = (client as any).active_journey_id as string | null;
    let q = admin
      .from("videos")
      .select(
        "id, title, description, url, thumbnail_url, thumbnail_storage_key, duration_seconds, category, storage_key, video_type, miles_on_complete, min_completion_pct, release_day, journey_id",
      )
      .eq("tenant_id", client.tenant_id)
      .eq("status", "ativo");
    // No primeiro dia (journeyDay=1), inclui também release_day=0 (conteúdo inicial).
    if (journeyDay === 1) {
      q = q.in("release_day", [0, 1]);
    } else {
      q = q.eq("release_day", journeyDay);
    }
    q = journeyId
      ? q.or(`journey_id.is.null,journey_id.eq.${journeyId}`)
      : q.is("journey_id", null);
    const { data: rows, error } = await q;
    if (error) throw error;
    const list = rows ?? [];
    const { data: progressRows } = await admin
      .from("client_video_progress")
      .select("video_id, is_completed, progress_percent")
      .eq("client_id", client.id)
      .in("video_id", list.map((r: any) => r.id));
    const progMap = new Map(
      (progressRows ?? []).map((p: any) => [p.video_id, p]),
    );
    // Mantém TODOS os vídeos do dia (concluídos ou não); a UI mostra selo.
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
      journeyDay,
      missions: list.map((r: any, i: number) => {
        const p: any = progMap.get(r.id);
        return {
          ...r,
          thumbnail_url: signed[i],
          is_completed: !!p?.is_completed,
          progress_percent: p?.progress_percent ?? 0,
        };
      }),
    };
  });


export const saveVideoProgress = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        clientId: z.string().uuid(),
        videoId: z.string().uuid(),
        positionSeconds: z.number().min(0),
        durationSeconds: z.number().min(0),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const journeyIdActive = (client as any).active_journey_id as string | null;
    const { data: video, error: vErr } = await admin
      .from("videos")
      .select("id, tenant_id, journey_id, min_completion_pct, miles_on_complete, duration_seconds, release_day")
      .eq("id", data.videoId)
      .eq("tenant_id", client.tenant_id)
      .maybeSingle();
    if (vErr) throw vErr;
    if (!video) throw new Error("Vídeo não encontrado.");
    if (video.journey_id && video.journey_id !== journeyIdActive) {
      throw new Error("Vídeo não autorizado para esta jornada.");
    }
    const duration = Math.max(data.durationSeconds || 0, video.duration_seconds || 0);
    const position = Math.min(Math.max(0, Math.floor(data.positionSeconds)), Math.max(duration, 1));
    const pct = duration > 0 ? Math.min(100, Math.round((position / duration) * 100)) : 0;
    const minPct = video.min_completion_pct ?? 90;

    // Buscar registro existente
    const { data: existing } = await admin
      .from("client_video_progress")
      .select("id, is_completed, watched_seconds, progress_percent")
      .eq("client_id", client.id)
      .eq("video_id", video.id)
      .maybeSingle();

    const alreadyCompleted = !!existing?.is_completed;
    const shouldComplete = !alreadyCompleted && pct >= minPct;
    const watched = Math.max(existing?.watched_seconds ?? 0, position);
    const progressPercent = Math.max(existing?.progress_percent ?? 0, pct);
    const journeyId = (client as any).active_journey_id as string | null;
    if (!journeyId) throw new Error("Jornada ativa não definida para salvar o vídeo.");

    // 1) Persiste progresso SEM marcar conclusão/miles_awarded.
    // miles_awarded só pode ser definido após confirmação do ledger.
    const basePayload: any = {
      tenant_id: video.tenant_id,
      client_id: client.id,
      journey_id: journeyId,
      video_id: video.id,
      progress_percent: progressPercent,
      watched_seconds: watched,
      last_position_seconds: position,
    };
    const { error: upErr } = await admin
      .from("client_video_progress")
      .upsert(basePayload, { onConflict: "client_id,video_id" });
    if (upErr) throw upErr;

    // 2) Cruzou 90% pela primeira vez → tenta creditar +5 (idempotente).
    // Sem try/catch silencioso: falha de ledger propaga e impede marcar como concluído.
    let ledgerConfirmed = false;
    if (shouldComplete) {
      const miles = await missionMiles(
        admin,
        video.tenant_id,
        "video_complete",
        Number(video.miles_on_complete ?? 5),
      );
      const idempotencyKey = `video_complete:${video.id}`;
      let ledgerRow: any = null;
      if (miles > 0) {
        const { data: awardData, error: awardErr } = await admin.rpc("award_miles", {
          _client_id: client.id,
          _source_kind: "video_complete",
          _source_ref: video.id,
          _miles: miles,
          _idempotency_key: idempotencyKey,
          _reason: "Vídeo concluído",
          _metadata: { progressPercent, positionSeconds: position, durationSeconds: duration } as any,
          _journey_id: journeyId,
        });
        if (awardErr) throw awardErr;
        ledgerRow = awardData;
        ledgerConfirmed = true;
      } else {
        // Miles desativadas → ainda assim marca como concluído, sem crédito.
        ledgerConfirmed = true;
      }

      const dueDate = addDaysISO(client.start_date, Math.max(0, Number(video.release_day ?? 1) - 1));
      const { data: missionId, error: ensureErr } = await admin.rpc("ensure_video_mission", {
        _client_id: client.id,
        _journey_id: journeyId,
        _day: dueDate,
        _video_id: video.id,
      });
      if (ensureErr) throw ensureErr;
      if (missionId) {
        const { data: mission, error: missionErr } = await admin
          .from("client_missions")
          .select("id, tenant_id, client_id, journey_id")
          .eq("id", missionId)
          .maybeSingle();
        if (missionErr) throw missionErr;
        await ensureMissionCompletion(
          admin,
          mission,
          Number(ledgerRow?.miles ?? miles ?? 0),
          "video_complete",
          video.id,
          idempotencyKey,
          ledgerRow?.awarded_at ?? new Date().toISOString(),
        );
      }

      // 3) Só agora marca is_completed + miles_awarded, após ledger confirmar.
      const { error: finErr } = await admin
        .from("client_video_progress")
        .update({
          is_completed: true,
          completed_at: new Date().toISOString(),
          miles_awarded: Number(ledgerRow?.miles ?? miles ?? 0),
        })
        .eq("client_id", client.id)
        .eq("video_id", video.id);
      if (finErr) throw finErr;

      // 4) Materializa tarefas pós-vídeo elegíveis para este vídeo/jornada.
      //    Não concede Milhas aqui — apenas cria as missões pendentes.
      try {
        const { data: tasks } = await admin
          .from("video_post_tasks")
          .select("id, journey_id, active, archived_at")
          .eq("tenant_id", video.tenant_id)
          .eq("video_id", video.id)
          .eq("active", true)
          .is("archived_at", null);
        const eligibleTasks = (tasks ?? []).filter(
          (t: any) => !t.journey_id || t.journey_id === journeyId,
        );
        for (const t of eligibleTasks) {
          await admin.rpc("ensure_post_video_task", {
            _client_id: client.id,
            _journey_id: journeyId,
            _day: dueDate,
            _video_id: video.id as any,
            _task_ref: t.id,
          } as any);
        }
      } catch (taskErr) {
        console.error("[saveVideoProgress] materialize post_video_task failed", taskErr);
      }
    }

    return {
      ok: true,
      completed: shouldComplete || alreadyCompleted,
      awardedNow: shouldComplete && ledgerConfirmed,
      progressPercent,
    };
  });




export const getClientVideoPlayback = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid(), videoId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const journeyIdActive = (client as any).active_journey_id as string | null;
    const { data: v, error } = await admin
      .from("videos")
      .select("id, title, url, storage_key, duration_seconds, min_completion_pct, journey_id")
      .eq("tenant_id", client.tenant_id)
      .eq("id", data.videoId)
      .maybeSingle();
    if (error) throw error;
    if (!v) throw new Error("Vídeo não encontrado.");
    if (v.journey_id && v.journey_id !== journeyIdActive) {
      throw new Error("Vídeo não autorizado para esta jornada.");
    }
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
    return {
      id: v.id,
      title: v.title,
      kind,
      playUrl,
      durationSeconds: v.duration_seconds ?? 0,
      minCompletionPct: v.min_completion_pct ?? 90,
    };
  });

export const listClientRewards = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const journeyId = (client as any).active_journey_id as string | null;

    const [{ data: rows, error }, { data: ledgerRows }, { data: redRows }] = await Promise.all([
      admin
        .from("rewards")
        .select("id, name, description, cost_miles, milestone_miles, reward_type, sort_order, image_url, status")
        .eq("tenant_id", client.tenant_id)
        .eq("status", "ativo")
        .order("milestone_miles", { ascending: true })
        .order("cost_miles", { ascending: true }),
      admin.from("miles_ledger").select("miles").eq("client_id", client.id).eq("journey_id", journeyId ?? ""),
      journeyId
        ? admin
            .from("reward_redemptions")
            .select("reward_id, status, created_at, decided_at")
            .eq("client_id", client.id)
            .eq("journey_id", journeyId)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    if (error) throw error;
    const balance = (ledgerRows ?? []).reduce((s: number, r: any) => s + (r.miles ?? 0), 0);
    const byReward = new Map<string, any>();
    for (const r of (redRows ?? []) as any[]) {
      // Mantém o registro ativo mais recente (ignora cancelados)
      if (r.status === "cancelado") continue;
      const prev = byReward.get(r.reward_id);
      if (!prev || new Date(r.created_at) > new Date(prev.created_at)) byReward.set(r.reward_id, r);
    }
    const rewards = (rows ?? []).map((r: any) => {
      const threshold = r.milestone_miles ?? r.cost_miles ?? 0;
      const red = byReward.get(r.id);
      let state: "bloqueado" | "liberado" | "solicitado" | "entregue" = "bloqueado";
      if (red?.status === "entregue") state = "entregue";
      else if (red?.status === "solicitado" || red?.status === "pendente" || red?.status === "aprovado") state = "solicitado";
      else if (balance >= threshold) state = "liberado";
      return {
        id: r.id,
        name: r.name,
        description: r.description ?? "",
        milestoneMiles: threshold,
        rewardType: r.reward_type ?? null,
        sortOrder: r.sort_order ?? 0,
        imageUrl: r.image_url ?? "",
        state,
        missing: Math.max(threshold - balance, 0),
        redemption: red
          ? { status: red.status, createdAt: red.created_at, decidedAt: red.decided_at }
          : null,
      };
    });
    return { rewards, balance, journeyId };
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

    const moduleMap = new Map((m.data ?? []).map((r: any) => [r.module_key, r]));
    const modules = DEFAULT_MODULES.map((d) => {
      const row: any = moduleMap.get(d.key);
      return {
        key: d.key,
        label: (row?.label && String(row.label).trim()) || d.label,
        enabled: row ? !!row.enabled : true,
      };
    });

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

function addDaysISO(date: string | null | undefined, days: number): string {
  if (!date) return todayISO();
  const d = new Date(`${String(date).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return todayISO();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function missionMiles(admin: any, tenantId: string, kind: string, fallback = 0): Promise<number> {
  const { data } = await admin
    .from("mission_settings")
    .select("default_miles, active")
    .eq("tenant_id", tenantId)
    .eq("mission_kind", kind)
    .maybeSingle();
  if (data?.active === false) return 0;
  return Number(data?.default_miles ?? fallback);
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

async function syncHydrationMissionCompletion(admin: any, client: any, day: string, total: number, goal: number) {
  const journeyId = (client as any).active_journey_id as string | null;
  if (!journeyId) return null;
  const { data: ledger } = await admin
    .from("miles_ledger")
    .select("id, miles, awarded_at, idempotency_key")
    .eq("client_id", client.id)
    .eq("journey_id", journeyId)
    .eq("source_kind", "hydration_goal")
    .eq("idempotency_key", `hydration_goal:${day}`)
    .maybeSingle();
  if (!ledger) return null;
  await admin.rpc("ensure_daily_missions", {
    _client_id: client.id,
    _journey_id: journeyId,
    _day: day,
  });
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
      Number(ledger.miles ?? 0),
      "hydration_goal",
      day,
      `hydration_goal:${day}`,
      ledger.awarded_at,
    );
  }
  return ledger;
}

// Garante a missão semanal de Foto de Evolução para a cliente e sincroniza a
// conclusão a partir das fotos com source='client_upload' na semana atual da
// jornada ATIVA. Identidade lógica:
//   (client_id, journey_id=client.active_journey_id, mission_type='weekly_photo', week_number)
// Mantida pelo índice único parcial client_missions_typed_unique.
export async function ensureAndSyncWeeklyPhotoMission(
  admin: any,
  client: any,
): Promise<{ missionId: string | null }> {
  if (!client.start_date) return { missionId: null };
  const actualWeek = computeActualJourneyWeek(client.start_date);
  if (actualWeek < 1 || actualWeek > JOURNEY_TOTAL_WEEKS) return { missionId: null };
  const week = actualWeek;
  const journeyId = client.active_journey_id as string | null;
  if (!journeyId) return { missionId: null };
  const title = `Foto de evolução — Semana ${week}`;
  const description = "Registre sua foto desta semana para acompanhar sua evolução.";
  const today = todayISO();
  const miles = await missionMiles(admin, client.tenant_id, "weekly_photo", 15);

  // Idempotente: chave lógica baseada em (client_id, journey_id, mission_type, week_number).
  const { data: existing } = await admin
    .from("client_missions")
    .select("id")
    .eq("client_id", client.id)
    .eq("journey_id", journeyId)
    .eq("mission_type", "weekly_photo")
    .eq("week_number", week)
    .maybeSingle();
  let missionId = existing?.id as string | undefined;
  if (!missionId) {
    const { data: created, error: insErr } = await admin
      .from("client_missions")
      .insert({
        tenant_id: client.tenant_id,
        client_id: client.id,
        title,
        description,
        miles,
        due_date: today,
        active: true,
        mission_type: "weekly_photo",
        journey_id: journeyId,
        week_number: week,
      })
      .select("id")
      .single();
    if (insErr) {
      // Corrida com índice único: outra requisição criou nesse meio-tempo.
      const { data: again } = await admin
        .from("client_missions")
        .select("id")
        .eq("client_id", client.id)
        .eq("journey_id", journeyId)
        .eq("mission_type", "weekly_photo")
        .eq("week_number", week)
        .maybeSingle();
      if (!again) return { missionId: null };
      missionId = again.id;
    } else {
      missionId = created.id;
    }
  } else {
    await admin
      .from("client_missions")
      .update({ due_date: today, active: true, title, miles })
      .eq("id", missionId);
  }

  // Conta fotos da cliente nesta semana DESTA jornada (apenas client_upload).
  const { data: firstPhoto, error: firstPhotoErr, count: photoCount } = await admin
    .from("client_progress_photos")
    .select("id, taken_at", { count: "exact" })
    .eq("client_id", client.id)
    .eq("journey_id", journeyId)
    .eq("week", week)
    .eq("source", "client_upload")
    .order("taken_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (firstPhotoErr) throw firstPhotoErr;
  const { data: completion } = await admin
    .from("client_mission_completions")
    .select("mission_id, miles_awarded")
    .eq("mission_id", missionId)
    .eq("client_id", client.id)
    .maybeSingle();
  if ((photoCount ?? 0) > 0 && firstPhoto) {
    const idempotencyKey = `weekly_photo:${journeyId}:w${week}`;
    let ledgerRow: any = null;
    if (miles > 0) {
      const occurredOn = String(firstPhoto.taken_at ?? today).slice(0, 10);
      const { data: insertedLedger, error: ledgerErr } = await admin
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
      ledgerRow = insertedLedger;
      if (!ledgerRow) {
        const { data: existingLedger, error: existingLedgerErr } = await admin
          .from("miles_ledger")
          .select("id, miles, awarded_at, occurred_on")
          .eq("client_id", client.id)
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        if (existingLedgerErr) throw existingLedgerErr;
        ledgerRow = existingLedger;
      }
    }
    await ensureMissionCompletion(
      admin,
      {
        id: missionId,
        tenant_id: client.tenant_id,
        client_id: client.id,
        journey_id: journeyId,
      },
      Number(ledgerRow?.miles ?? miles ?? 0),
      "weekly_photo",
      firstPhoto.id,
      idempotencyKey,
      ledgerRow?.awarded_at ?? firstPhoto.taken_at ?? new Date().toISOString(),
    );
  } else if ((photoCount ?? 0) === 0 && completion) {
    await admin
      .from("client_mission_completions")
      .delete()
      .eq("mission_id", missionId)
      .eq("client_id", client.id);
  }
  return { missionId: missionId ?? null };
}

export const listClientMissions = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    // Read-only: a sincronização da missão semanal de foto ocorre no upload da foto,
    // não ao abrir a lista. Evita conceder Milhas por simples leitura.
    const day = todayISO();
    const [{ data: missions, error: mErr }, { data: completions, error: cErr }] = await Promise.all([
      admin
        .from("client_missions")
        .select("id, title, description, miles, due_date, mission_type")
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
        .select("id, miles, tenant_id, client_id, journey_id")
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
          journey_id: (mission as any).journey_id ?? (client as any).active_journey_id,
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
    const goal = client.hydration_goal_ml ?? 2000;
    const ledger = await syncHydrationMissionCompletion(admin, client, day, total, goal);
    return {
      day,
      total,
      goal,
      creditedToday: !!ledger,
      creditedMiles: Number((ledger as any)?.miles ?? 0),
      creditedAt: (ledger as any)?.awarded_at ?? null,
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
      journey_id: (client as any).active_journey_id,
      ml: data.ml,
    });
    if (error) throw error;

    // Se a meta diária foi batida agora, conceder milhas (idempotente por dia).
    // Sem try/catch silencioso: falha de ledger propaga ao chamador.
    const day = todayISO();
    const { data: todays, error: todaysErr } = await admin
      .from("client_hydration_logs")
      .select("ml")
      .eq("client_id", client.id)
      .eq("log_date", day);
    if (todaysErr) throw todaysErr;
    const total = (todays ?? []).reduce((s: number, r: any) => s + (r.ml ?? 0), 0);
    const goal = client.hydration_goal_ml ?? 2000;
    if (total >= goal) {
      const miles = await missionMiles(admin, client.tenant_id, "hydration_goal", 10);
      if (miles > 0) {
        const { error: awardErr } = await admin.rpc("award_miles", {
          _client_id: client.id,
          _source_kind: "hydration_goal",
          _source_ref: day,
          _miles: miles,
          _idempotency_key: `hydration_goal:${day}`,
          _reason: "Meta de hidratação atingida",
          _metadata: { total, goal } as any,
          _journey_id: (client as any).active_journey_id,
        });
        if (awardErr) throw awardErr;
      }
      await syncHydrationMissionCompletion(admin, client, day, total, goal);
    }

    const ledger = await syncHydrationMissionCompletion(admin, client, day, total, goal);
    return { ok: true, total, goal, creditedToday: !!ledger, creditedMiles: Number((ledger as any)?.miles ?? 0) };
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
    const { data: todays } = await admin
      .from("client_hydration_logs")
      .select("ml")
      .eq("client_id", client.id)
      .eq("log_date", day);
    const total = (todays ?? []).reduce((s: number, r: any) => s + (r.ml ?? 0), 0);
    await syncHydrationMissionCompletion(admin, client, day, total, client.hydration_goal_ml ?? 2000);
    return { ok: true, removed: true };
  });

// ============ MILHAS / PRÊMIOS ============

export const getClientMiles = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const journeyId = (client as any).active_journey_id as string | null;
    let earned = 0;
    if (journeyId) {
      const { data: rows, error } = await admin
        .from("miles_ledger")
        .select("miles")
        .eq("client_id", client.id)
        .eq("journey_id", journeyId);
      if (error) throw error;
      earned = (rows ?? []).reduce((s: number, r: any) => s + (r.miles ?? 0), 0);
    }
    // Regra oficial: prêmios NÃO debitam Milhas. balance = earned.
    return { earned, spent: 0, balance: earned, journeyId };
  });

export const requestRewardRedemption = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({ clientId: z.string().uuid(), rewardId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const journeyId = (client as any).active_journey_id as string | null;
    if (!journeyId) throw new Error("Jornada ativa não encontrada.");

    const { data: reward, error: rErr } = await admin
      .from("rewards")
      .select("id, milestone_miles, cost_miles, status, tenant_id, name")
      .eq("id", data.rewardId)
      .eq("tenant_id", client.tenant_id)
      .maybeSingle();
    if (rErr) throw rErr;
    if (!reward) throw new Error("Prêmio não encontrado.");
    if (reward.status !== "ativo") throw new Error("Prêmio indisponível.");
    const threshold = (reward as any).milestone_miles ?? reward.cost_miles ?? 0;

    const { data: ledgerRows, error: lErr } = await admin
      .from("miles_ledger")
      .select("miles")
      .eq("client_id", client.id)
      .eq("journey_id", journeyId);
    if (lErr) throw lErr;
    const balance = (ledgerRows ?? []).reduce((s: number, r: any) => s + (r.miles ?? 0), 0);
    if (balance < threshold) {
      throw new Error("Você ainda não atingiu as Milhas necessárias para este prêmio.");
    }

    // Upsert via UNIQUE parcial (client_id, reward_id, journey_id) onde status<>'cancelado'
    const { data: existing } = await admin
      .from("reward_redemptions")
      .select("id, status")
      .eq("client_id", client.id)
      .eq("reward_id", reward.id)
      .eq("journey_id", journeyId)
      .neq("status", "cancelado")
      .maybeSingle();

    if (existing) {
      if (existing.status === "entregue") throw new Error("Este prêmio já foi entregue.");
      return { ok: true, alreadyRequested: true };
    }

    const { error } = await admin.from("reward_redemptions").insert({
      tenant_id: client.tenant_id,
      client_id: client.id,
      reward_id: reward.id,
      journey_id: journeyId,
      cost_miles: 0,
      status: "solicitado",
    });
    if (error) throw error;

    await admin.from("miles_audit_log").insert({
      tenant_id: client.tenant_id,
      client_id: client.id,
      actor_id: null,
      action: "reward.requested",
      justification: `Cliente solicitou prêmio: ${reward.name}`,
      payload: { reward_id: reward.id, journey_id: journeyId },
    });
    return { ok: true };
  });

export const listClientRedemptions = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("reward_redemptions")
      .select("id, status, created_at, decided_at, reward_id, rewards(name, milestone_miles, reward_type)")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return { redemptions: rows ?? [] };
  });

export const listClientAchievements = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const journeyId = (client as any).active_journey_id as string | null;
    if (!journeyId) {
      return { seals: [], milestones: [], balance: 0 };
    }
    const [{ data: seals }, { data: milestones }, { data: ledger }] = await Promise.all([
      admin
        .from("client_seals")
        .select("seal_code, miles_awarded, awarded_at")
        .eq("client_id", client.id)
        .eq("journey_id", journeyId),
      admin
        .from("client_journey_milestones")
        .select("milestone_code, miles_threshold, reached_at")
        .eq("client_id", client.id)
        .eq("journey_id", journeyId),
      admin.from("miles_ledger").select("miles").eq("client_id", client.id).eq("journey_id", journeyId),
    ]);
    const balance = (ledger ?? []).reduce((s: number, r: any) => s + (r.miles ?? 0), 0);
    return { seals: seals ?? [], milestones: milestones ?? [], balance };
  });

export const listClientNotifications = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const journeyId = (client as any).active_journey_id as string | null;
    const items: Array<{ id: string; kind: string; title: string; body: string; createdAt: string }> = [];
    if (!journeyId) return { notifications: items };

    const [{ data: seals }, { data: milestones }, { data: redemptions }] = await Promise.all([
      admin
        .from("client_seals")
        .select("id, seal_code, miles_awarded, awarded_at")
        .eq("client_id", client.id)
        .eq("journey_id", journeyId)
        .order("awarded_at", { ascending: false })
        .limit(5),
      admin
        .from("client_journey_milestones")
        .select("id, milestone_code, miles_threshold, reached_at")
        .eq("client_id", client.id)
        .eq("journey_id", journeyId)
        .order("reached_at", { ascending: false })
        .limit(5),
      admin
        .from("reward_redemptions")
        .select("id, status, decided_at, created_at, rewards(name)")
        .eq("client_id", client.id)
        .eq("journey_id", journeyId)
        .in("status", ["entregue", "solicitado"])
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    for (const s of seals ?? []) {
      items.push({
        id: `seal-${(s as any).id}`,
        kind: "seal",
        title: "Novo Selo conquistado",
        body: `Você ganhou +${(s as any).miles_awarded} Milhas (${(s as any).seal_code}).`,
        createdAt: (s as any).awarded_at,
      });
    }
    for (const m of milestones ?? []) {
      if ((m as any).milestone_code === "milestone_checkin") continue;
      items.push({
        id: `ms-${(m as any).id}`,
        kind: "milestone",
        title: "Marco alcançado",
        body: `Você atingiu ${(m as any).miles_threshold} Milhas!`,
        createdAt: (m as any).reached_at,
      });
    }
    for (const r of redemptions ?? []) {
      const name = (r as any).rewards?.name ?? "Prêmio";
      items.push({
        id: `rd-${(r as any).id}`,
        kind: "reward",
        title: (r as any).status === "entregue" ? "Prêmio entregue" : "Prêmio solicitado",
        body: name,
        createdAt: (r as any).decided_at ?? (r as any).created_at,
      });
    }
    items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return { notifications: items.slice(0, 15) };
  });

// ============ FOTOS DE EVOLUÇÃO ============

// Calcula a semana real da jornada (pode ultrapassar 12). currentWeek é a versão
// limitada para exibição (1..12). journeyCompleted = actualJourneyWeek > 12.
function computeActualJourneyWeek(startDate: string | Date | null | undefined): number {
  const day = getClientJourneyDay(startDate);
  return Math.floor(day / 7) + 1;
}

const JOURNEY_TOTAL_WEEKS = 12;


export const listClientPhotos = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("client_progress_photos")
      .select("id, storage_key, taken_at, week, notes, source, visible_to_client, journey_id")
      .eq("client_id", client.id)
      .eq("tenant_id", client.tenant_id)
      .eq("visible_to_client", true)
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
    const journeyId = client.active_journey_id as string | null;
    const weekPhotoCounts: Record<number, number> = {};
    for (let w = 1; w <= JOURNEY_TOTAL_WEEKS; w++) weekPhotoCounts[w] = 0;
    let legacyPhotoCount = 0;
    for (const r of items) {
      const w = r.week;
      // Conta no calendário SOMENTE fotos da jornada ATIVA. Fotos antigas
      // (journey_id NULL ou diferente) caem em "anteriores", sem misturar.
      const sameJourney = journeyId && r.journey_id === journeyId;
      if (sameJourney && typeof w === "number" && w >= 1 && w <= JOURNEY_TOTAL_WEEKS) {
        weekPhotoCounts[w] = (weekPhotoCounts[w] ?? 0) + 1;
      } else {
        legacyPhotoCount += 1;
      }
    }
    const actualJourneyWeek = computeActualJourneyWeek(client.start_date);
    const journeyCompleted = actualJourneyWeek > JOURNEY_TOTAL_WEEKS;
    const currentWeek = journeyCompleted
      ? JOURNEY_TOTAL_WEEKS
      : Math.max(1, Math.min(JOURNEY_TOTAL_WEEKS, actualJourneyWeek));
    return {
      photos: items,
      actualJourneyWeek,
      currentWeek,
      journeyCompleted,
      totalWeeks: JOURNEY_TOTAL_WEEKS,
      hasStartDate: !!client.start_date,
      weekPhotoCounts,
      legacyPhotoCount,
      activeJourneyId: journeyId,
    };
  });


export const uploadClientPhoto = createServerFn({ method: "POST" })
  .inputValidator((d) => {
    if (!(d instanceof FormData)) throw new Error("FormData esperado");
    const clientId = String(d.get("clientId") || "");
    const file = d.get("file");
    const notes = String(d.get("notes") || "");
    if (!clientId) throw new Error("clientId obrigatório");
    if (!(file instanceof File)) throw new Error("Arquivo obrigatório");
    // Semana é IGNORADA propositalmente — recalculada no servidor.
    return {
      clientId,
      file,
      notes: notes || null,
    };
  })
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    if (!client.start_date) {
      throw new Error("Sua data de início ainda não foi definida. Fale com a equipe.");
    }
    const actualJourneyWeek = computeActualJourneyWeek(client.start_date);
    if (actualJourneyWeek > JOURNEY_TOTAL_WEEKS) {
      throw new Error(
        "Sua jornada de 12 semanas foi concluída. Para novos registros, fale com a equipe.",
      );
    }
    if (actualJourneyWeek < 1) {
      throw new Error("Jornada ainda não iniciada.");
    }
    const currentWeek = actualJourneyWeek;
    const admin = await getAdmin();

    // LGPD: bloqueia upload se consentimento photos_internal estiver false.
    const { data: consent } = await admin
      .from("consents")
      .select("photos_internal")
      .eq("client_id", client.id)
      .maybeSingle();
    if (consent && consent.photos_internal === false) {
      throw new Error(
        "Para enviar fotos de evolução, é necessário autorizar o uso interno das suas fotos no termo de privacidade.",
      );
    }

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
    const { data: inserted, error: insErr } = await admin.from("client_progress_photos").insert({
      tenant_id: client.tenant_id,
      client_id: client.id,
      storage_key: key,
      week: currentWeek,
      notes: data.notes,
      source: "client_upload",
      journey_id: client.active_journey_id,
    }).select("id").single();
    if (insErr) {
      await admin.storage.from("client-photos").remove([key]);
      throw insErr;
    }
    // Conclui (uma única vez) a missão semanal de foto.
    await ensureAndSyncWeeklyPhotoMission(admin, client);
    await emitClientPhotoEvent(admin, client.id, "created", inserted?.id ?? null);
    return { ok: true, week: currentWeek };
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
    // Recalcula conclusão da missão semanal após exclusão.
    await ensureAndSyncWeeklyPhotoMission(admin, client);
    await emitClientPhotoEvent(admin, client.id, "deleted", row.id);
    return { ok: true };
  });

// ============ JORNADA ============

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const startClientJourney = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        clientId: z.string().uuid(),
        startDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD).")
          .optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: out, error } = await context.supabase.rpc("start_client_journey", {
      _client_id: data.clientId,
      ...(data.startDate ? { _start_date: data.startDate } : {}),
    });
    if (error) throw error;
    await emitClientPhotoEvent(await getAdmin(), data.clientId, "updated", null);
    return { ok: true, ...(out as any) };
  });

export const adminRestartClientJourney = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        clientId: z.string().uuid(),
        startDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD)."),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: out, error } = await context.supabase.rpc("start_client_journey", {
      _client_id: data.clientId,
      _start_date: data.startDate,
    });
    if (error) throw error;
    await emitClientPhotoEvent(await getAdmin(), data.clientId, "updated", null);
    const payload = (out ?? {}) as { journeyId?: string; startedOn?: string };
    return { ok: true, journeyId: payload.journeyId, startDate: payload.startedOn };
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
// Read-only: planos personalizados publicados na jornada ativa da própria cliente.
// Não cria milhas, missões, pontos ou check-ins.

export const getClientWorkoutPlan = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    if (!client.active_journey_id) {
      return { plan: null, identity: { tenantId: client.tenant_id, clientId: client.id, journeyId: null } };
    }
    const admin = await getAdmin();
    const { data: row, error } = await admin
      .from("workout_plans")
      .select(
        "id, title, description, pdf_path, pdf_uploaded_at, published_at, updated_at, tenant_id, client_id, journey_id, status",
      )
      .eq("client_id", client.id)
      .eq("tenant_id", client.tenant_id)
      .eq("journey_id", client.active_journey_id)
      .eq("status", "publicado")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!row) {
      return {
        plan: null,
        identity: { tenantId: client.tenant_id, clientId: client.id, journeyId: client.active_journey_id },
      };
    }
    const { data: items } = await admin
      .from("plan_exercises")
      .select(
        "id, sets, reps, notes, pdf_path, order_index, exercises:exercise_id (id, title, description, video_url, muscle_group, equipment, sets, reps, pdf_path)",
      )
      .eq("plan_id", row.id)
      .order("order_index", { ascending: true });

    return {
      identity: { tenantId: row.tenant_id, clientId: row.client_id, journeyId: row.journey_id },
      plan: {
        id: row.id,
        tenantId: row.tenant_id,
        clientId: row.client_id,
        journeyId: row.journey_id,
        title: row.title,
        description: row.description ?? "",
        pdfPath: row.pdf_path,
        pdfUploadedAt: row.pdf_uploaded_at,
        publishedAt: row.published_at,
        updatedAt: row.updated_at,
        exercises: (items ?? []).map((it: any) => {
          const ex = it.exercises;
          const customized =
            it.sets != null ||
            (typeof it.reps === "string" && it.reps.length > 0) ||
            (typeof it.notes === "string" && it.notes.length > 0) ||
            !!it.pdf_path;
          return {
            id: it.id,
            title: ex?.title ?? "Exercício",
            muscleGroup: ex?.muscle_group ?? null,
            equipment: ex?.equipment ?? null,
            videoUrl: ex?.video_url ?? null,
            description: ex?.description ?? "",
            defaultSets: ex?.sets ?? null,
            defaultReps: ex?.reps ?? null,
            baseExercisePdfPath: ex?.pdf_path ?? null,
            sets: it.sets,
            reps: it.reps,
            notes: it.notes ?? "",
            pdfPath: it.pdf_path,
            customized,
          };
        }),
      },
    };
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
