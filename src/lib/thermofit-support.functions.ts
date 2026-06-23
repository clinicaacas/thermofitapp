import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function callerTenant(context: Ctx) {
  const { data, error } = await context.supabase
    .from("profiles")
    .select("tenant_id, status, profile")
    .eq("id", context.userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "ativo") throw new Error("Sem acesso.");
  return { tenantId: data.tenant_id as string, profile: data.profile as string };
}

async function callerClient(context: Ctx) {
  const { data, error } = await context.supabase
    .from("clients")
    .select("id, tenant_id")
    .eq("auth_user_id", context.userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Cliente não encontrada.");
  return { clientId: data.id as string, tenantId: data.tenant_id as string };
}

// ============== TOPICS ==============

const DEFAULT_TOPICS = [
  "Tirar dúvida sobre o plano",
  "Remarcar sessão",
  "Não estou me sentindo bem",
  "Outro assunto",
];

async function ensureDefaultTopics(supabase: any, tenantId: string) {
  const { data } = await supabase
    .from("support_topics")
    .select("id")
    .eq("tenant_id", tenantId)
    .limit(1);
  if (data && data.length > 0) return;
  const rows = DEFAULT_TOPICS.map((title, i) => ({
    tenant_id: tenantId,
    title,
    active: true,
    sort_order: i,
  }));
  await supabase.from("support_topics").insert(rows);
}

export const listSupportTopicsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tenantId } = await callerTenant(context);
    await ensureDefaultTopics(context.supabase, tenantId);
    const { data, error } = await context.supabase
      .from("support_topics")
      .select("id, title, active, sort_order")
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return { topics: data ?? [] };
  });

export const listSupportTopicsClient = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tenantId } = await callerClient(context);
    await ensureDefaultTopics(context.supabase, tenantId);
    const { data, error } = await context.supabase
      .from("support_topics")
      .select("id, title, sort_order")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return { topics: data ?? [] };
  });

const saveTopicsSchema = z.object({
  topics: z.array(
    z.object({
      id: z.string().uuid().optional(),
      title: z.string().trim().min(1).max(80),
      active: z.boolean().default(true),
      sort_order: z.number().int().min(0),
    }),
  ),
  deletedIds: z.array(z.string().uuid()).default([]),
});

export const saveSupportTopics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => saveTopicsSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId, profile } = await callerTenant(context);
    if (!["super_admin", "dono", "admin"].includes(profile)) {
      throw new Error("Sem permissão.");
    }
    // Delete only those without history
    for (const id of data.deletedIds) {
      const { count } = await context.supabase
        .from("support_conversations")
        .select("id", { count: "exact", head: true })
        .eq("topic_id", id);
      if ((count ?? 0) === 0) {
        await context.supabase.from("support_topics").delete().eq("id", id).eq("tenant_id", tenantId);
      } else {
        await context.supabase
          .from("support_topics")
          .update({ active: false })
          .eq("id", id)
          .eq("tenant_id", tenantId);
      }
    }
    for (const t of data.topics) {
      if (t.id) {
        await context.supabase
          .from("support_topics")
          .update({ title: t.title, active: t.active, sort_order: t.sort_order })
          .eq("id", t.id)
          .eq("tenant_id", tenantId);
      } else {
        await context.supabase.from("support_topics").insert({
          tenant_id: tenantId,
          title: t.title,
          active: t.active,
          sort_order: t.sort_order,
        });
      }
    }
    return { ok: true };
  });

// ============== CLIENT-SIDE CONVERSATIONS ==============

export const listMyConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { clientId } = await callerClient(context);
    const { data, error } = await context.supabase
      .from("support_conversations")
      .select("id, topic_label, status, last_message_at, unread_for_client, created_at")
      .eq("client_id", clientId)
      .order("last_message_at", { ascending: false });
    if (error) throw error;
    // Last message preview
    const ids = (data ?? []).map((c: any) => c.id);
    let previews: Record<string, { body: string; sender_type: string }> = {};
    if (ids.length > 0) {
      const { data: msgs } = await context.supabase
        .from("support_messages")
        .select("conversation_id, body, sender_type, created_at")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false });
      for (const m of msgs ?? []) {
        if (!previews[m.conversation_id]) {
          previews[m.conversation_id] = { body: m.body, sender_type: m.sender_type };
        }
      }
    }
    return {
      conversations: (data ?? []).map((c: any) => ({
        ...c,
        last_preview: previews[c.id]?.body ?? "",
        last_sender: previews[c.id]?.sender_type ?? null,
      })),
    };
  });

export const getMyConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ conversationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { clientId } = await callerClient(context);
    const { data: conv, error } = await context.supabase
      .from("support_conversations")
      .select("id, topic_label, status, client_id, last_message_at")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (error) throw error;
    if (!conv || conv.client_id !== clientId) throw new Error("Conversa não encontrada.");
    const { data: msgs } = await context.supabase
      .from("support_messages")
      .select("id, sender_type, body, created_at")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true });
    // Mark client unread = false
    await context.supabase
      .from("support_conversations")
      .update({ unread_for_client: false })
      .eq("id", conv.id);
    return { conversation: conv, messages: msgs ?? [] };
  });

const startConversationSchema = z.object({
  topicId: z.string().uuid().nullable().optional(),
  topicLabel: z.string().trim().max(120).optional(),
  body: z.string().trim().min(1).max(2000),
});

