import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function mapClient(row: any) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    email: row.email ?? "",
    phone: row.phone ?? "",
    birthDate: row.birth_date ?? "",
    startDate: row.start_date,
    plan: row.plan,
    goal: row.goal ?? "",
    complaint: row.complaint ?? "",
    clinicalNotes: row.clinical_notes ?? "",
    hydrationGoalMl: row.hydration_goal_ml,
    status: row.status,
    avatarInitial:
      row.avatar_initial ||
      (row.name?.trim()?.[0]?.toUpperCase() ?? "?"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAlert(row: any) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    clientId: row.client_id,
    clientName: row.clients?.name ?? "",
    type: row.type,
    description: row.description,
    severity: row.severity as "baixa" | "media" | "alta",
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

function mapMessage(row: any) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    clientId: row.client_id,
    clientName: row.clients?.name ?? null,
    template: row.template,
    body: row.body,
    channel: row.channel,
    recipientsCount: row.recipients_count,
    createdAt: row.created_at,
  };
}

function mapApproval(row: any) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    clientId: row.client_id,
    clientName: row.clients?.name ?? "",
    type: row.type,
    status: row.status,
    reason: row.reason,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// CLIENTS
// ---------------------------------------------------------------------------

const clientPayloadSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(120),
  email: z.string().trim().email("E-mail inválido").max(255).or(z.literal("")).default(""),
  phone: z.string().trim().max(40).default(""),
  birthDate: z.string().trim().max(20).default(""),
  startDate: z.string().trim().max(20).default(""),
  plan: z.string().trim().max(80).default("ThermoFit Essencial"),
  goal: z.string().trim().max(500).default(""),
  complaint: z.string().trim().max(500).default(""),
  clinicalNotes: z.string().trim().max(2000).default(""),
  hydrationGoalMl: z.number().int().min(0).max(20000).default(2000),
  status: z.enum(["ativa", "pausada", "inativa"]).default("ativa"),
  consents: z
    .object({
      terms: z.boolean().default(false),
      privacy: z.boolean().default(false),
      dataProcessing: z.boolean().default(false),
      photosInternal: z.boolean().default(false),
      photosMarketing: z.boolean().default(false),
    })
    .partial()
    .default({}),
});

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tenantId } = await callerTenant(context);
    const { data, error } = await context.supabase
      .from("clients")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { clients: (data ?? []).map(mapClient) };
  });

export const getClient = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    const { data: row, error } = await context.supabase
      .from("clients")
      .select("*, consents(*)")
      .eq("tenant_id", tenantId)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Cliente não encontrada.");
    const rawConsent = (row as any).consents;
    const consent = Array.isArray(rawConsent) ? rawConsent[0] : rawConsent ?? null;
    return {
      client: mapClient(row),
      consents: consent
        ? {
            terms: !!consent.terms,
            privacy: !!consent.privacy,
            dataProcessing: !!consent.data_processing,
            photosInternal: !!consent.photos_internal,
            photosMarketing: !!consent.photos_marketing,
          }
        : null,
    };
  });

export const createClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => clientPayloadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    const initial = (data.name.trim()[0] ?? "?").toUpperCase();
    const startDate = data.startDate || new Date().toISOString().slice(0, 10);
    const insertPayload: Record<string, unknown> = {
      tenant_id: tenantId,
      name: data.name.trim(),
      email: data.email,
      phone: data.phone,
      start_date: startDate,
      plan: data.plan,
      goal: data.goal,
      complaint: data.complaint,
      clinical_notes: data.clinicalNotes,
      hydration_goal_ml: data.hydrationGoalMl,
      status: data.status,
      avatar_initial: initial,
      created_by: context.userId,
    };
    if (data.birthDate) insertPayload.birth_date = data.birthDate;
    const { data: row, error } = await context.supabase
      .from("clients")
      .insert(insertPayload as any)
      .select("*")
      .single();
    if (error) {
      console.error("[createClient] insert error", error);
      throw new Error(error.message || "Falha ao criar cliente.");
    }

    try {
      const { error: cErr } = await context.supabase.from("consents").insert({
        tenant_id: tenantId,
        client_id: row.id,
        terms: !!data.consents.terms,
        privacy: !!data.consents.privacy,
        data_processing: !!data.consents.dataProcessing,
        photos_internal: !!data.consents.photosInternal,
        photos_marketing: !!data.consents.photosMarketing,
      });
      if (cErr) console.error("[createClient] consents insert error", cErr);
    } catch (err) {
      console.error("[createClient] consents insert threw (non-fatal)", err);
    }

    await logAudit(context, tenantId, "client.create", "client", row.id, { name: row.name });
    return { client: mapClient(row) };
  });

