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
    accessEmail: row.access_email ?? "",
    accessStatus: (row.access_status ?? "sem_acesso") as
      | "ativo"
      | "inativo"
      | "bloqueado"
      | "sem_acesso",
    authUserId: row.auth_user_id ?? null,
    lastAccessAt: row.last_access_at ?? null,
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
  tenantId: z.string().uuid().optional(),
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

export const createClientRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => clientPayloadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId: callerTenantId } = await callerTenant(context);
    const startDate = data.startDate || new Date().toISOString().slice(0, 10);

    const { data: rpcResult, error: rpcError } = await context.supabase.rpc(
      "create_client_with_journey" as any,
      {
        _payload: {
          name: data.name.trim(),
          email: data.email ?? "",
          phone: data.phone ?? "",
          birthDate: data.birthDate ?? "",
          startDate,
          plan: data.plan ?? "",
          goal: data.goal ?? "",
          complaint: data.complaint ?? "",
          clinicalNotes: data.clinicalNotes ?? "",
          hydrationGoalMl: data.hydrationGoalMl ?? 2000,
          status: data.status ?? "ativa",
          // RPC accepts tenantId only for super admin; non-super calls are rejected server-side.
          ...(data.tenantId ? { tenantId: data.tenantId } : {}),
        },
        _consents: {
          terms: !!data.consents.terms,
          privacy: !!data.consents.privacy,
          dataProcessing: !!data.consents.dataProcessing,
          photosInternal: !!data.consents.photosInternal,
          photosMarketing: !!data.consents.photosMarketing,
        },
        _start_journey: true,
      } as any,
    );
    if (rpcError) {
      console.error("[createClient] create_client_with_journey error", rpcError);
      throw new Error("Não foi possível iniciar o Plano de Voo agora. Tente novamente em instantes ou fale com o suporte.");
    }
    const clientId = (rpcResult as any)?.clientId as string | undefined;
    const journeyId = (rpcResult as any)?.journeyId as string | undefined;
    const resolvedTenantId = ((rpcResult as any)?.tenantId as string | undefined) ?? callerTenantId;
    if (!clientId) {
      throw new Error("Não foi possível criar a cliente. Tente novamente em instantes.");
    }

    const { data: row, error: fetchErr } = await context.supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .eq("tenant_id", resolvedTenantId)
      .single();
    if (fetchErr || !row) {
      console.error("[createClient] post-fetch error", fetchErr);
      throw new Error("Cliente criada, mas não foi possível carregar agora. Atualize a lista.");
    }

    await logAudit(context, resolvedTenantId, "client.create", "client", row.id, {
      name: row.name,
      journeyId: journeyId ?? null,
    });
    return { client: mapClient(row), journeyId: journeyId ?? null };
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

// ============ CONTEÚDOS DA CLIENTE (Nutrição / Treino / Cartas) ============

async function assertClientInTenant(context: Ctx, tenantId: string, clientId: string) {
  const { data, error } = await context.supabase
    .from("clients")
    .select("id, tenant_id")
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.tenant_id !== tenantId) throw new Error("Cliente não encontrada.");
}

export const adminGetNutritionPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    await assertClientInTenant(context, tenantId, data.clientId);
    const { data: row, error } = await context.supabase
      .from("client_nutrition_plans")
      .select("id, title, weekly_calories, water_ml, restrictions, notes, meals")
      .eq("client_id", data.clientId)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return { plan: row ?? null };
  });

export const adminSaveNutritionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        clientId: z.string().uuid(),
        title: z.string().trim().min(1).max(120),
        weeklyCalories: z.number().int().min(0).max(20000).nullable().optional(),
        waterMl: z.number().int().min(0).max(20000).nullable().optional(),
        restrictions: z.string().trim().max(500).optional().nullable(),
        notes: z.string().trim().max(2000).optional().nullable(),
        meals: z
          .array(
            z.object({
              name: z.string().trim().max(80).optional(),
              time: z.string().trim().max(20).optional(),
              items: z.string().trim().max(500).optional(),
              calories: z.number().int().min(0).max(5000).optional(),
            }),
          )
          .max(20)
          .default([]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    await assertClientInTenant(context, tenantId, data.clientId);
    await context.supabase
      .from("client_nutrition_plans")
      .update({ active: false })
      .eq("client_id", data.clientId)
      .eq("active", true);
    const { data: row, error } = await context.supabase
      .from("client_nutrition_plans")
      .insert({
        tenant_id: tenantId,
        client_id: data.clientId,
        title: data.title,
        weekly_calories: data.weeklyCalories ?? null,
        water_ml: data.waterMl ?? null,
        restrictions: data.restrictions ?? null,
        notes: data.notes ?? null,
        meals: data.meals,
        active: true,
      })
      .select("id")
      .single();
    if (error) throw error;
    await logAudit(context, tenantId, "nutrition.save", "client", data.clientId, { planId: row.id });
    return { ok: true, id: row.id };
  });

