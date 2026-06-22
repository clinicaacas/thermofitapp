import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getClientJourneyDay } from "./journey";

type Ctx = { supabase: any; userId: string };

const TOTAL_WEEKS = 12;

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// Resposta padrão para clientId inexistente ou de outro tenant.
// Status 404 com mensagem genérica e sem revelar existência em outro tenant.
function clientNotFound(): never {
  throw new Response(
    JSON.stringify({ message: "Cliente não encontrada." }),
    { status: 404, headers: { "content-type": "application/json" } },
  );
}

async function authorizeForClient(context: Ctx, clientId: string) {
  // Caller's tenant + role (active profile required).
  const { data: profile, error: pErr } = await context.supabase
    .from("profiles")
    .select("tenant_id, profile, status")
    .eq("id", context.userId)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!profile || profile.status !== "ativo") {
    throw new Error("Usuário sem acesso ativo.");
  }
  const admin = await getAdmin();
  const { data: client, error: cErr } = await admin
    .from("clients")
    .select("id, tenant_id, name, start_date")
    .eq("id", clientId)
    .maybeSingle();
  if (cErr) throw cErr;
  const isSuper = profile.profile === "super_admin";
  // Cliente inexistente OU de outro tenant → 404 idêntico, sem distinguir.
  if (!client || (!isSuper && client.tenant_id !== profile.tenant_id)) {
    // Auditoria de acesso negado (usa tenant do caller para rastrear quem tentou).
    try {
      await context.supabase.from("audit_logs").insert({
        tenant_id: profile.tenant_id,
        actor_id: context.userId,
        action: "client_photo.access_denied",
        entity: "client",
        entity_id: clientId,
        metadata: { reason: client ? "cross_tenant" : "not_found" },
      });
    } catch {}
    clientNotFound();
  }
  const allowedRoles = new Set(["super_admin", "dono", "admin"]);
  if (!allowedRoles.has(profile.profile)) {
    throw new Error("Você não tem permissão para gerenciar fotos.");
  }
  return { client: client!, profile, admin };
}


async function logAudit(
  context: Ctx,
  tenantId: string,
  action: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
) {
  try {
    await context.supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_id: context.userId,
      action,
      entity: "client_progress_photo",
      entity_id: entityId,
      metadata,
    });
  } catch (err) {
    console.error("audit_logs insert failed", err);
  }
}

function computeActualJourneyWeek(startDate: string | Date | null | undefined) {
  return Math.floor(getClientJourneyDay(startDate) / 7) + 1;
}

export const adminListClientPhotos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { client, admin } = await authorizeForClient(context, data.clientId);
    const { data: rows, error } = await admin
      .from("client_progress_photos")
      .select(
        "id, storage_key, taken_at, week, notes, source, visible_to_client, uploaded_by_user_id, created_at, updated_at",
      )
      .eq("client_id", client.id)
      .eq("tenant_id", client.tenant_id)
      .order("taken_at", { ascending: false });
    if (error) throw error;
    const items = await Promise.all(
      (rows ?? []).map(async (r: any) => {
        const { data: signed } = await admin.storage
          .from("client-photos")
          .createSignedUrl(r.storage_key, 3600);
        return { ...r, url: signed?.signedUrl ?? null };
      }),
    );
    const weekPhotoCounts: Record<number, number> = {};
    for (let w = 1; w <= TOTAL_WEEKS; w++) weekPhotoCounts[w] = 0;
    let legacyPhotoCount = 0;
    let hiddenCount = 0;
    for (const r of items) {
      if (r.visible_to_client === false) hiddenCount += 1;
      const w = r.week;
      if (typeof w === "number" && w >= 1 && w <= TOTAL_WEEKS) {
        weekPhotoCounts[w] += 1;
      } else {
        legacyPhotoCount += 1;
      }
    }
    const actualJourneyWeek = computeActualJourneyWeek(client.start_date);
    const journeyCompleted = actualJourneyWeek > TOTAL_WEEKS;
    const currentWeek = journeyCompleted
      ? TOTAL_WEEKS
      : Math.max(1, Math.min(TOTAL_WEEKS, actualJourneyWeek));
    return {
      photos: items,
      actualJourneyWeek,
      currentWeek,
      journeyCompleted,
      totalWeeks: TOTAL_WEEKS,
      hasStartDate: !!client.start_date,
      weekPhotoCounts,
      legacyPhotoCount,
      hiddenCount,
    };
  });

