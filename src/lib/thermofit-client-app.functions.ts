import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function callerTenant(context: Ctx) {
  const { data, error } = await context.supabase
    .from("profiles")
    .select("tenant_id, status")
    .eq("id", context.userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "ativo") throw new Error("Sem acesso.");
  return { tenantId: data.tenant_id as string };
}

async function ensureClient(context: Ctx, tenantId: string, clientId: string) {
  const { data, error } = await context.supabase
    .from("clients")
    .select("id, name, tenant_id, plan, hydration_goal_ml, status, start_date, goal")
    .eq("tenant_id", tenantId)
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Cliente não encontrada.");
  return data;
}

export const getClientHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    const client = await ensureClient(context, tenantId, data.clientId);
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
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    await ensureClient(context, tenantId, data.clientId);
    const { data: rows, error } = await context.supabase
      .from("videos")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "ativo")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return { videos: rows ?? [] };
  });

export const listClientRewards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    await ensureClient(context, tenantId, data.clientId);
    const { data: rows, error } = await context.supabase
      .from("rewards")
      .select("*")
      .eq("tenant_id", tenantId)
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
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => helpSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    const client = await ensureClient(context, tenantId, data.clientId);

    let alertId: string | null = null;
    if (data.createAlert) {
      const { data: alert, error: aErr } = await context.supabase
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

    const { data: row, error } = await context.supabase
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

    try {
      await context.supabase.from("audit_logs").insert({
        tenant_id: tenantId,
        actor_id: context.userId,
        action: "help_message.create",
        entity: "help_message",
        entity_id: row.id,
        metadata: { quickTopic: data.quickTopic, alertId },
      });
    } catch {}

    return { ok: true, alertCreated: !!alertId };
  });

export const listHelpMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    await ensureClient(context, tenantId, data.clientId);
    const { data: rows, error } = await context.supabase
      .from("help_messages")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("client_id", data.clientId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return { messages: rows ?? [] };
  });