export const adminGetWorkoutPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    await assertClientInTenant(context, tenantId, data.clientId);
    const { data: row, error } = await context.supabase
      .from("client_workout_plans")
      .select("id, title, frequency_per_week, duration_minutes, focus, notes, sessions")
      .eq("client_id", data.clientId)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return { plan: row ?? null };
  });

export const adminSaveWorkoutPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        clientId: z.string().uuid(),
        title: z.string().trim().min(1).max(120),
        frequencyPerWeek: z.number().int().min(0).max(14).nullable().optional(),
        durationMinutes: z.number().int().min(0).max(600).nullable().optional(),
        focus: z.string().trim().max(120).optional().nullable(),
        notes: z.string().trim().max(2000).optional().nullable(),
        sessions: z
          .array(
            z.object({
              name: z.string().trim().max(80).optional(),
              day: z.string().trim().max(40).optional(),
              focus: z.string().trim().max(120).optional(),
              exercises: z
                .array(
                  z.object({
                    name: z.string().trim().max(120).optional(),
                    sets: z.union([z.number().int(), z.string().max(20)]).optional(),
                    reps: z.string().trim().max(40).optional(),
                    rest: z.string().trim().max(40).optional(),
                    notes: z.string().trim().max(200).optional(),
                  }),
                )
                .max(30)
                .optional(),
            }),
          )
          .max(14)
          .default([]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    await assertClientInTenant(context, tenantId, data.clientId);
    await context.supabase
      .from("client_workout_plans")
      .update({ active: false })
      .eq("client_id", data.clientId)
      .eq("active", true);
    const { data: row, error } = await context.supabase
      .from("client_workout_plans")
      .insert({
        tenant_id: tenantId,
        client_id: data.clientId,
        title: data.title,
        frequency_per_week: data.frequencyPerWeek ?? null,
        duration_minutes: data.durationMinutes ?? null,
        focus: data.focus ?? null,
        notes: data.notes ?? null,
        sessions: data.sessions,
        active: true,
      })
      .select("id")
      .single();
    if (error) throw error;
    await logAudit(context, tenantId, "workout.save", "client", data.clientId, { planId: row.id });
    return { ok: true, id: row.id };
  });

export const adminListLetters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    await assertClientInTenant(context, tenantId, data.clientId);
    const { data: rows, error } = await context.supabase
      .from("client_letters")
      .select("id, title, body, sent_at, read_at")
      .eq("client_id", data.clientId)
      .order("sent_at", { ascending: false });
    if (error) throw error;
    return { letters: rows ?? [] };
  });

export const adminSendLetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        clientId: z.string().uuid(),
        title: z.string().trim().min(1).max(160),
        body: z.string().trim().min(1).max(8000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    await assertClientInTenant(context, tenantId, data.clientId);
    const { data: row, error } = await context.supabase
      .from("client_letters")
      .insert({
        tenant_id: tenantId,
        client_id: data.clientId,
        title: data.title,
        body: data.body,
      })
      .select("id")
      .single();
    if (error) throw error;
    await logAudit(context, tenantId, "letter.send", "client", data.clientId, { letterId: row.id });
    return { ok: true, id: row.id };
  });

export const adminDeleteLetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ clientId: z.string().uuid(), letterId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    await assertClientInTenant(context, tenantId, data.clientId);
    const { error } = await context.supabase
      .from("client_letters")
      .delete()
      .eq("id", data.letterId)
      .eq("client_id", data.clientId);
    if (error) throw error;
    await logAudit(context, tenantId, "letter.delete", "client", data.clientId, { letterId: data.letterId });
    return { ok: true };
  });

// ============ STATS DA CLIENTE (admin) ============

function adminTodayISO() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return d.toISOString().slice(0, 10);
}

