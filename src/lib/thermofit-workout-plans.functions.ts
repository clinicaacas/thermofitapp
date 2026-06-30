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
  if (!["super_admin", "dono", "admin", "equipe"].includes(role)) {
    throw new Error("Perfil sem permissão para gerenciar treinos.");
  }
  return { tenantId: data.tenant_id as string, role, isSuper: role === "super_admin" };
}

async function ensureClientInTenant(context: Ctx, tenantId: string, clientId: string, isSuper: boolean) {
  const { data, error } = await context.supabase
    .from("clients")
    .select("id, tenant_id, name, active_journey_id")
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Cliente não encontrado.");
  if (!isSuper && data.tenant_id !== tenantId) throw new Error("Cliente fora do seu tenant.");
  return data as { id: string; tenant_id: string; name: string; active_journey_id: string | null };
}

async function ensurePlanInTenant(context: Ctx, tenantId: string, planId: string, isSuper: boolean) {
  const { data, error } = await context.supabase
    .from("workout_plans")
    .select("*")
    .eq("id", planId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Plano não encontrado.");
  if (!isSuper && data.tenant_id !== tenantId) throw new Error("Plano fora do seu tenant.");
  return data;
}

function mapPlan(row: any) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    clientId: row.client_id,
    journeyId: row.journey_id,
    title: row.title,
    description: row.description ?? "",
    status: row.status,
    pdfPath: row.pdf_path,
    pdfUploadedAt: row.pdf_uploaded_at,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

function mapPlanExercise(row: any) {
  const ex = row.exercises ?? row.exercise ?? null;
  return {
    id: row.id,
    planId: row.plan_id,
    exerciseId: row.exercise_id,
    orderIndex: row.order_index,
    sets: row.sets,
    reps: row.reps,
    notes: row.notes ?? "",
    pdfPath: row.pdf_path,
    createdAt: row.created_at,
    exercise: ex
      ? {
          id: ex.id,
          title: ex.title,
          description: ex.description ?? "",
          videoUrl: ex.video_url ?? "",
          muscleGroup: ex.muscle_group ?? "geral",
          equipment: ex.equipment ?? "",
          defaultSets: ex.sets ?? 3,
          defaultReps: ex.reps ?? "10",
          status: ex.status,
          pdfPath: ex.pdf_path,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// LIST plans (central) — one row per client with their latest/current plan
// ---------------------------------------------------------------------------

export const listClientsWithPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tenantId, isSuper } = await callerTenant(context);

    const clientsQuery = context.supabase
      .from("clients")
      .select("id, name, tenant_id, active_journey_id, status, updated_at")
      .order("name", { ascending: true });
    if (!isSuper) clientsQuery.eq("tenant_id", tenantId);
    const { data: clients, error: cErr } = await clientsQuery;
    if (cErr) throw cErr;

    const plansQuery = context.supabase
      .from("workout_plans")
      .select("id, client_id, title, status, updated_at, published_at, updated_by, created_by")
      .order("updated_at", { ascending: false });
    if (!isSuper) plansQuery.eq("tenant_id", tenantId);
    const { data: plans, error: pErr } = await plansQuery;
    if (pErr) throw pErr;

    const byClient = new Map<string, any[]>();
    for (const p of plans ?? []) {
      const arr = byClient.get(p.client_id) ?? [];
      arr.push(p);
      byClient.set(p.client_id, arr);
    }

    const rows = (clients ?? []).map((c: any) => {
      const arr = byClient.get(c.id) ?? [];
      const published = arr.find((x) => x.status === "publicado");
      const current = published ?? arr[0] ?? null;
      return {
        clientId: c.id,
        clientName: c.name,
        tenantId: c.tenant_id,
        journeyId: c.active_journey_id,
        clientStatus: c.status,
        plan: current
          ? {
              id: current.id,
              title: current.title,
              status: current.status,
              updatedAt: current.updated_at,
              publishedAt: current.published_at,
              responsibleId: current.updated_by ?? current.created_by,
            }
          : null,
        planStatus: current?.status ?? "sem_plano",
        plansCount: arr.length,
      };
    });

    return { rows };
  });

// ---------------------------------------------------------------------------
// GET plans for client + selected plan with exercises
// ---------------------------------------------------------------------------

export const getClientPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const client = await ensureClientInTenant(context, tenantId, data.clientId, isSuper);
    const { data: plans, error } = await context.supabase
      .from("workout_plans")
      .select("*")
      .eq("client_id", data.clientId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return {
      client: {
        id: client.id,
        name: client.name,
        tenantId: client.tenant_id,
        activeJourneyId: client.active_journey_id,
      },
      plans: (plans ?? []).map(mapPlan),
    };
  });

