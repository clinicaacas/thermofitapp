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
  return { tenantId: data.tenant_id as string, role: data.profile as string };
}

export const getMyTenantId = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tenantId } = await callerTenant(context);
    return { tenantId };
  });

async function logAudit(
  context: Ctx,
  tenantId: string,
  action: string,
  entity: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
) {
  try {
    await context.supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_id: context.userId,
      action,
      entity,
      entity_id: entityId,
      metadata,
    });
  } catch (err) {
    console.error("audit_logs insert failed", err);
  }
}

// ---------------------------------------------------------------------------
// VIDEOS
// ---------------------------------------------------------------------------

const videoSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default(""),
  url: z.string().trim().max(500).default(""),
  thumbnailUrl: z.string().trim().max(500).default(""),
  thumbnailStorageKey: z.string().trim().max(500).default(""),
  thumbnailSource: z
    .enum(["auto_video_frame", "manual_upload", "youtube", "external_default", "none"])
    .default("none"),
  durationSeconds: z.number().int().min(0).max(86400).default(0),
  category: z.string().trim().max(60).default("geral"),
  status: z.enum(["ativo", "rascunho", "arquivado"]).default("ativo"),
  videoType: z
    .enum(["manha", "noite", "audio", "mensagem_especial", "educativo", "motivacional"])
    .default("manha"),
  releaseDay: z.number().int().min(0).max(3650).nullable().default(null),
  phase: z.string().trim().max(60).default(""),
  milesOnComplete: z.number().int().min(0).max(100000).default(5),
  minCompletionPct: z.number().int().min(1).max(100).default(90),
  fileName: z.string().trim().max(255).default(""),
  storageKey: z.string().trim().max(500).default(""),
  visibility: z.enum(["catalog", "journey"]).default("catalog"),
  journeyId: z.string().uuid().nullable().default(null),
});




function mapVideo(row: any, signedThumb?: string | null, journeyTarget?: { clientName: string } | null) {
  const storedThumb = row.thumbnail_storage_key ?? "";
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    url: row.url ?? "",
    thumbnailUrl: signedThumb ?? row.thumbnail_url ?? "",
    thumbnailStorageKey: storedThumb,
    thumbnailSource: row.thumbnail_source ?? "none",
    durationSeconds: row.duration_seconds ?? 0,
    category: row.category ?? "geral",
    status: row.status,
    videoType: row.video_type ?? "manha",
    releaseDay: row.release_day ?? null,
    phase: row.phase ?? "",
    milesOnComplete: row.miles_on_complete ?? 5,
    minCompletionPct: row.min_completion_pct ?? 90,
    fileName: row.file_name ?? "",
    storageKey: row.storage_key ?? "",
    createdAt: row.created_at,
    journeyId: (row.journey_id as string | null) ?? null,
    journeyClientName: journeyTarget?.clientName ?? null,
  };
}


async function signThumb(supabase: any, key: string | null | undefined): Promise<string | null> {
  if (!key) return null;
  const { data } = await supabase.storage.from("video-thumbnails").createSignedUrl(key, 3600);
  return data?.signedUrl ?? null;
}

export const listVideos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tenantId } = await callerTenant(context);
    const { data, error } = await context.supabase
      .from("videos")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows = data ?? [];
    const journeyIds = Array.from(
      new Set(rows.map((r: any) => r.journey_id).filter((v: any) => !!v)),
    ) as string[];
    let journeyMap = new Map<string, { clientName: string }>();
    if (journeyIds.length > 0) {
      const { data: jrs } = await context.supabase
        .from("client_journeys")
        .select("id, client_id, clients(name)")
        .in("id", journeyIds);
      for (const j of (jrs ?? []) as any[]) {
        journeyMap.set(j.id, { clientName: j.clients?.name ?? "—" });
      }
    }
    const signed = await Promise.all(
      rows.map((r: any) =>
        r.thumbnail_storage_key ? signThumb(context.supabase, r.thumbnail_storage_key) : Promise.resolve(null),
      ),
    );
    return {
      videos: rows.map((r: any, i: number) =>
        mapVideo(r, signed[i], r.journey_id ? journeyMap.get(r.journey_id) ?? null : null),
      ),
    };
  });