export const adminClientStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    await assertClientInTenant(context, tenantId, data.clientId);
    const today = adminTodayISO();

    const [missionsToday, completionsToday, milesAgg, lastPulse, unreadLetters, photosCount] =
      await Promise.all([
        context.supabase
          .from("client_missions")
          .select("id", { count: "exact", head: true })
          .eq("client_id", data.clientId)
          .eq("due_date", today),
        context.supabase
          .from("client_mission_completions")
          .select("mission_id", { count: "exact", head: true })
          .eq("client_id", data.clientId)
          .gte("completed_at", `${today}T00:00:00`),
        context.supabase
          .from("client_mission_completions")
          .select("miles_awarded")
          .eq("client_id", data.clientId),
        context.supabase
          .from("client_weekly_pulse")
          .select("week_start, mood, energy")
          .eq("client_id", data.clientId)
          .order("week_start", { ascending: false })
          .limit(1)
          .maybeSingle(),
        context.supabase
          .from("client_letters")
          .select("id", { count: "exact", head: true })
          .eq("client_id", data.clientId)
          .is("read_at", null),
        context.supabase
          .from("client_progress_photos")
          .select("id", { count: "exact", head: true })
          .eq("client_id", data.clientId),
      ]);

    const milesTotal = (milesAgg.data ?? []).reduce(
      (s: number, r: any) => s + (r.miles_awarded ?? 0),
      0,
    );


    return {
      missionsToday: missionsToday.count ?? 0,
      missionsDoneToday: completionsToday.count ?? 0,
      miles: milesTotal,
      lastPulse: lastPulse.data ?? null,
      unreadLetters: unreadLetters.count ?? 0,
      photosCount: photosCount.count ?? 0,
    };
  });

// Lista as missões do dia para o painel admin (com status de conclusão).
export const adminListClientMissionsToday = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    await assertClientInTenant(context, tenantId, data.clientId);
    const today = adminTodayISO();

    const [missionsRes, completionsRes] = await Promise.all([
      context.supabase
        .from("client_missions")
        .select("id, title, description, miles, active")
        .eq("client_id", data.clientId)
        .eq("due_date", today)
        .order("created_at", { ascending: true }),
      context.supabase
        .from("client_mission_completions")
        .select("mission_id")
        .eq("client_id", data.clientId)
        .gte("completed_at", `${today}T00:00:00`),
    ]);

    if (missionsRes.error) throw missionsRes.error;
    const done = new Set((completionsRes.data ?? []).map((r: any) => r.mission_id));
    return (missionsRes.data ?? []).map((m: any) => ({
      id: m.id,
      title: m.title,
      description: m.description ?? null,
      miles: m.miles ?? 0,
      active: m.active,
      done: done.has(m.id),
    }));
  });

// Cria uma missão para a cliente (default: para hoje).
export const adminCreateMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        clientId: z.string().uuid(),
        title: z.string().min(1).max(120),
        description: z.string().max(500).optional().nullable(),
        miles: z.number().int().min(0).max(1000).optional(),
        dueDate: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    await assertClientInTenant(context, tenantId, data.clientId);
    const dueDate = data.dueDate ?? adminTodayISO();
    const { data: clientRow, error: clientErr } = await context.supabase
      .from("clients")
      .select("active_journey_id")
      .eq("id", data.clientId)
      .single();
    if (clientErr) throw clientErr;
    const { data: row, error } = await context.supabase
      .from("client_missions")
      .insert({
        tenant_id: tenantId,
        client_id: data.clientId,
        journey_id: (clientRow as any).active_journey_id,
        title: data.title,
        description: data.description ?? null,
        miles: data.miles ?? 0,
        due_date: dueDate,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    await logAudit(context, tenantId, "mission.create", "client_mission", row.id, {
      clientId: data.clientId,
      dueDate,
    });
    return { ok: true, id: row.id };
  });

// Alterna o status de conclusão de uma missão (admin marca como concluída ou desfaz).
export const adminToggleMissionCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        clientId: z.string().uuid(),
        missionId: z.string().uuid(),
        done: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    await assertClientInTenant(context, tenantId, data.clientId);

    if (data.done) {
      const { data: mission, error: mErr } = await context.supabase
        .from("client_missions")
        .select("id, miles, tenant_id, client_id, journey_id")
        .eq("id", data.missionId)
        .eq("client_id", data.clientId)
        .eq("tenant_id", tenantId)
        .single();
      if (mErr || !mission) throw mErr ?? new Error("Mission not found");
      const { error } = await context.supabase
        .from("client_mission_completions")
        .upsert(
          {
            tenant_id: tenantId,
            client_id: data.clientId,
            mission_id: data.missionId,
            journey_id: (mission as any).journey_id,
            miles_awarded: mission.miles ?? 0,
            completed_at: new Date().toISOString(),
          },
          { onConflict: "mission_id,client_id" },
        );
      if (error) throw error;
      await logAudit(context, tenantId, "mission.complete", "client_mission", data.missionId, {
        clientId: data.clientId,
      });
    } else {
      const { error } = await context.supabase
        .from("client_mission_completions")
        .delete()
        .eq("client_id", data.clientId)
        .eq("mission_id", data.missionId);
      if (error) throw error;
      await logAudit(context, tenantId, "mission.uncomplete", "client_mission", data.missionId, {
        clientId: data.clientId,
      });
    }
    return { ok: true };
  });