export const getPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ planId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const plan = await ensurePlanInTenant(context, tenantId, data.planId, isSuper);
    const { data: items, error } = await context.supabase
      .from("plan_exercises")
      .select("*, exercises:exercise_id (id, title, description, video_url, muscle_group, equipment, sets, reps, status, pdf_path)")
      .eq("plan_id", data.planId)
      .order("order_index", { ascending: true });
    if (error) throw error;
    return { plan: mapPlan(plan), items: (items ?? []).map(mapPlanExercise) };
  });

// ---------------------------------------------------------------------------
// CREATE / UPDATE plan
// ---------------------------------------------------------------------------

const planInput = z.object({
  title: z.string().trim().min(1, "Título obrigatório").max(160),
  description: z.string().trim().max(4000).default(""),
});

export const createPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    planInput.extend({ clientId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const client = await ensureClientInTenant(context, tenantId, data.clientId, isSuper);
    const insertPayload = {
      tenant_id: client.tenant_id,
      client_id: client.id,
      journey_id: client.active_journey_id,
      title: data.title.trim(),
      description: data.description,
      status: "rascunho",
      created_by: context.userId,
      updated_by: context.userId,
    };
    const { data: row, error } = await context.supabase
      .from("workout_plans")
      .insert(insertPayload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { plan: mapPlan(row) };
  });

export const updatePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    planInput.partial().extend({ planId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    await ensurePlanInTenant(context, tenantId, data.planId, isSuper);
    const patch: any = { updated_by: context.userId };
    if (data.title !== undefined) patch.title = data.title.trim();
    if (data.description !== undefined) patch.description = data.description;
    const { data: row, error } = await context.supabase
      .from("workout_plans")
      .update(patch)
      .eq("id", data.planId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { plan: mapPlan(row) };
  });

export const publishPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ planId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const plan = await ensurePlanInTenant(context, tenantId, data.planId, isSuper);
    if (!plan.title || !plan.title.trim()) throw new Error("Defina o título antes de publicar.");
    const { count } = await context.supabase
      .from("plan_exercises")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", data.planId);
    const hasContent = (count ?? 0) > 0 || !!plan.pdf_path || (plan.description && plan.description.trim().length > 0);
    if (!hasContent) throw new Error("Publique apenas planos com exercício, PDF ou orientação geral.");
    const { data: row, error } = await context.supabase
      .from("workout_plans")
      .update({ status: "publicado", published_at: new Date().toISOString(), updated_by: context.userId })
      .eq("id", data.planId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { plan: mapPlan(row) };
  });

export const archivePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ planId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    await ensurePlanInTenant(context, tenantId, data.planId, isSuper);
    const { data: row, error } = await context.supabase
      .from("workout_plans")
      .update({ status: "arquivado", updated_by: context.userId })
      .eq("id", data.planId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { plan: mapPlan(row) };
  });

export const duplicatePlanAsDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ planId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const plan = await ensurePlanInTenant(context, tenantId, data.planId, isSuper);
    const { data: newPlan, error } = await context.supabase
      .from("workout_plans")
      .insert({
        tenant_id: plan.tenant_id,
        client_id: plan.client_id,
        journey_id: plan.journey_id,
        title: `${plan.title} (cópia)`,
        description: plan.description,
        status: "rascunho",
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const { data: items } = await context.supabase
      .from("plan_exercises")
      .select("exercise_id, order_index, sets, reps, notes, pdf_path")
      .eq("plan_id", plan.id);
    if (items && items.length) {
      const rows = items.map((it: any) => ({ ...it, plan_id: newPlan.id }));
      await context.supabase.from("plan_exercises").insert(rows);
    }
    return { plan: mapPlan(newPlan) };
  });

// ---------------------------------------------------------------------------
// PLAN EXERCISES
// ---------------------------------------------------------------------------

export const addPlanExercise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        planId: z.string().uuid(),
        exerciseId: z.string().uuid(),
        sets: z.number().int().min(1).max(30).optional().nullable(),
        reps: z.string().trim().max(40).optional().nullable(),
        notes: z.string().trim().max(2000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const plan = await ensurePlanInTenant(context, tenantId, data.planId, isSuper);
    const { data: ex, error: exErr } = await context.supabase
      .from("exercises")
      .select("id, tenant_id")
      .eq("id", data.exerciseId)
      .maybeSingle();
    if (exErr) throw exErr;
    if (!ex) throw new Error("Exercício não encontrado.");
    if (!isSuper && ex.tenant_id !== plan.tenant_id) throw new Error("Exercício de outro tenant.");

    const { data: maxRow } = await context.supabase
      .from("plan_exercises")
      .select("order_index")
      .eq("plan_id", data.planId)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = ((maxRow?.order_index ?? -1) as number) + 1;

    const { data: row, error } = await context.supabase
      .from("plan_exercises")
      .insert({
        plan_id: data.planId,
        exercise_id: data.exerciseId,
        order_index: nextOrder,
        sets: data.sets ?? null,
        reps: data.reps ?? null,
        notes: data.notes ?? null,
      })
      .select("*, exercises:exercise_id (id, title, description, video_url, muscle_group, equipment, sets, reps, status, pdf_path)")
      .single();
    if (error) throw new Error(error.message);
    await context.supabase
      .from("workout_plans")
      .update({ updated_by: context.userId, updated_at: new Date().toISOString() })
      .eq("id", data.planId);
    return { item: mapPlanExercise(row) };
  });

