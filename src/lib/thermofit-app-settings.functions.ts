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

export const DEFAULT_MODULES = [
  { key: "inicio", label: "Início" },
  { key: "missoes", label: "Missões" },
  { key: "videos", label: "Vídeos" },
  { key: "agua", label: "Hidratação" },
  { key: "vacuum", label: "Vacuum" },
  { key: "nutricao", label: "Nutrição" },
  { key: "treino", label: "Treino" },
  { key: "cartas", label: "Cartas" },
  { key: "premios", label: "Prêmios" },
  { key: "falar", label: "Falar com a equipe" },
  { key: "fotos", label: "Fotos" },
  { key: "pulso", label: "Pulso" },
  { key: "passaporte", label: "Passaporte" },
  { key: "privacidade", label: "Privacidade" },
] as const;

export const DEFAULT_QUICK_TOPICS = [
  { key: "duvida_plano", label: "Tirar dúvida sobre o plano", creates_alert: false },
  { key: "remarcar", label: "Remarcar sessão", creates_alert: false },
  { key: "nao_estou_bem", label: "Não estou me sentindo bem", creates_alert: true },
  { key: "outro", label: "Outro assunto", creates_alert: false },
];

export const getAppSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tenantId } = await callerTenant(context);
    const [s, m, t] = await Promise.all([
      context.supabase.from("client_app_settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
      context.supabase.from("app_module_settings").select("*").eq("tenant_id", tenantId),
      context.supabase.from("app_templates").select("*").eq("tenant_id", tenantId),
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

const saveSettingsSchema = z.object({
  app_name: z.string().trim().min(1).max(80),
  app_subtitle: z.string().trim().max(160).default(""),
  welcome_text: z.string().trim().max(500).default(""),
  primary_color: z.string().trim().max(20).default("#5b6cff"),
  accent_color: z.string().trim().max(20).default("#7c83ff"),
});

export const saveAppSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => saveSettingsSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    const { error } = await context.supabase
      .from("client_app_settings")
      .upsert({ tenant_id: tenantId, ...data }, { onConflict: "tenant_id" });
    if (error) throw new Error(error.message || "Falha ao salvar configurações.");
    return { ok: true };
  });

const saveModulesSchema = z.object({
  modules: z.array(
    z.object({
      key: z.string().min(1).max(40),
      label: z.string().trim().max(60).optional(),
      enabled: z.boolean(),
    }),
  ),
});

export const saveAppModules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => saveModulesSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    const rows = data.modules.map((m) => ({
      tenant_id: tenantId,
      module_key: m.key,
      enabled: m.enabled,
      label: m.label && m.label.length > 0 ? m.label : null,
    }));
    const { error } = await context.supabase
      .from("app_module_settings")
      .upsert(rows, { onConflict: "tenant_id,module_key" });
    if (error) throw new Error(error.message || "Falha ao salvar módulos.");
    return { ok: true };
  });

const saveQuickTopicsSchema = z.object({
  topics: z.array(
    z.object({
      key: z.string().min(1).max(40),
      label: z.string().min(1).max(120),
      creates_alert: z.boolean().default(false),
    }),
  ),
});

export const saveQuickTopics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => saveQuickTopicsSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    await context.supabase
      .from("app_templates")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("kind", "quick_topic");
    if (data.topics.length > 0) {
      const rows = data.topics.map((t) => ({
        tenant_id: tenantId,
        kind: "quick_topic",
        key: t.key,
        label: t.label,
        content: "",
        creates_alert: t.creates_alert,
      }));
      const { error } = await context.supabase.from("app_templates").insert(rows);
      if (error) throw new Error(error.message || "Falha ao salvar botões rápidos.");
    }
    return { ok: true };
  });
