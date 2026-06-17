import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEFAULT_SETTINGS = {
  eyebrow: "MÉTODO THERMOFIT",
  title_first: "Cintura",
  title_second: "Ativa",
  subtitle: "Core de dentro pra fora — protocolo completo",
  practice_tab_label: "Praticar",
  guide_tab_label: "Guia Completo",
  card_eyebrow: "PROTOCOLO COMPLETO",
  card_title: "Treino Cintura Ativa",
  card_subtitle: "5 exercícios · 3 séries cada",
  estimated_time: "~10 min",
  button_text: "Começar Treino",
  skip_guide_text: "Pular guia e ir direto para a prática",
  finish_guide_text: "Começar a Praticar",
};

const DEFAULT_EXERCISES = [
  { name: "Respiração Diafragmática", short_description: "Aquecimento", prescription_text: "3x20s" },
  { name: "Vácuo Cintura Ativa", short_description: "Exercício Central", prescription_text: "3x10s" },
  { name: "Bird-Dog", short_description: "Estabilização", prescription_text: "3x30s" },
  { name: "Dead Bug", short_description: "Core Profundo", prescription_text: "3x30s" },
  { name: "Prancha Cintura Ativa", short_description: "Força Final", prescription_text: "3x25s" },
];

const DEFAULT_GUIDE_PAGES = [
  "Mapa Cintura Ativa",
  "Por que o abdominal tradicional não funciona",
  "Teste de Diástase",
  "As 4 Camadas do Core",
  "Respiração Diafragmática",
  "Vácuo Cintura Ativa",
  "Bird-Dog",
  "Dead Bug",
  "Prancha Cintura Ativa",
  "Calendário Semanal",
  "O que esperar — semana a semana",
  "Método Cintura Ativa — Mapa Completo",
];

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

async function ensureSeed(tenantId: string) {
  const admin = await getAdmin();
  const [s, e, p] = await Promise.all([
    admin.from("vacuum_settings").select("id").eq("tenant_id", tenantId).maybeSingle(),
    admin.from("vacuum_exercises").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    admin.from("vacuum_guide_pages").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
  ]);
  if (!s.data) {
    await admin.from("vacuum_settings").insert({ tenant_id: tenantId, ...DEFAULT_SETTINGS });
  }
  if (!e.count) {
    await admin.from("vacuum_exercises").insert(
      DEFAULT_EXERCISES.map((x, i) => ({ tenant_id: tenantId, order_index: i, status: "ativo", ...x })),
    );
  }
  if (!p.count) {
    await admin.from("vacuum_guide_pages").insert(
      DEFAULT_GUIDE_PAGES.map((title, i) => ({
        tenant_id: tenantId,
        order_index: i,
        title,
        status: "ativo",
        alt_text: title,
      })),
    );
  }
}

async function signKey(key: string | null | undefined): Promise<string | null> {
  if (!key) return null;
  if (/^https?:\/\//i.test(key)) return key;
  const admin = await getAdmin();
  const { data } = await admin.storage.from("vacuum-assets").createSignedUrl(key, 3600);
  return data?.signedUrl ?? null;
}

async function loadAll(tenantId: string, opts: { onlyActive: boolean }) {
  const admin = await getAdmin();
  await ensureSeed(tenantId);
  const [s, e, p] = await Promise.all([
    admin.from("vacuum_settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
    (opts.onlyActive
      ? admin.from("vacuum_exercises").select("*").eq("tenant_id", tenantId).eq("status", "ativo")
      : admin.from("vacuum_exercises").select("*").eq("tenant_id", tenantId)
    ).order("order_index", { ascending: true }),
    (opts.onlyActive
      ? admin.from("vacuum_guide_pages").select("*").eq("tenant_id", tenantId).eq("status", "ativo")
      : admin.from("vacuum_guide_pages").select("*").eq("tenant_id", tenantId)
    ).order("order_index", { ascending: true }),
  ]);
  if (s.error) throw s.error;
  if (e.error) throw e.error;
  if (p.error) throw p.error;
  const exercises = await Promise.all(
    (e.data ?? []).map(async (r: any) => ({ ...r, thumbnail_signed_url: await signKey(r.thumbnail_url) })),
  );
  const pages = await Promise.all(
    (p.data ?? []).map(async (r: any) => ({ ...r, image_signed_url: await signKey(r.image_url) })),
  );
  return { settings: s.data ?? { tenant_id: tenantId, ...DEFAULT_SETTINGS }, exercises, pages };
}

// ============ CLIENT (public, by clientId) ============

export const getVacuumDataForClient = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    return loadAll(client.tenant_id, { onlyActive: true });
  });

export const logVacuumEvent = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        clientId: z.string().uuid(),
        eventType: z.string().trim().min(1).max(60),
        metadata: z.record(z.string(), z.any()).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const client = await loadClient(data.clientId);
    const admin = await getAdmin();
    const { error } = await admin.from("client_vacuum_events").insert({
      tenant_id: client.tenant_id,
      client_id: client.id,
      event_type: data.eventType,
      metadata: data.metadata ?? {},
    });
    if (error) throw error;
    return { ok: true };
  });