// Lista clientes do tenant com jornada ativa, para o seletor de visibilidade.
export const listJourneyTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tenantId } = await callerTenant(context);
    const { data, error } = await context.supabase
      .from("clients")
      .select("id, name, active_journey_id")
      .eq("tenant_id", tenantId)
      .not("active_journey_id", "is", null)
      .order("name", { ascending: true });
    if (error) throw error;
    return {
      targets: (data ?? []).map((c: any) => ({
        clientId: c.id,
        clientName: c.name,
        journeyId: c.active_journey_id as string,
      })),
    };
  });


export const saveVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid().optional(), patch: videoSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);

    // Resolução de visibilidade — exige decisão explícita.
    let resolvedJourneyId: string | null = null;
    if (data.patch.visibility === "journey") {
      if (!data.patch.journeyId) {
        throw new Error("Selecione a jornada exclusiva para este vídeo.");
      }
      // Confirma que a jornada existe e pertence ao mesmo tenant (trigger reforça no banco).
      const { data: jr, error: jErr } = await context.supabase
        .from("client_journeys")
        .select("id, tenant_id")
        .eq("id", data.patch.journeyId)
        .maybeSingle();
      if (jErr) throw jErr;
      if (!jr || (jr as any).tenant_id !== tenantId) {
        throw new Error("Jornada inválida ou de outra clínica.");
      }
      resolvedJourneyId = data.patch.journeyId;
    }

    const payload: any = {
      tenant_id: tenantId,
      title: data.patch.title.trim(),
      description: data.patch.description,
      url: data.patch.url,
      thumbnail_url: data.patch.thumbnailUrl,
      thumbnail_storage_key: data.patch.thumbnailStorageKey || null,
      thumbnail_source: data.patch.thumbnailSource,
      duration_seconds: data.patch.durationSeconds,
      category: data.patch.category,
      status: data.patch.status,
      video_type: data.patch.videoType,
      release_day: data.patch.releaseDay,
      phase: data.patch.phase,
      miles_on_complete: data.patch.milesOnComplete,
      min_completion_pct: data.patch.minCompletionPct,
      file_name: data.patch.fileName,
      storage_key: data.patch.storageKey,
      journey_id: resolvedJourneyId,
    };

    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("videos")
        .update(payload)
        .eq("tenant_id", tenantId)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      await logAudit(context, tenantId, "video.update", "video", row.id, { journeyId: resolvedJourneyId });
      await syncVideoMissionForEligibleJourneys(row);
      const sig = await signThumb(context.supabase, row.thumbnail_storage_key);
      return { video: mapVideo(row, sig) };
    } else {
      const { data: row, error } = await context.supabase
        .from("videos")
        .insert({ ...payload, created_by: context.userId })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      await logAudit(context, tenantId, "video.create", "video", row.id, { journeyId: resolvedJourneyId });
      await syncVideoMissionForEligibleJourneys(row);
      const sig = await signThumb(context.supabase, row.thumbnail_storage_key);
      return { video: mapVideo(row, sig) };
    }

  });

// Materialização explícita e imediata (write-only, idempotente).
// Cria `client_missions` do tipo `video_complete` para clientes cujo dia atual
// da jornada coincide com o `release_day` do vídeo. Não gera Milhas, não cria
// missão para dia diferente nem para vídeos futuros. Catálogo aplica a todas
// as jornadas ativas do tenant; vídeo exclusivo aplica apenas à jornada dele.
async function syncVideoMissionForEligibleJourneys(video: any) {
  try {
    if (!video || video.status !== "ativo" || video.release_day == null) return;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const todayISO = today.toISOString().slice(0, 10);
    const releaseDay = Number(video.release_day);
    let jq = supabaseAdmin
      .from("client_journeys")
      .select("id, client_id, started_on, status, tenant_id")
      .eq("tenant_id", video.tenant_id)
      .eq("status", "active");
    if (video.journey_id) jq = jq.eq("id", video.journey_id);
    const { data: journeys, error } = await jq;
    if (error) {
      console.error("syncVideoMissionForEligibleJourneys: list journeys", error);
      return;
    }
    for (const j of journeys ?? []) {
      const startISO = String((j as any).started_on).slice(0, 10);
      const start = new Date(`${startISO}T12:00:00-03:00`);
      const ref = new Date(`${todayISO}T12:00:00-03:00`);
      const diff = Math.floor((ref.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
      if (diff !== releaseDay) continue;
      try {
        await supabaseAdmin.rpc("ensure_video_mission", {
          _client_id: (j as any).client_id,
          _journey_id: (j as any).id,
          _day: todayISO,
          _video_id: video.id,
        });
      } catch (err) {
        console.error("ensure_video_mission failed", err);
      }
    }
  } catch (err) {
    console.error("syncVideoMissionForEligibleJourneys failed", err);
  }
}

export const deleteVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    const { error } = await context.supabase
      .from("videos")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit(context, tenantId, "video.delete", "video", data.id, {});
    return { ok: true };
  });