export const updatePlanExercise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        itemId: z.string().uuid(),
        sets: z.number().int().min(1).max(30).nullable().optional(),
        reps: z.string().trim().max(40).nullable().optional(),
        notes: z.string().trim().max(2000).nullable().optional(),
        orderIndex: z.number().int().min(0).max(10000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const { data: item, error: itemErr } = await context.supabase
      .from("plan_exercises")
      .select("id, plan_id")
      .eq("id", data.itemId)
      .maybeSingle();
    if (itemErr) throw itemErr;
    if (!item) throw new Error("Item não encontrado.");
    await ensurePlanInTenant(context, tenantId, item.plan_id, isSuper);
    const patch: any = {};
    if (data.sets !== undefined) patch.sets = data.sets;
    if (data.reps !== undefined) patch.reps = data.reps;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.orderIndex !== undefined) patch.order_index = data.orderIndex;
    const { data: row, error } = await context.supabase
      .from("plan_exercises")
      .update(patch)
      .eq("id", data.itemId)
      .select("*, exercises:exercise_id (id, title, description, video_url, muscle_group, equipment, sets, reps, status, pdf_path)")
      .single();
    if (error) throw new Error(error.message);
    return { item: mapPlanExercise(row) };
  });

export const removePlanExercise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ itemId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const { data: item } = await context.supabase
      .from("plan_exercises")
      .select("id, plan_id")
      .eq("id", data.itemId)
      .maybeSingle();
    if (!item) throw new Error("Item não encontrado.");
    await ensurePlanInTenant(context, tenantId, item.plan_id, isSuper);
    const { error } = await context.supabase.from("plan_exercises").delete().eq("id", data.itemId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderPlanExercises = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        planId: z.string().uuid(),
        order: z.array(z.string().uuid()).min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    await ensurePlanInTenant(context, tenantId, data.planId, isSuper);
    for (let i = 0; i < data.order.length; i++) {
      await context.supabase
        .from("plan_exercises")
        .update({ order_index: i })
        .eq("id", data.order[i])
        .eq("plan_id", data.planId);
    }
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// PDF upload (server-side, base64) and signed URL
// ---------------------------------------------------------------------------

const pdfPayload = z.object({
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).max(120),
  base64: z.string().min(1).max(20_000_000),
});

function assertPdf(mime: string, name: string) {
  const lower = name.toLowerCase();
  if (mime !== "application/pdf" || !lower.endsWith(".pdf")) {
    throw new Error("Envie apenas arquivos PDF.");
  }
}

function decodeBase64(b64: string) {
  const cleaned = b64.includes(",") ? b64.split(",")[1] : b64;
  return Buffer.from(cleaned, "base64");
}

