import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DEFAULT_MODULES, DEFAULT_QUICK_TOPICS } from "./thermofit-app-settings.functions";


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
      .select("*")
      .eq("tenant_id", client.tenant_id)
      .eq("status", "ativo")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return { videos: rows ?? [] };
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
