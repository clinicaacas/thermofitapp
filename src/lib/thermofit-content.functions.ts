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
});


function mapVideo(row: any, signedThumb?: string | null) {
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
    const signed = await Promise.all(
      rows.map((r: any) =>
        r.thumbnail_storage_key ? signThumb(context.supabase, r.thumbnail_storage_key) : Promise.resolve(null),
      ),
    );
    return { videos: rows.map((r: any, i: number) => mapVideo(r, signed[i])) };
  });


export const saveVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid().optional(), patch: videoSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    const payload: any = {
      tenant_id: tenantId,
      title: data.patch.title.trim(),
      description: data.patch.description,
      url: data.patch.url,
      thumbnail_url: data.patch.thumbnailUrl,
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
      await logAudit(context, tenantId, "video.update", "video", row.id, {});
      return { video: mapVideo(row) };
    } else {
      const { data: row, error } = await context.supabase
        .from("videos")
        .insert({ ...payload, created_by: context.userId })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      await logAudit(context, tenantId, "video.create", "video", row.id, {});
      return { video: mapVideo(row) };
    }
  });

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
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default(""),
  costMiles: z.number().int().min(0).max(1000000).default(0),
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
      .order("created_at", { ascending: false });
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
        status: z.enum(["entregue", "cancelado"]),
        notes: z.string().trim().max(500).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    const { error } = await context.supabase
      .from("reward_redemptions")
      .update({
        status: data.status,
        notes: data.notes,
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit(context, tenantId, `redemption.${data.status}`, "redemption", data.id, {});
    return { ok: true };
  });