export const updateClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ id: z.string().uuid(), patch: clientPayloadSchema.partial() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    const p = data.patch;
    const update: Record<string, unknown> = {};
    if (p.name !== undefined) update.name = p.name.trim();
    if (p.email !== undefined) update.email = p.email;
    if (p.phone !== undefined) update.phone = p.phone;
    if (p.birthDate !== undefined) update.birth_date = p.birthDate || null;
    if (p.startDate !== undefined) update.start_date = p.startDate;
    if (p.plan !== undefined) update.plan = p.plan;
    if (p.goal !== undefined) update.goal = p.goal;
    if (p.complaint !== undefined) update.complaint = p.complaint;
    if (p.clinicalNotes !== undefined) update.clinical_notes = p.clinicalNotes;
    if (p.hydrationGoalMl !== undefined) update.hydration_goal_ml = p.hydrationGoalMl;
    if (p.status !== undefined) update.status = p.status;

    const { data: row, error } = await context.supabase
      .from("clients")
      .update(update as any)
      .eq("tenant_id", tenantId)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw error;

    if (p.consents) {
      await context.supabase
        .from("consents")
        .upsert(
          {
            tenant_id: tenantId,
            client_id: data.id,
            terms: !!p.consents.terms,
            privacy: !!p.consents.privacy,
            data_processing: !!p.consents.dataProcessing,
            photos_internal: !!p.consents.photosInternal,
            photos_marketing: !!p.consents.photosMarketing,
          },
          { onConflict: "client_id" },
        );
    }

    await logAudit(context, tenantId, "client.update", "client", data.id, {});
    return { client: mapClient(row) };
  });

export const deleteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    const { error } = await context.supabase
      .from("clients")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("id", data.id);
    if (error) throw error;
    await logAudit(context, tenantId, "client.delete", "client", data.id, {});
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// ALERTS
// ---------------------------------------------------------------------------

export const listAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tenantId } = await callerTenant(context);
    const { data, error } = await context.supabase
      .from("risk_alerts")
      .select("*, clients(name)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { alerts: (data ?? []).map(mapAlert) };
  });

export const resolveAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    const { error } = await context.supabase
      .from("risk_alerts")
      .update({ resolved_at: new Date().toISOString(), resolved_by: context.userId })
      .eq("tenant_id", tenantId)
      .eq("id", data.id);
    if (error) throw error;
    await logAudit(context, tenantId, "alert.resolve", "alert", data.id, {});
    return { ok: true };
  });

export const createAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clientId: z.string().uuid().optional(),
        type: z.string().trim().min(1).max(80),
        description: z.string().trim().max(500).default(""),
        severity: z.enum(["baixa", "media", "alta"]).default("media"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    const { data: row, error } = await context.supabase
      .from("risk_alerts")
      .insert({
        tenant_id: tenantId,
        client_id: data.clientId ?? null,
        type: data.type,
        description: data.description,
        severity: data.severity,
      })
      .select("*, clients(name)")
      .single();
    if (error) throw error;
    await logAudit(context, tenantId, "alert.create", "alert", row.id, { type: data.type });
    return { alert: mapAlert(row) };
  });

// ---------------------------------------------------------------------------
// MESSAGES
// ---------------------------------------------------------------------------

export const listMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tenantId } = await callerTenant(context);
    const { data, error } = await context.supabase
      .from("messages")
      .select("*, clients(name)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return { messages: (data ?? []).map(mapMessage) };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        template: z.string().trim().max(60).default(""),
        body: z.string().trim().min(1, "Mensagem vazia").max(2000),
        clientId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    let recipients = 1;
    if (!data.clientId) {
      const { count } = await context.supabase
        .from("clients")
        .select("id", { head: true, count: "exact" })
        .eq("tenant_id", tenantId)
        .eq("status", "ativa");
      recipients = count ?? 0;
    }
    const { data: row, error } = await context.supabase
      .from("messages")
      .insert({
        tenant_id: tenantId,
        client_id: data.clientId ?? null,
        template: data.template,
        body: data.body,
        channel: "manual",
        recipients_count: recipients,
        sent_by: context.userId,
      })
      .select("*, clients(name)")
      .single();
    if (error) throw error;
    await logAudit(context, tenantId, "message.send", "message", row.id, {
      template: data.template,
      recipients,
    });
    return { message: mapMessage(row) };
  });

// ---------------------------------------------------------------------------
// APPROVALS
// ---------------------------------------------------------------------------

export const listApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tenantId } = await callerTenant(context);
    const { data, error } = await context.supabase
      .from("approvals")
      .select("*, clients(name)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { approvals: (data ?? []).map(mapApproval) };
  });

export const decideApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["aprovada", "reprovada"]),
        reason: z.string().trim().max(500).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    const { error } = await context.supabase
      .from("approvals")
      .update({
        status: data.decision,
        reason: data.reason,
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("id", data.id);
    if (error) throw error;
    await logAudit(context, tenantId, `approval.${data.decision}`, "approval", data.id, {});
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// DASHBOARD SUMMARY
// ---------------------------------------------------------------------------

export const dashboardSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tenantId } = await callerTenant(context);
    const [clientsRes, alertsRes, approvalsRes, recentAlertsRes] = await Promise.all([
      context.supabase
        .from("clients")
        .select("id", { head: true, count: "exact" })
        .eq("tenant_id", tenantId)
        .eq("status", "ativa"),
      context.supabase
        .from("risk_alerts")
        .select("id", { head: true, count: "exact" })
        .eq("tenant_id", tenantId)
        .is("resolved_at", null),
      context.supabase
        .from("approvals")
        .select("id", { head: true, count: "exact" })
        .eq("tenant_id", tenantId)
        .eq("status", "pendente"),
      context.supabase
        .from("risk_alerts")
        .select("*, clients(name)")
        .eq("tenant_id", tenantId)
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    if (recentAlertsRes.error) throw recentAlertsRes.error;
    return {
      activeClients: clientsRes.count ?? 0,
      openAlerts: alertsRes.count ?? 0,
      pendingApprovals: approvalsRes.count ?? 0,
      recentAlerts: (recentAlertsRes.data ?? []).map(mapAlert),
    };
  });