// ============ ADMIN (auth + manager) ============

type Ctx = { supabase: any; userId: string };

async function callerManagerTenant(context: Ctx) {
  const { data, error } = await context.supabase
    .from("profiles")
    .select("tenant_id, profile, status")
    .eq("id", context.userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "ativo") throw new Error("Sem acesso.");
  const role = data.profile as string;
  if (!["super_admin", "dono", "admin"].includes(role)) {
    throw new Error("Apenas administradores podem editar.");
  }
  return { tenantId: data.tenant_id as string };
}

async function callerAnyTenant(context: Ctx) {
  const { data, error } = await context.supabase
    .from("profiles")
    .select("tenant_id, status")
    .eq("id", context.userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "ativo") throw new Error("Sem acesso.");
  return { tenantId: data.tenant_id as string };
}

export const adminGetVacuumData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tenantId } = await callerAnyTenant(context);
    return loadAll(tenantId, { onlyActive: false });
  });

const settingsSchema = z.object({
  eyebrow: z.string().trim().max(80),
  title_first: z.string().trim().max(40),
  title_second: z.string().trim().max(40),
  subtitle: z.string().trim().max(200),
  practice_tab_label: z.string().trim().max(40),
  guide_tab_label: z.string().trim().max(40),
  card_eyebrow: z.string().trim().max(80),
  card_title: z.string().trim().max(80),
  card_subtitle: z.string().trim().max(120),
  estimated_time: z.string().trim().max(40),
  button_text: z.string().trim().max(40),
  skip_guide_text: z.string().trim().max(120),
  finish_guide_text: z.string().trim().max(40),
});

export const adminSaveVacuumSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => settingsSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerManagerTenant(context);
    const admin = await getAdmin();
    const { error } = await admin
      .from("vacuum_settings")
      .upsert({ tenant_id: tenantId, ...data }, { onConflict: "tenant_id" });
    if (error) throw error;
    return { ok: true };
  });

const exerciseSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  order_index: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(80),
  short_description: z.string().trim().max(120).optional().nullable(),
  prescription_text: z.string().trim().max(80).optional().nullable(),
  thumbnail_url: z.string().trim().max(500).optional().nullable(),
  status: z.enum(["ativo", "inativo"]).default("ativo"),
});

export const adminUpsertExercise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => exerciseSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerManagerTenant(context);
    const admin = await getAdmin();
    const payload: any = { ...data, tenant_id: tenantId };
    if (!payload.id) delete payload.id;
    const { error } = await admin.from("vacuum_exercises").upsert(payload);
    if (error) throw error;
    return { ok: true };
  });

export const adminDeleteExercise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerManagerTenant(context);
    const admin = await getAdmin();
    const { error } = await admin
      .from("vacuum_exercises")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw error;
    return { ok: true };
  });

export const adminReorderExercises = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ ids: z.array(z.string().uuid()) }).parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerManagerTenant(context);
    const admin = await getAdmin();
    await Promise.all(
      data.ids.map((id, idx) =>
        admin.from("vacuum_exercises").update({ order_index: idx }).eq("id", id).eq("tenant_id", tenantId),
      ),
    );
    return { ok: true };
  });

const pageSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  order_index: z.number().int().min(0).default(0),
  title: z.string().trim().min(1).max(120),
  image_url: z.string().trim().max(500).optional().nullable(),
  alt_text: z.string().trim().max(200).optional().nullable(),
  status: z.enum(["ativo", "inativo"]).default("ativo"),
});

export const adminUpsertGuidePage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => pageSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerManagerTenant(context);
    const admin = await getAdmin();
    const payload: any = { ...data, tenant_id: tenantId };
    if (!payload.id) delete payload.id;
    const { error } = await admin.from("vacuum_guide_pages").upsert(payload);
    if (error) throw error;
    return { ok: true };
  });

export const adminReorderGuidePages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ ids: z.array(z.string().uuid()) }).parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerManagerTenant(context);
    const admin = await getAdmin();
    await Promise.all(
      data.ids.map((id, idx) =>
        admin.from("vacuum_guide_pages").update({ order_index: idx }).eq("id", id).eq("tenant_id", tenantId),
      ),
    );
    return { ok: true };
  });

export const adminUploadVacuumAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => {
    if (!(d instanceof FormData)) throw new Error("FormData esperado");
    const file = d.get("file");
    const folder = String(d.get("folder") || "misc");
    if (!(file instanceof File)) throw new Error("Arquivo obrigatório");
    return { file, folder };
  })
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerManagerTenant(context);
    const file = data.file as File;
    if (file.size > 10 * 1024 * 1024) throw new Error("Arquivo acima de 10MB.");
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      throw new Error("Envie JPG, PNG ou WebP.");
    }
    const admin = await getAdmin();
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = `${tenantId}/${data.folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const buf = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from("vacuum-assets")
      .upload(key, buf, { contentType: file.type, upsert: false });
    if (upErr) throw upErr;
    const { data: signed } = await admin.storage.from("vacuum-assets").createSignedUrl(key, 3600);
    return { storageKey: key, signedUrl: signed?.signedUrl ?? null };
  });