export const adminUploadClientPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => {
    if (!(d instanceof FormData)) throw new Error("FormData esperado");
    const clientId = String(d.get("clientId") || "");
    const file = d.get("file");
    const weekStr = String(d.get("week") || "");
    const notes = String(d.get("notes") || "");
    const visible = String(d.get("visibleToClient") || "true");
    if (!clientId) throw new Error("clientId obrigatório");
    if (!(file instanceof File)) throw new Error("Arquivo obrigatório");
    const week = parseInt(weekStr, 10);
    if (!Number.isFinite(week) || week < 1 || week > TOTAL_WEEKS) {
      throw new Error("Semana inválida (deve ser entre 1 e 12).");
    }
    return {
      clientId,
      file,
      week,
      notes: notes || null,
      visibleToClient: visible === "true" || visible === "1",
    };
  })
  .handler(async ({ data, context }) => {
    const { client, admin } = await authorizeForClient(context, data.clientId);
    // LGPD: bloqueia upload se consentimento photos_internal estiver false.
    const { data: consent } = await admin
      .from("consents")
      .select("photos_internal")
      .eq("client_id", client.id)
      .maybeSingle();
    if (consent && consent.photos_internal === false) {
      throw new Error(
        "Esta cliente não possui consentimento ativo para uso interno de fotos.",
      );
    }
    const file = data.file as File;
    if (file.size > 10 * 1024 * 1024) throw new Error("Arquivo acima de 10MB.");
    if (!file.type.startsWith("image/")) throw new Error("Envie uma imagem.");
    const ext = (file.name.split(".").pop() || "jpg")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const key = `${client.tenant_id}/${client.id}/admin-${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const buf = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from("client-photos")
      .upload(key, buf, { contentType: file.type, upsert: false });
    if (upErr) throw upErr;
    const { data: inserted, error: insErr } = await admin
      .from("client_progress_photos")
      .insert({
        tenant_id: client.tenant_id,
        client_id: client.id,
        storage_key: key,
        week: data.week,
        notes: data.notes,
        source: "admin_upload",
        uploaded_by_user_id: context.userId,
        visible_to_client: data.visibleToClient,
      })
      .select("id")
      .single();
    if (insErr) {
      await admin.storage.from("client-photos").remove([key]);
      throw insErr;
    }
    await logAudit(context, client.tenant_id, "client_photo.admin_upload", inserted.id, {
      client_id: client.id,
      week: data.week,
      visible_to_client: data.visibleToClient,
    });
    return { ok: true, id: inserted.id };
  });

const updateSchema = z
  .object({
    clientId: z.string().uuid(),
    photoId: z.string().uuid(),
    week: z.number().int().min(1).max(TOTAL_WEEKS).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
    visibleToClient: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.week !== undefined || v.notes !== undefined || v.visibleToClient !== undefined,
    { message: "Nada para atualizar." },
  );

export const adminUpdateClientPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => updateSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { client, admin } = await authorizeForClient(context, data.clientId);
    const { data: existing, error: eErr } = await admin
      .from("client_progress_photos")
      .select("id, tenant_id, client_id, week, notes, visible_to_client")
      .eq("id", data.photoId)
      .eq("client_id", client.id)
      .eq("tenant_id", client.tenant_id)
      .maybeSingle();
    if (eErr) throw eErr;
    if (!existing) throw new Error("Foto não encontrada.");
    const patch: Record<string, unknown> = {};
    if (data.week !== undefined) patch.week = data.week;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.visibleToClient !== undefined) patch.visible_to_client = data.visibleToClient;
    const { error: uErr } = await admin
      .from("client_progress_photos")
      .update(patch as any)
      .eq("id", existing.id);
    if (uErr) throw uErr;
    await logAudit(context, client.tenant_id, "client_photo.update", existing.id, {
      client_id: client.id,
      from: {
        week: existing.week,
        notes: existing.notes,
        visible_to_client: existing.visible_to_client,
      },
      to: patch,
    });
    // Recalcula missão semanal de foto (mudança de week em client_upload pode
    // alterar a conclusão da semana atual).
    try {
      const { ensureAndSyncWeeklyPhotoMission } = await import("./thermofit-client-app.functions");
      await ensureAndSyncWeeklyPhotoMission(admin, client);
    } catch {}
    return { ok: true };
  });

export const adminDeleteClientPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ clientId: z.string().uuid(), photoId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { client, admin } = await authorizeForClient(context, data.clientId);
    const { data: row, error } = await admin
      .from("client_progress_photos")
      .select("id, storage_key, week, source")
      .eq("id", data.photoId)
      .eq("client_id", client.id)
      .eq("tenant_id", client.tenant_id)
      .maybeSingle();
    if (error) throw error;
    if (!row) return { ok: true };
    const { error: rmErr } = await admin.storage
      .from("client-photos")
      .remove([row.storage_key]);
    if (rmErr) {
      // Mark for cleanup: hide from clients and audit-log the orphan risk.
      await admin
        .from("client_progress_photos")
        .update({ visible_to_client: false })
        .eq("id", row.id);
      await logAudit(context, client.tenant_id, "client_photo.delete_failed", row.id, {
        client_id: client.id,
        storage_key: row.storage_key,
        error: rmErr.message,
      });
      throw new Error(
        "Não foi possível remover o arquivo do armazenamento. O registro foi ocultado da cliente para revisão.",
      );
    }
    const { error: dErr } = await admin
      .from("client_progress_photos")
      .delete()
      .eq("id", row.id);
    if (dErr) throw dErr;
    await logAudit(context, client.tenant_id, "client_photo.delete", row.id, {
      client_id: client.id,
      storage_key: row.storage_key,
      week: row.week,
      source: row.source,
    });
    try {
      const { ensureAndSyncWeeklyPhotoMission } = await import("./thermofit-client-app.functions");
      await ensureAndSyncWeeklyPhotoMission(admin, client);
    } catch {}
    return { ok: true };
  });