export const uploadPlanPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    pdfPayload.extend({ planId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const plan = await ensurePlanInTenant(context, tenantId, data.planId, isSuper);
    assertPdf(data.mimeType, data.fileName);
    const buf = decodeBase64(data.base64);
    if (buf.length > 15 * 1024 * 1024) throw new Error("PDF acima de 15MB.");
    const key = `${plan.tenant_id}/plans/${plan.id}/${Date.now()}-${data.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.storage.from("workout-materials").upload(key, buf, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upErr) throw new Error(upErr.message);
    const { data: row, error } = await context.supabase
      .from("workout_plans")
      .update({ pdf_path: key, pdf_uploaded_at: new Date().toISOString(), updated_by: context.userId })
      .eq("id", plan.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { plan: mapPlan(row) };
  });

export const removePlanPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ planId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const plan = await ensurePlanInTenant(context, tenantId, data.planId, isSuper);
    if (!plan.pdf_path) return { plan: mapPlan(plan) };
    const { data: row, error } = await context.supabase
      .from("workout_plans")
      .update({ pdf_path: null, pdf_uploaded_at: null, updated_by: context.userId })
      .eq("id", plan.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { plan: mapPlan(row) };
  });

export const uploadPlanExercisePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    pdfPayload.extend({ itemId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const { data: item } = await context.supabase
      .from("plan_exercises")
      .select("id, plan_id")
      .eq("id", data.itemId)
      .maybeSingle();
    if (!item) throw new Error("Item não encontrado.");
    const plan = await ensurePlanInTenant(context, tenantId, item.plan_id, isSuper);
    assertPdf(data.mimeType, data.fileName);
    const buf = decodeBase64(data.base64);
    if (buf.length > 15 * 1024 * 1024) throw new Error("PDF acima de 15MB.");
    const key = `${plan.tenant_id}/plans/${plan.id}/items/${item.id}-${Date.now()}-${data.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.storage.from("workout-materials").upload(key, buf, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upErr) throw new Error(upErr.message);
    const { data: row, error } = await context.supabase
      .from("plan_exercises")
      .update({ pdf_path: key })
      .eq("id", item.id)
      .select("*, exercises:exercise_id (id, title, description, video_url, muscle_group, equipment, sets, reps, status, pdf_path)")
      .single();
    if (error) throw new Error(error.message);
    return { item: mapPlanExercise(row) };
  });

export const removePlanExercisePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ itemId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const { data: item } = await context.supabase
      .from("plan_exercises")
      .select("id, plan_id")
      .eq("id", data.itemId)
      .maybeSingle();
    if (!item) throw new Error("Item não encontrado.");
    await ensurePlanInTenant(context, tenantId, item.plan_id, isSuper);
    const { data: row, error } = await context.supabase
      .from("plan_exercises")
      .update({ pdf_path: null })
      .eq("id", item.id)
      .select("*, exercises:exercise_id (id, title, description, video_url, muscle_group, equipment, sets, reps, status, pdf_path)")
      .single();
    if (error) throw new Error(error.message);
    return { item: mapPlanExercise(row) };
  });

export const signWorkoutMaterialUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ path: z.string().min(3).max(500), expiresIn: z.number().int().min(60).max(86400).default(3600) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const parts = data.path.split("/");
    if (parts.length < 3) throw new Error("Caminho inválido.");
    if (!isSuper && parts[0] !== tenantId) throw new Error("Sem acesso a este arquivo.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("workout-materials")
      .createSignedUrl(data.path, data.expiresIn);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

// ---------------------------------------------------------------------------
// Same-origin PDF viewer token (avoids ERR_BLOCKED_BY_CLIENT on supabase.co).
// Used by both admin and client final. Token is short-lived (10 min), HMAC-signed.
// Open with: /api/public/materiais/treino?t=<token>[&dl=1]
// ---------------------------------------------------------------------------

export const mintWorkoutMaterialToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ path: z.string().min(3).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    const parts = data.path.split("/");
    if (parts.length < 3 || parts[1] !== "plans") throw new Error("Caminho inválido.");
    const tenantId = parts[0];
    const planId = parts[2];

    // 1) Staff (super or active member of the plan's tenant)
    const { data: prof } = await context.supabase
      .from("profiles")
      .select("tenant_id, profile, status")
      .eq("id", context.userId)
      .maybeSingle();
    let allowed = false;
    if (prof && prof.status === "ativo") {
      const role = prof.profile as string;
      if (role === "super_admin") allowed = true;
      else if (["dono", "admin", "equipe"].includes(role) && prof.tenant_id === tenantId) allowed = true;
    }

    // 2) Client final owning a published plan that references this path
    if (!allowed) {
      const { data: cli } = await context.supabase
        .from("clients")
        .select("id")
        .eq("auth_user_id", context.userId)
        .maybeSingle();
      if (cli) {
        const { data: plan } = await context.supabase
          .from("workout_plans")
          .select("id, status, client_id, tenant_id, pdf_path")
          .eq("id", planId)
          .maybeSingle();
        if (plan && plan.status === "publicado" && plan.client_id === cli.id && plan.tenant_id === tenantId) {
          if (plan.pdf_path === data.path) allowed = true;
          else {
            const { data: item } = await context.supabase
              .from("plan_exercises")
              .select("id")
              .eq("plan_id", planId)
              .eq("pdf_path", data.path)
              .maybeSingle();
            if (item) allowed = true;
          }
        }
      }
    }

    if (!allowed) throw new Error("Sem acesso ao material.");

    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!secret) throw new Error("Servidor sem chave de assinatura.");
    const exp = Math.floor(Date.now() / 1000) + 600;
    const payloadB64 = Buffer.from(JSON.stringify({ p: data.path, e: exp })).toString("base64url");
    const { createHmac } = await import("crypto");
    const sig = createHmac("sha256", secret).update(payloadB64).digest("hex");
    return { token: `${payloadB64}.${sig}`, expiresAt: exp };
  });