// ---------------------------------------------------------------------------
// Client portal access (login da cliente final)
// ---------------------------------------------------------------------------

async function assertProfileManager(context: Ctx) {
  const { tenantId, role } = await callerTenant(context);
  if (!["super_admin", "dono", "admin"].includes(role)) {
    throw new Error("Apenas administradores podem gerenciar o acesso da cliente.");
  }
  return { tenantId };
}

async function assertClientBelongsToCaller(context: Ctx, clientId: string) {
  const { tenantId } = await assertProfileManager(context);
  const { data, error } = await context.supabase
    .from("clients")
    .select("id, tenant_id, name, auth_user_id, access_email, access_status")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Cliente não encontrada.");
  return { tenantId, client: data };
}

function generateTempPassword(len = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(len));
  return Array.from(bytes, (n) => chars[n % chars.length]).join("");
}

export const adminCreateClientAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clientId: z.string().uuid(),
        email: z.string().trim().email().max(255),
        password: z.string().min(6).max(72).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, client } = await assertClientBelongsToCaller(context, data.clientId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();
    const password = data.password && data.password.length >= 6 ? data.password : generateTempPassword(10);

    // find or create auth user
    let authUserId = client.auth_user_id as string | null;
    if (!authUserId) {
      // search existing auth user with this email
      let found: any = null;
      for (let page = 1; page <= 10 && !found; page += 1) {
        const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        found = list.users.find((u) => u.email?.toLowerCase() === email);
        if (list.users.length < 1000) break;
      }
      if (found) {
        authUserId = found.id;
        const { error } = await supabaseAdmin.auth.admin.updateUserById(found.id, {
          password,
          email_confirm: true,
          user_metadata: { name: client.name, client_id: client.id, tenant_id: tenantId, kind: "cliente" },
        });
        if (error) throw error;
      } else {
        const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name: client.name, client_id: client.id, tenant_id: tenantId, kind: "cliente" },
        });
        if (error) throw error;
        authUserId = created.user.id;
      }
    } else {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        email,
        password,
        email_confirm: true,
      });
      if (error) throw error;
    }

    const { data: row, error: upErr } = await supabaseAdmin
      .from("clients")
      .update({
        auth_user_id: authUserId,
        access_email: email,
        access_status: "ativo",
      })
      .eq("id", client.id)
      .select("*")
      .single();
    if (upErr) throw upErr;

    await logAudit(context, tenantId, "client_access_created", "client", client.id, { email });
    return { client: mapClient(row), temporaryPassword: password };
  });

export const adminResetClientPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clientId: z.string().uuid(),
        password: z.string().min(6).max(72).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, client } = await assertClientBelongsToCaller(context, data.clientId);
    if (!client.auth_user_id) throw new Error("Cliente não possui acesso criado.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const password = data.password && data.password.length >= 6 ? data.password : generateTempPassword(10);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(client.auth_user_id, { password });
    if (error) throw error;
    await logAudit(context, tenantId, "client_access_reset", "client", client.id, {});
    return { temporaryPassword: password };
  });

export const adminSetClientAccessStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clientId: z.string().uuid(),
        status: z.enum(["ativo", "inativo", "bloqueado"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, client } = await assertClientBelongsToCaller(context, data.clientId);
    if (!client.auth_user_id) throw new Error("Cliente não possui acesso criado.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.status === "bloqueado" || data.status === "inativo") {
      await supabaseAdmin.auth.admin.updateUserById(client.auth_user_id, {
        ban_duration: "876000h", // ~100y
      } as any);
    } else {
      await supabaseAdmin.auth.admin.updateUserById(client.auth_user_id, {
        ban_duration: "none",
      } as any);
    }
    const { data: row, error } = await supabaseAdmin
      .from("clients")
      .update({ access_status: data.status })
      .eq("id", client.id)
      .select("*")
      .single();
    if (error) throw error;
    await logAudit(context, tenantId, "client_access_status_changed", "client", client.id, { status: data.status });
    return { client: mapClient(row) };
  });
