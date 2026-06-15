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
  if (!data || data.status !== "ativo") throw new Error("Usuário sem acesso ativo.");
  return { tenantId: data.tenant_id as string };
}

function rangeFromFilter(range: "7d" | "30d" | "all") {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : 30;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export const reportsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ range: z.enum(["7d", "30d", "all"]).default("30d") }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    const since = rangeFromFilter(data.range);

    const baseClients = context.supabase
      .from("clients")
      .select("id", { head: true, count: "exact" })
      .eq("tenant_id", tenantId);

    const baseAlerts = (() => {
      let q = context.supabase
        .from("risk_alerts")
        .select("id", { head: true, count: "exact" })
        .eq("tenant_id", tenantId);
      if (since) q = q.gte("created_at", since);
      return q;
    })();

    const baseMessages = (() => {
      let q = context.supabase
        .from("messages")
        .select("id", { head: true, count: "exact" })
        .eq("tenant_id", tenantId);
      if (since) q = q.gte("created_at", since);
      return q;
    })();

    const baseApprovals = (() => {
      let q = context.supabase
        .from("approvals")
        .select("id", { head: true, count: "exact" })
        .eq("tenant_id", tenantId);
      if (since) q = q.gte("created_at", since);
      return q;
    })();

    const baseClientsList = context.supabase
      .from("clients")
      .select("id, name, plan, status, start_date, avatar_initial, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50);

    const [c, a, m, ap, list] = await Promise.all([
      baseClients,
      baseAlerts,
      baseMessages,
      baseApprovals,
      baseClientsList,
    ]);

    return {
      range: data.range,
      totals: {
        clients: c.count ?? 0,
        alerts: a.count ?? 0,
        messages: m.count ?? 0,
        approvals: ap.count ?? 0,
      },
      clients: (list.data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        plan: r.plan,
        status: r.status,
        startDate: r.start_date,
        avatarInitial: r.avatar_initial,
      })),
    };
  });

export const lgpdOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tenantId } = await callerTenant(context);
    const [consentsRes, logsRes] = await Promise.all([
      context.supabase
        .from("consents")
        .select("*, clients(name)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(100),
      context.supabase
        .from("audit_logs")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (consentsRes.error) throw consentsRes.error;
    if (logsRes.error) throw logsRes.error;
    return {
      consents: (consentsRes.data ?? []).map((r: any) => ({
        id: r.id,
        clientId: r.client_id,
        clientName: r.clients?.name ?? "",
        terms: !!r.terms,
        privacy: !!r.privacy,
        dataProcessing: !!r.data_processing,
        photosInternal: !!r.photos_internal,
        photosMarketing: !!r.photos_marketing,
        createdAt: r.created_at,
      })),
      logs: (logsRes.data ?? []).map((r: any) => ({
        id: r.id,
        actorId: r.actor_id,
        action: r.action,
        entity: r.entity,
        entityId: r.entity_id,
        metadata: r.metadata ?? {},
        createdAt: r.created_at,
      })),
    };
  });
