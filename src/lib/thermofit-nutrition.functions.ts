import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

const BUCKET = "nutrition-materials";

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
    throw new Error("Perfil sem permissão para gerenciar nutrição.");
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
  if (!data) throw new Error("Cliente não encontrada.");
  if (!isSuper && data.tenant_id !== tenantId) throw new Error("Cliente fora do seu tenant.");
  return data as { id: string; tenant_id: string; name: string; active_journey_id: string | null };
}

async function ensurePlanInTenant(context: Ctx, tenantId: string, planId: string, isSuper: boolean) {
  const { data, error } = await context.supabase
    .from("nutrition_plans")
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
    generalGuidance: row.general_guidance ?? "",
    status: row.status as "rascunho" | "publicado" | "arquivado",
    mainPdfPath: row.main_pdf_path,
    mainPdfUploadedAt: row.main_pdf_uploaded_at,
    publishedAt: row.published_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

function mapPlanMaterial(row: any) {
  const lib = row.library ?? row.nutrition_library_materials ?? null;
  return {
    id: row.id,
    planId: row.plan_id,
    origin: row.origin as "exclusivo" | "biblioteca",
    libraryMaterialId: row.library_material_id,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    displayTitle: row.display_title,
    note: row.note,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    library: lib
      ? {
          id: lib.id,
          title: lib.title,
          category: lib.category,
          description: lib.description ?? "",
          storagePath: lib.storage_path,
          status: lib.status,
        }
      : null,
  };
}

function mapLibrary(row: any) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    title: row.title,
    category: row.category,
    description: row.description ?? "",
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    status: row.status as "ativo" | "arquivado",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ----------------------------------------------------------------------
// Central admin: clients overview
// ----------------------------------------------------------------------
export const listNutritionClientsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const cq = context.supabase
      .from("clients")
      .select("id, name, tenant_id, active_journey_id, status, updated_at")
      .order("name", { ascending: true });
    if (!isSuper) cq.eq("tenant_id", tenantId);
    const { data: clients, error: cErr } = await cq;
    if (cErr) throw cErr;

    const pq = context.supabase
      .from("nutrition_plans")
      .select("id, client_id, title, status, updated_at, published_at, updated_by, created_by")
      .order("updated_at", { ascending: false });
    if (!isSuper) pq.eq("tenant_id", tenantId);
    const { data: plans, error: pErr } = await pq;
    if (pErr) throw pErr;

    const byClient = new Map<string, any[]>();
    for (const p of plans ?? []) {
      const a = byClient.get(p.client_id) ?? [];
      a.push(p);
      byClient.set(p.client_id, a);
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

// ----------------------------------------------------------------------
// Plans for client + selected plan
// ----------------------------------------------------------------------
export const getNutritionPlansForClient = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const client = await ensureClientInTenant(context, tenantId, data.clientId, isSuper);
    const { data: plans, error } = await context.supabase
      .from("nutrition_plans")
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

export const getNutritionPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ planId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const plan = await ensurePlanInTenant(context, tenantId, data.planId, isSuper);
    const { data: items, error } = await context.supabase
      .from("nutrition_plan_materials")
      .select("*, library:library_material_id (id, title, category, description, storage_path, status)")
      .eq("plan_id", data.planId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return { plan: mapPlan(plan), materials: (items ?? []).map(mapPlanMaterial) };
  });

// ----------------------------------------------------------------------
// Plan CRUD
// ----------------------------------------------------------------------
const planInput = z.object({
  title: z.string().trim().min(1, "Título obrigatório").max(160),
  generalGuidance: z.string().trim().max(8000).default(""),
});

export const createNutritionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => planInput.extend({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const client = await ensureClientInTenant(context, tenantId, data.clientId, isSuper);
    const { data: row, error } = await context.supabase
      .from("nutrition_plans")
      .insert({
        tenant_id: client.tenant_id,
        client_id: client.id,
        journey_id: client.active_journey_id,
        title: data.title.trim(),
        general_guidance: data.generalGuidance,
        status: "rascunho",
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { plan: mapPlan(row) };
  });

export const updateNutritionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => planInput.partial().extend({ planId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    await ensurePlanInTenant(context, tenantId, data.planId, isSuper);
    const patch: any = { updated_by: context.userId };
    if (data.title !== undefined) patch.title = data.title.trim();
    if (data.generalGuidance !== undefined) patch.general_guidance = data.generalGuidance;
    const { data: row, error } = await context.supabase
      .from("nutrition_plans")
      .update(patch)
      .eq("id", data.planId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { plan: mapPlan(row) };
  });

export const publishNutritionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ planId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const plan = await ensurePlanInTenant(context, tenantId, data.planId, isSuper);
    if (!plan.title?.trim()) throw new Error("Defina o título antes de publicar.");
    const { count } = await context.supabase
      .from("nutrition_plan_materials")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", data.planId);
    const hasContent =
      (count ?? 0) > 0 ||
      !!plan.main_pdf_path ||
      (plan.general_guidance && plan.general_guidance.trim().length > 0);
    if (!hasContent) throw new Error("Publique apenas planos com PDF, orientação ou material vinculado.");
    const { data: row, error } = await context.supabase
      .from("nutrition_plans")
      .update({
        status: "publicado",
        published_at: new Date().toISOString(),
        updated_by: context.userId,
      })
      .eq("id", data.planId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { plan: mapPlan(row) };
  });

export const archiveNutritionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ planId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    await ensurePlanInTenant(context, tenantId, data.planId, isSuper);
    const { data: row, error } = await context.supabase
      .from("nutrition_plans")
      .update({ status: "arquivado", updated_by: context.userId })
      .eq("id", data.planId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { plan: mapPlan(row) };
  });

export const duplicateNutritionPlanAsDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ planId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const plan = await ensurePlanInTenant(context, tenantId, data.planId, isSuper);
    const { data: newPlan, error } = await context.supabase
      .from("nutrition_plans")
      .insert({
        tenant_id: plan.tenant_id,
        client_id: plan.client_id,
        journey_id: plan.journey_id,
        title: `${plan.title} (cópia)`,
        general_guidance: plan.general_guidance,
        status: "rascunho",
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    // Copy material references (biblioteca only; exclusive PDFs aren't re-uploaded automatically)
    const { data: items } = await context.supabase
      .from("nutrition_plan_materials")
      .select("library_material_id, display_title, note, sort_order, origin, storage_path, mime_type, size_bytes, tenant_id")
      .eq("plan_id", plan.id)
      .eq("origin", "biblioteca");
    if (items && items.length) {
      const rows = items.map((it: any) => ({ ...it, plan_id: newPlan.id, tenant_id: plan.tenant_id }));
      await context.supabase.from("nutrition_plan_materials").insert(rows);
    }
    return { plan: mapPlan(newPlan) };
  });

// ----------------------------------------------------------------------
// PDF upload (main and exclusive)
// ----------------------------------------------------------------------
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
function assertPdfBytes(buf: Buffer) {
  if (buf.length < 5 || buf.slice(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("Arquivo enviado não é um PDF válido.");
  }
}
function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export const uploadNutritionMainPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => pdfPayload.extend({ planId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const plan = await ensurePlanInTenant(context, tenantId, data.planId, isSuper);
    assertPdf(data.mimeType, data.fileName);
    const buf = decodeBase64(data.base64);
    if (buf.length > 15 * 1024 * 1024) throw new Error("PDF acima de 15MB.");
    assertPdfBytes(buf);
    const key = `${plan.tenant_id}/plans/${plan.id}/main-${Date.now()}-${safeName(data.fileName)}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(key, buf, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upErr) throw new Error(upErr.message);
    const { data: row, error } = await context.supabase
      .from("nutrition_plans")
      .update({
        main_pdf_path: key,
        main_pdf_uploaded_at: new Date().toISOString(),
        updated_by: context.userId,
      })
      .eq("id", plan.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { plan: mapPlan(row) };
  });

export const removeNutritionMainPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ planId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const plan = await ensurePlanInTenant(context, tenantId, data.planId, isSuper);
    if (!plan.main_pdf_path) return { plan: mapPlan(plan) };
    const { data: row, error } = await context.supabase
      .from("nutrition_plans")
      .update({ main_pdf_path: null, main_pdf_uploaded_at: null, updated_by: context.userId })
      .eq("id", plan.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { plan: mapPlan(row) };
  });

// ----------------------------------------------------------------------
// Library CRUD
// ----------------------------------------------------------------------
const libraryInput = z.object({
  title: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(60).default("outros"),
  description: z.string().trim().max(4000).default(""),
});

export const listNutritionLibrary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ status: z.enum(["ativo", "arquivado", "todos"]).default("ativo") }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    let q = context.supabase
      .from("nutrition_library_materials")
      .select("*")
      .order("updated_at", { ascending: false });
    if (!isSuper) q = q.eq("tenant_id", tenantId);
    if (data.status !== "todos") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    return { items: (rows ?? []).map(mapLibrary) };
  });

export const createNutritionLibraryMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => libraryInput.parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    if (isSuper && !tenantId) throw new Error("Super admin precisa de tenant ativo para criar material.");
    const { data: row, error } = await context.supabase
      .from("nutrition_library_materials")
      .insert({
        tenant_id: tenantId,
        title: data.title,
        category: data.category,
        description: data.description,
        status: "ativo",
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { material: mapLibrary(row) };
  });

export const updateNutritionLibraryMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => libraryInput.partial().extend({ materialId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const { data: row, error: fetchErr } = await context.supabase
      .from("nutrition_library_materials")
      .select("*")
      .eq("id", data.materialId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!row) throw new Error("Material não encontrado.");
    if (!isSuper && row.tenant_id !== tenantId) throw new Error("Material fora do seu tenant.");
    const patch: any = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.category !== undefined) patch.category = data.category;
    if (data.description !== undefined) patch.description = data.description;
    const { data: upd, error } = await context.supabase
      .from("nutrition_library_materials")
      .update(patch)
      .eq("id", data.materialId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { material: mapLibrary(upd) };
  });

export const archiveNutritionLibraryMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ materialId: z.string().uuid(), status: z.enum(["ativo", "arquivado"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const { data: row } = await context.supabase
      .from("nutrition_library_materials")
      .select("id, tenant_id")
      .eq("id", data.materialId)
      .maybeSingle();
    if (!row) throw new Error("Material não encontrado.");
    if (!isSuper && row.tenant_id !== tenantId) throw new Error("Material fora do seu tenant.");
    const { data: upd, error } = await context.supabase
      .from("nutrition_library_materials")
      .update({ status: data.status })
      .eq("id", data.materialId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { material: mapLibrary(upd) };
  });

export const uploadNutritionLibraryPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => pdfPayload.extend({ materialId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const { data: mat } = await context.supabase
      .from("nutrition_library_materials")
      .select("*")
      .eq("id", data.materialId)
      .maybeSingle();
    if (!mat) throw new Error("Material não encontrado.");
    if (!isSuper && mat.tenant_id !== tenantId) throw new Error("Material fora do seu tenant.");
    assertPdf(data.mimeType, data.fileName);
    const buf = decodeBase64(data.base64);
    if (buf.length > 15 * 1024 * 1024) throw new Error("PDF acima de 15MB.");
    assertPdfBytes(buf);
    const key = `${mat.tenant_id}/library/${mat.id}/${Date.now()}-${safeName(data.fileName)}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(key, buf, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upErr) throw new Error(upErr.message);
    const { data: upd, error } = await context.supabase
      .from("nutrition_library_materials")
      .update({ storage_path: key, mime_type: "application/pdf", size_bytes: buf.length })
      .eq("id", mat.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { material: mapLibrary(upd) };
  });

// ----------------------------------------------------------------------
// Plan materials
// ----------------------------------------------------------------------
export const attachLibraryMaterialToPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        planId: z.string().uuid(),
        libraryMaterialId: z.string().uuid(),
        displayTitle: z.string().trim().max(160).optional().nullable(),
        note: z.string().trim().max(2000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const plan = await ensurePlanInTenant(context, tenantId, data.planId, isSuper);
    const { data: lib } = await context.supabase
      .from("nutrition_library_materials")
      .select("id, tenant_id, status")
      .eq("id", data.libraryMaterialId)
      .maybeSingle();
    if (!lib) throw new Error("Material da biblioteca não encontrado.");
    if (!isSuper && lib.tenant_id !== plan.tenant_id) throw new Error("Material de outro tenant.");
    if (lib.status !== "ativo") throw new Error("Material arquivado não pode ser vinculado.");
    const { data: maxRow } = await context.supabase
      .from("nutrition_plan_materials")
      .select("sort_order")
      .eq("plan_id", data.planId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = ((maxRow?.sort_order ?? -1) as number) + 1;
    const { data: row, error } = await context.supabase
      .from("nutrition_plan_materials")
      .insert({
        tenant_id: plan.tenant_id,
        plan_id: plan.id,
        library_material_id: lib.id,
        origin: "biblioteca",
        display_title: data.displayTitle ?? null,
        note: data.note ?? null,
        sort_order: nextOrder,
        created_by: context.userId,
      })
      .select("*, library:library_material_id (id, title, category, description, storage_path, status)")
      .single();
    if (error) throw new Error(error.message);
    return { material: mapPlanMaterial(row) };
  });

export const attachExclusiveMaterialToPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    pdfPayload.extend({
      planId: z.string().uuid(),
      displayTitle: z.string().trim().min(1).max(160),
      note: z.string().trim().max(2000).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const plan = await ensurePlanInTenant(context, tenantId, data.planId, isSuper);
    assertPdf(data.mimeType, data.fileName);
    const buf = decodeBase64(data.base64);
    if (buf.length > 15 * 1024 * 1024) throw new Error("PDF acima de 15MB.");
    assertPdfBytes(buf);
    const matId = crypto.randomUUID();
    const key = `${plan.tenant_id}/plans/${plan.id}/materials/${matId}-${Date.now()}-${safeName(data.fileName)}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(key, buf, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upErr) throw new Error(upErr.message);
    const { data: maxRow } = await context.supabase
      .from("nutrition_plan_materials")
      .select("sort_order")
      .eq("plan_id", data.planId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = ((maxRow?.sort_order ?? -1) as number) + 1;
    const { data: row, error } = await context.supabase
      .from("nutrition_plan_materials")
      .insert({
        id: matId,
        tenant_id: plan.tenant_id,
        plan_id: plan.id,
        origin: "exclusivo",
        storage_path: key,
        mime_type: "application/pdf",
        size_bytes: buf.length,
        display_title: data.displayTitle,
        note: data.note ?? null,
        sort_order: nextOrder,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { material: mapPlanMaterial(row) };
  });

export const updateNutritionPlanMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        planMaterialId: z.string().uuid(),
        displayTitle: z.string().trim().max(160).nullable().optional(),
        note: z.string().trim().max(2000).nullable().optional(),
        sortOrder: z.number().int().min(0).max(10000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const { data: row } = await context.supabase
      .from("nutrition_plan_materials")
      .select("id, plan_id, tenant_id")
      .eq("id", data.planMaterialId)
      .maybeSingle();
    if (!row) throw new Error("Material do plano não encontrado.");
    if (!isSuper && row.tenant_id !== tenantId) throw new Error("Material fora do seu tenant.");
    const patch: any = {};
    if (data.displayTitle !== undefined) patch.display_title = data.displayTitle;
    if (data.note !== undefined) patch.note = data.note;
    if (data.sortOrder !== undefined) patch.sort_order = data.sortOrder;
    const { data: upd, error } = await context.supabase
      .from("nutrition_plan_materials")
      .update(patch)
      .eq("id", data.planMaterialId)
      .select("*, library:library_material_id (id, title, category, description, storage_path, status)")
      .single();
    if (error) throw new Error(error.message);
    return { material: mapPlanMaterial(upd) };
  });

export const removeNutritionPlanMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ planMaterialId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, isSuper } = await callerTenant(context);
    const { data: row } = await context.supabase
      .from("nutrition_plan_materials")
      .select("id, tenant_id, origin, storage_path")
      .eq("id", data.planMaterialId)
      .maybeSingle();
    if (!row) throw new Error("Material do plano não encontrado.");
    if (!isSuper && row.tenant_id !== tenantId) throw new Error("Material fora do seu tenant.");
    const { error } = await context.supabase
      .from("nutrition_plan_materials")
      .delete()
      .eq("id", data.planMaterialId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ----------------------------------------------------------------------
// App da Cliente — leitura segura
// ----------------------------------------------------------------------
export const getClientNutritionPlanForApp = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // authorize: client themselves, or tenant staff (for preview)
    const { data: prof } = await context.supabase
      .from("profiles")
      .select("tenant_id, profile, status")
      .eq("id", context.userId)
      .maybeSingle();
    const { data: client, error: cErr } = await context.supabase
      .from("clients")
      .select("id, name, tenant_id, auth_user_id, active_journey_id")
      .eq("id", data.clientId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!client) throw new Error("Cliente não encontrada.");

    const isSelf = client.auth_user_id === context.userId;
    const role = (prof?.profile ?? "") as string;
    const isStaff =
      prof?.status === "ativo" &&
      (role === "super_admin" ||
        (["dono", "admin", "equipe"].includes(role) && prof.tenant_id === client.tenant_id));
    if (!isSelf && !isStaff) throw new Error("Sem acesso ao plano desta cliente.");

    const { data: plan, error: pErr } = await context.supabase
      .from("nutrition_plans")
      .select("*")
      .eq("client_id", client.id)
      .eq("status", "publicado")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pErr) throw pErr;

    if (!plan) {
      return {
        client: { id: client.id, name: client.name, tenantId: client.tenant_id },
        plan: null,
        materials: [],
      };
    }

    const { data: mats } = await context.supabase
      .from("nutrition_plan_materials")
      .select("*, library:library_material_id (id, title, category, description, storage_path, status)")
      .eq("plan_id", plan.id)
      .order("sort_order", { ascending: true });

    return {
      client: { id: client.id, name: client.name, tenantId: client.tenant_id },
      plan: mapPlan(plan),
      materials: (mats ?? []).map(mapPlanMaterial),
    };
  });

// ----------------------------------------------------------------------
// PDF fetcher — sessão autenticada, sem URL pública
// ----------------------------------------------------------------------
export const fetchNutritionMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ path: z.string().min(3).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    const parts = data.path.split("/");
    if (parts.length < 3) throw new Error("Caminho inválido.");
    const tenantId = parts[0];
    const kind = parts[1]; // 'plans' | 'library'
    const refId = parts[2];

    // 1) Staff or super admin
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

    // 2) Client final
    if (!allowed) {
      const { data: cli } = await context.supabase
        .from("clients")
        .select("id")
        .eq("auth_user_id", context.userId)
        .maybeSingle();
      if (cli) {
        if (kind === "plans") {
          const { data: plan } = await context.supabase
            .from("nutrition_plans")
            .select("id, status, client_id, tenant_id, main_pdf_path")
            .eq("id", refId)
            .maybeSingle();
          if (plan && plan.status === "publicado" && plan.client_id === cli.id && plan.tenant_id === tenantId) {
            if (plan.main_pdf_path === data.path) allowed = true;
            else {
              const { data: mat } = await context.supabase
                .from("nutrition_plan_materials")
                .select("id, storage_path, library_material_id")
                .eq("plan_id", refId)
                .or(`storage_path.eq.${data.path},library_material_id.not.is.null`);
              if (mat && mat.length) {
                for (const m of mat) {
                  if (m.storage_path === data.path) {
                    allowed = true;
                    break;
                  }
                  if (m.library_material_id) {
                    const { data: lib } = await context.supabase
                      .from("nutrition_library_materials")
                      .select("storage_path")
                      .eq("id", m.library_material_id)
                      .maybeSingle();
                    if (lib?.storage_path === data.path) {
                      allowed = true;
                      break;
                    }
                  }
                }
              }
            }
          }
        } else if (kind === "library") {
          // client may read library only if referenced by own published plan
          const { data: lib } = await context.supabase
            .from("nutrition_library_materials")
            .select("id, storage_path, tenant_id")
            .eq("id", refId)
            .maybeSingle();
          if (lib && lib.storage_path === data.path) {
            const { data: ref } = await context.supabase
              .from("nutrition_plan_materials")
              .select("plan_id")
              .eq("library_material_id", lib.id);
            if (ref && ref.length) {
              const planIds = ref.map((r: any) => r.plan_id);
              const { data: pubPlans } = await context.supabase
                .from("nutrition_plans")
                .select("id")
                .in("id", planIds)
                .eq("status", "publicado")
                .eq("client_id", cli.id);
              if (pubPlans && pubPlans.length) allowed = true;
            }
          }
        }
      }
    }

    if (!allowed) throw new Error("Sem acesso ao material.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: file, error } = await supabaseAdmin.storage.from(BUCKET).download(data.path);
    if (error || !file) throw new Error("Arquivo não encontrado.");
    const buf = Buffer.from(await file.arrayBuffer());
    const filename = (data.path.split("/").pop() || "material.pdf").replace(/[^a-zA-Z0-9._-]+/g, "_");
    return {
      base64: buf.toString("base64"),
      contentType: "application/pdf",
      filename,
    };
  });