export const startConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => startConversationSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { clientId, tenantId } = await callerClient(context);
    const { data: conv, error } = await context.supabase
      .from("support_conversations")
      .insert({
        tenant_id: tenantId,
        client_id: clientId,
        topic_id: data.topicId ?? null,
        topic_label: data.topicLabel ?? null,
        status: "aberto",
        last_message_at: new Date().toISOString(),
        unread_for_admin: true,
        unread_for_client: false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const { error: mErr } = await context.supabase.from("support_messages").insert({
      tenant_id: tenantId,
      conversation_id: conv.id,
      sender_type: "client",
      sender_user_id: context.userId,
      body: data.body,
    });
    if (mErr) throw new Error(mErr.message);
    return { ok: true, conversationId: conv.id };
  });

const clientReplySchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
});

export const replyAsClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => clientReplySchema.parse(i))
  .handler(async ({ data, context }) => {
    const { clientId, tenantId } = await callerClient(context);
    const { data: conv } = await context.supabase
      .from("support_conversations")
      .select("id, client_id, status")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conv || conv.client_id !== clientId) throw new Error("Conversa não encontrada.");
    const newStatus = conv.status === "encerrado" ? "aberto" : conv.status;
    await context.supabase.from("support_messages").insert({
      tenant_id: tenantId,
      conversation_id: conv.id,
      sender_type: "client",
      sender_user_id: context.userId,
      body: data.body,
    });
    await context.supabase
      .from("support_conversations")
      .update({
        status: newStatus,
        last_message_at: new Date().toISOString(),
        unread_for_admin: true,
        unread_for_client: false,
        closed_at: newStatus === "encerrado" ? null : null,
      })
      .eq("id", conv.id);
    return { ok: true };
  });

// ============== ADMIN-SIDE ==============

export const listSupportConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        clientId: z.string().uuid().optional(),
        status: z.string().optional(),
        search: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    let q = context.supabase
      .from("support_conversations")
      .select(
        "id, topic_label, status, last_message_at, unread_for_admin, client_id, clients!inner(id, name, tenant_id)",
      )
      .eq("tenant_id", tenantId)
      .order("last_message_at", { ascending: false });
    if (data.clientId) q = q.eq("client_id", data.clientId);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    let filtered = rows ?? [];
    if (data.search) {
      const s = data.search.toLowerCase();
      filtered = filtered.filter((r: any) => (r.clients?.name ?? "").toLowerCase().includes(s));
    }
    const ids = filtered.map((c: any) => c.id);
    let previews: Record<string, { body: string; sender_type: string }> = {};
    if (ids.length > 0) {
      const { data: msgs } = await context.supabase
        .from("support_messages")
        .select("conversation_id, body, sender_type, created_at")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false });
      for (const m of msgs ?? []) {
        if (!previews[m.conversation_id]) {
          previews[m.conversation_id] = { body: m.body, sender_type: m.sender_type };
        }
      }
    }
    // Status order: aberto first, em_atendimento, respondido, encerrado
    const order: Record<string, number> = { aberto: 0, em_atendimento: 1, respondido: 2, encerrado: 3 };
    filtered.sort((a: any, b: any) => {
      const oa = order[a.status] ?? 9;
      const ob = order[b.status] ?? 9;
      if (oa !== ob) return oa - ob;
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    });
    return {
      conversations: filtered.map((c: any) => ({
        id: c.id,
        topic_label: c.topic_label,
        status: c.status,
        last_message_at: c.last_message_at,
        unread_for_admin: c.unread_for_admin,
        client_id: c.client_id,
        client_name: c.clients?.name ?? "—",
        last_preview: previews[c.id]?.body ?? "",
        last_sender: previews[c.id]?.sender_type ?? null,
      })),
    };
  });

export const getConversationAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ conversationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    const { data: conv, error } = await context.supabase
      .from("support_conversations")
      .select("id, topic_label, status, client_id, tenant_id, last_message_at, assigned_to_user_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (error) throw error;
    if (!conv || conv.tenant_id !== tenantId) throw new Error("Conversa não encontrada.");
    const { data: msgs } = await context.supabase
      .from("support_messages")
      .select("id, sender_type, body, created_at, sender_user_id")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true });
    await context.supabase
      .from("support_conversations")
      .update({ unread_for_admin: false })
      .eq("id", conv.id);
    return { conversation: conv, messages: msgs ?? [] };
  });

const adminReplySchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
});

export const replyAsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => adminReplySchema.parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    const { data: conv } = await context.supabase
      .from("support_conversations")
      .select("id, tenant_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conv || conv.tenant_id !== tenantId) throw new Error("Conversa não encontrada.");
    const { error } = await context.supabase.from("support_messages").insert({
      tenant_id: tenantId,
      conversation_id: conv.id,
      sender_type: "admin",
      sender_user_id: context.userId,
      body: data.body,
    });
    if (error) throw new Error(error.message);
    await context.supabase
      .from("support_conversations")
      .update({
        status: "respondido",
        last_message_at: new Date().toISOString(),
        unread_for_admin: false,
        unread_for_client: true,
        assigned_to_user_id: context.userId,
      })
      .eq("id", conv.id);
    return { ok: true };
  });

export const updateConversationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        conversationId: z.string().uuid(),
        status: z.enum(["aberto", "em_atendimento", "respondido", "encerrado"]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    const patch: any = { status: data.status };
    if (data.status === "encerrado") patch.closed_at = new Date().toISOString();
    if (data.status !== "encerrado") patch.closed_at = null;
    const { error } = await context.supabase
      .from("support_conversations")
      .update(patch)
      .eq("id", data.conversationId)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listClientConversationsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId } = await callerTenant(context);
    const { data: rows, error } = await context.supabase
      .from("support_conversations")
      .select("id, topic_label, status, last_message_at, unread_for_admin")
      .eq("tenant_id", tenantId)
      .eq("client_id", data.clientId)
      .order("last_message_at", { ascending: false });
    if (error) throw error;
    return { conversations: rows ?? [] };
  });