// ---------------------------------------------------------------------------
// EXERCISES
// ---------------------------------------------------------------------------

const exerciseSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default(""),
  videoUrl: z.string().trim().max(500).default(""),
  muscleGroup: z.string().trim().max(60).default("geral"),
  equipment: z.string().trim().max(120).default(""),
  sets: z.number().int().min(1).max(30).default(3),
  reps: z.string().trim().max(40).default("10"),
  status: z.enum(["ativo", "rascunho", "arquivado"]).default("ativo"),
});

function mapExercise(row: any) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    videoUrl: row.video_url ?? "",
    muscleGroup: row.muscle_group ?? "geral",
    equipment: row.equipment ?? "",
    sets: row.sets ?? 3,
    reps: row.reps ?? "10",
    status: row.status,
    createdAt: row.created_at,
  };
}

export const listExercises = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tenantId } = await callerTenant(context);
    const { data, error } = await context.supabase
      .from("exercises")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { exercises: (data ?? []).map(mapExercise) };
  });

export const saveExercise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid().optional(), patch: exerciseSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    const payload = {
      tenant_id: tenantId,
      title: data.patch.title.trim(),
      description: data.patch.description,
      video_url: data.patch.videoUrl,
      muscle_group: data.patch.muscleGroup,
      equipment: data.patch.equipment,
      sets: data.patch.sets,
      reps: data.patch.reps,
      status: data.patch.status,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("exercises")
        .update(payload)
        .eq("tenant_id", tenantId)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      await logAudit(context, tenantId, "exercise.update", "exercise", row.id, {});
      return { exercise: mapExercise(row) };
    } else {
      const { data: row, error } = await context.supabase
        .from("exercises")
        .insert({ ...payload, created_by: context.userId })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      await logAudit(context, tenantId, "exercise.create", "exercise", row.id, {});
      return { exercise: mapExercise(row) };
    }
  });

export const deleteExercise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    const { error } = await context.supabase
      .from("exercises")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit(context, tenantId, "exercise.delete", "exercise", data.id, {});
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// REWARDS
// ---------------------------------------------------------------------------

const rewardSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(160),
  description: z.string().trim().max(2000).default(""),
  costMiles: z.number().int().min(0).max(1000000).default(0),
  milestoneMiles: z.number().int().min(0, "Marco de Milhas obrigatório").max(1000000),
  rewardType: z.enum(["mimo", "sessao", "voucher", "ensaio", "outro"], {
    errorMap: () => ({ message: "Tipo de prêmio obrigatório" }),
  }),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  stock: z.number().int().min(0).max(1000000).default(0),
  status: z.enum(["ativo", "esgotado", "arquivado"]).default("ativo"),
  imageUrl: z.string().trim().max(500).default(""),
});

function mapReward(row: any) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    costMiles: row.cost_miles ?? 0,
    milestoneMiles: row.milestone_miles ?? row.cost_miles ?? 0,
    rewardType: row.reward_type ?? "outro",
    sortOrder: row.sort_order ?? 0,
    stock: row.stock ?? 0,
    status: row.status,
    imageUrl: row.image_url ?? "",
    createdAt: row.created_at,
  };
}

export const listRewards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tenantId } = await callerTenant(context);
    const { data, error } = await context.supabase
      .from("rewards")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true })
      .order("milestone_miles", { ascending: true });
    if (error) throw error;
    return { rewards: (data ?? []).map(mapReward) };
  });

export const saveReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid().optional(), patch: rewardSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    const payload = {
      tenant_id: tenantId,
      name: data.patch.name.trim(),
      description: data.patch.description,
      cost_miles: data.patch.costMiles,
      milestone_miles: data.patch.milestoneMiles,
      reward_type: data.patch.rewardType,
      sort_order: data.patch.sortOrder,
      stock: data.patch.stock,
      status: data.patch.status,
      image_url: data.patch.imageUrl,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("rewards")
        .update(payload)
        .eq("tenant_id", tenantId)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      await logAudit(context, tenantId, "reward.update", "reward", row.id, {});
      return { reward: mapReward(row) };
    } else {
      const { data: row, error } = await context.supabase
        .from("rewards")
        .insert({ ...payload, created_by: context.userId })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      await logAudit(context, tenantId, "reward.create", "reward", row.id, {});
      return { reward: mapReward(row) };
    }
  });

export const deleteReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    const { error } = await context.supabase
      .from("rewards")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit(context, tenantId, "reward.delete", "reward", data.id, {});
    return { ok: true };
  });

export const listRedemptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tenantId } = await callerTenant(context);
    const { data, error } = await context.supabase
      .from("reward_redemptions")
      .select("*, rewards(name), clients(name)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return {
      redemptions: (data ?? []).map((r: any) => ({
        id: r.id,
        rewardId: r.reward_id,
        rewardName: r.rewards?.name ?? "",
        clientId: r.client_id,
        clientName: r.clients?.name ?? "",
        costMiles: r.cost_miles,
        status: r.status,
        notes: r.notes ?? "",
        createdAt: r.created_at,
        decidedAt: r.decided_at,
      })),
    };
  });

export const decideRedemption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["solicitado", "entregue", "cancelado"]),
        notes: z.string().trim().max(500).default(""),
        justification: z.string().trim().max(500).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    const { data: current, error: cErr } = await context.supabase
      .from("reward_redemptions")
      .select("id, client_id, reward_id, status")
      .eq("tenant_id", tenantId)
      .eq("id", data.id)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!current) throw new Error("Resgate não encontrado.");

    const { error } = await context.supabase
      .from("reward_redemptions")
      .update({
        status: data.status,
        notes: data.notes,
        justification: data.justification,
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await context.supabase.from("miles_audit_log").insert({
      tenant_id: tenantId,
      client_id: current.client_id,
      actor_id: context.userId,
      action: `reward.${data.status}`,
      justification: data.justification || data.notes || "",
      payload: { reward_id: current.reward_id, from: current.status, to: data.status },
    });
    await logAudit(context, tenantId, `redemption.${data.status}`, "redemption", data.id, {});
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// ADMIN VIEW — Prêmios e Conquistas de uma cliente
// ---------------------------------------------------------------------------

export const getClientRewardsAdminView = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    const today = new Date().toISOString().slice(0, 10);

    const { data: client, error: cErr } = await context.supabase
      .from("clients")
      .select("id, name, tenant_id, active_journey_id")
      .eq("id", data.clientId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!client) throw new Error("Cliente não encontrada.");
    const journeyId = (client as any).active_journey_id as string | null;

    const [rewardsRes, ledgerRes, redRes, sealsRes, msRes, todayRes, auditRes] = await Promise.all([
      context.supabase
        .from("rewards")
        .select("id, name, milestone_miles, cost_miles, reward_type, sort_order, status")
        .eq("tenant_id", tenantId)
        .order("sort_order", { ascending: true })
        .order("milestone_miles", { ascending: true }),
      journeyId
        ? context.supabase
            .from("miles_ledger")
            .select("id, miles, source_kind, source_ref, reason, occurred_on, created_at")
            .eq("client_id", client.id)
            .eq("journey_id", journeyId)
            .order("created_at", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [] as any[] }),
      journeyId
        ? context.supabase
            .from("reward_redemptions")
            .select("id, reward_id, status, created_at, decided_at, decided_by, justification, notes, rewards(name, milestone_miles, reward_type)")
            .eq("client_id", client.id)
            .eq("journey_id", journeyId)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
      journeyId
        ? context.supabase
            .from("client_seals")
            .select("seal_code, miles_awarded, awarded_at")
            .eq("client_id", client.id)
            .eq("journey_id", journeyId)
        : Promise.resolve({ data: [] as any[] }),
      journeyId
        ? context.supabase
            .from("client_journey_milestones")
            .select("milestone_code, miles_threshold, reached_at")
            .eq("client_id", client.id)
            .eq("journey_id", journeyId)
        : Promise.resolve({ data: [] as any[] }),
      journeyId
        ? context.supabase
            .from("miles_ledger")
            .select("miles")
            .eq("client_id", client.id)
            .eq("journey_id", journeyId)
            .eq("occurred_on", today)
        : Promise.resolve({ data: [] as any[] }),
      context.supabase
        .from("miles_audit_log")
        .select("id, action, justification, payload, created_at, actor_id")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    // Resolve actor display names for audit + redemption decided_by
    const actorIds = new Set<string>();
    for (const r of (redRes.data ?? []) as any[]) if (r.decided_by) actorIds.add(r.decided_by);
    for (const a of (auditRes.data ?? []) as any[]) if (a.actor_id) actorIds.add(a.actor_id);
    let actorMap = new Map<string, string>();
    if (actorIds.size > 0) {
      const { data: actors } = await context.supabase
        .from("profiles")
        .select("id, name")
        .in("id", Array.from(actorIds));
      actorMap = new Map((actors ?? []).map((p: any) => [p.id, p.name ?? ""]));
    }

    const balance = ((ledgerRes.data ?? []) as any[]).reduce((s, r) => s + (r.miles ?? 0), 0);
    const milesToday = ((todayRes.data ?? []) as any[]).reduce((s, r) => s + (r.miles ?? 0), 0);

    const redByReward = new Map<string, any>();
    for (const r of (redRes.data ?? []) as any[]) {
      if (r.status === "cancelado") continue;
      const prev = redByReward.get(r.reward_id);
      if (!prev || new Date(r.created_at) > new Date(prev.created_at)) redByReward.set(r.reward_id, r);
    }

    const rewards = ((rewardsRes.data ?? []) as any[]).map((r) => {
      const threshold = r.milestone_miles ?? r.cost_miles ?? 0;
      const red = redByReward.get(r.id);
      let state: "bloqueado" | "liberado" | "solicitado" | "entregue" = "bloqueado";
      if (red?.status === "entregue") state = "entregue";
      else if (red?.status === "solicitado" || red?.status === "pendente" || red?.status === "aprovado") state = "solicitado";
      else if (balance >= threshold) state = "liberado";
      return {
        id: r.id,
        name: r.name,
        rewardType: r.reward_type,
        milestoneMiles: threshold,
        state,
        missing: Math.max(threshold - balance, 0),
        redemption: red
          ? {
              id: red.id,
              status: red.status,
              createdAt: red.created_at,
              decidedAt: red.decided_at,
              decidedBy: red.decided_by ? actorMap.get(red.decided_by) ?? red.decided_by : null,
              justification: red.justification ?? "",
              notes: red.notes ?? "",
            }
          : null,
      };
    });

    return {
      client: { id: client.id, name: (client as any).name },
      journeyId,
      balance,
      milesToday,
      rewards,
      ledger: (ledgerRes.data ?? []) as any[],

      redemptions: ((redRes.data ?? []) as any[]).map((r) => ({
        id: r.id,
        rewardId: r.reward_id,
        rewardName: r.rewards?.name ?? "",
        status: r.status,
        createdAt: r.created_at,
        decidedAt: r.decided_at,
        decidedBy: r.decided_by ? actorMap.get(r.decided_by) ?? r.decided_by : null,
        justification: r.justification ?? "",
        notes: r.notes ?? "",
      })),
      seals: (sealsRes.data ?? []) as any[],
      milestones: (msRes.data ?? []) as any[],
      audit: ((auditRes.data ?? []) as any[]).map((a) => ({
        id: a.id,
        action: a.action,
        justification: a.justification,
        payload: a.payload,
        createdAt: a.created_at,
        actor: a.actor_id ? actorMap.get(a.actor_id) ?? a.actor_id : null,
      })),
    };
  });

