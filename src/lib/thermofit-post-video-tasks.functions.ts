import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function assertManager(supabase: any, userId: string, tenantId: string) {
  const { data, error } = await supabase.rpc("has_tenant_access", {
    _user_id: userId,
    _tenant_id: tenantId,
    _roles: ["dono", "admin", "equipe"],
  });
  if (error) throw error;
  if (!data) throw new Error("Sem permissão para gerenciar tarefas neste tenant.");
}

// =====================================================================
// ADMIN — CRUD
// =====================================================================
export const listPostVideoTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        tenantId: z.string().uuid(),
        videoId: z.string().uuid().optional(),
        journeyId: z.string().uuid().optional(),
        includeArchived: z.boolean().optional().default(false),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.tenantId);
    const admin = await getAdmin();
    let q = admin
      .from("video_post_tasks")
      .select(
        "id, tenant_id, video_id, journey_id, title, instruction, ordering, miles, response_required, active, archived_at, created_at, updated_at",
      )
      .eq("tenant_id", data.tenantId)
      .order("video_id", { ascending: true })
      .order("ordering", { ascending: true });
    if (data.videoId) q = q.eq("video_id", data.videoId);
    if (data.journeyId) q = q.eq("journey_id", data.journeyId);
    if (!data.includeArchived) q = q.is("archived_at", null);
    const { data: rows, error } = await q;
    if (error) throw error;

    const videoIds = Array.from(new Set((rows ?? []).map((r: any) => r.video_id)));
    let videos = new Map<string, any>();
    if (videoIds.length) {
      const { data: vRows } = await admin
        .from("videos")
        .select("id, title, status, release_day, journey_id")
        .in("id", videoIds);
      videos = new Map((vRows ?? []).map((v: any) => [v.id, v]));
    }
    return {
      tasks: (rows ?? []).map((r: any) => ({ ...r, video: videos.get(r.video_id) ?? null })),
    };
  });

const saveSchema = z.object({
  id: z.string().uuid().optional(),
  tenantId: z.string().uuid(),
  videoId: z.string().uuid(),
  journeyId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(2).max(140),
  instruction: z.string().trim().max(2000).default(""),
  ordering: z.number().int().min(1).max(99),
  miles: z.number().int().min(0).max(50),
  responseRequired: z.boolean(),
  active: z.boolean(),
});

export const savePostVideoTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => saveSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.tenantId);
    const admin = await getAdmin();
    const payload: any = {
      tenant_id: data.tenantId,
      video_id: data.videoId,
      journey_id: data.journeyId ?? null,
      title: data.title,
      instruction: data.instruction,
      ordering: data.ordering,
      miles: data.miles,
      response_required: data.responseRequired,
      active: data.active,
      updated_by: context.userId,
    };
    if (data.id) {
      const { error } = await admin.from("video_post_tasks").update(payload).eq("id", data.id);
      if (error) throw error;
      return { ok: true, id: data.id };
    }
    payload.created_by = context.userId;
    const { data: row, error } = await admin
      .from("video_post_tasks")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: row.id };
  });

export const archivePostVideoTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid(), tenantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.tenantId);
    const admin = await getAdmin();
    const { error } = await admin
      .from("video_post_tasks")
      .update({ archived_at: new Date().toISOString(), archived_by: context.userId, active: false })
      .eq("id", data.id)
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    return { ok: true };
  });

// =====================================================================
// APP DA CLIENTE — leitura/conclusão
// =====================================================================

// Lista as tarefas pós-vídeo materializadas para a cliente hoje (filtra legados inválidos)
export const listClientPostVideoTasks = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: client, error: cErr } = await admin
      .from("clients")
      .select("id, tenant_id, active_journey_id")
      .eq("id", data.clientId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!client) throw new Error("Cliente não encontrada.");
    const journeyId = (client as any).active_journey_id as string | null;
    if (!journeyId) return { tasks: [] as any[] };

    // Considera todas as missões post_video_task ativas da cliente nesta jornada
    // (não filtra por due_date, para que uma tarefa criada após a conclusão do vídeo apareça).
    const { data: missions, error: mErr } = await admin
      .from("client_missions")
      .select("id, linked_video_id, task_ref, due_date, miles")
      .eq("client_id", client.id)
      .eq("journey_id", journeyId)
      .eq("mission_type", "post_video_task")
      .eq("active", true);
    if (mErr) throw mErr;

    // Mantém só missões com task_ref UUID válido (descarta legados "daily"/null)
    const valid = (missions ?? []).filter(
      (m: any) => m.task_ref && UUID_RE.test(m.task_ref) && m.linked_video_id,
    );
    if (valid.length === 0) return { tasks: [] };

    const taskIds = Array.from(new Set(valid.map((m: any) => m.task_ref)));
    const videoIds = Array.from(new Set(valid.map((m: any) => m.linked_video_id)));

    const [{ data: tasks }, { data: videos }, { data: completions }, { data: responses }, { data: videoProgress }] =
      await Promise.all([
        admin
          .from("video_post_tasks")
          .select("id, title, instruction, miles, response_required, active, archived_at")
          .in("id", taskIds),
        admin.from("videos").select("id, title").in("id", videoIds),
        admin
          .from("client_mission_completions")
          .select("mission_id, completed_at")
          .eq("client_id", client.id)
          .in("mission_id", valid.map((m: any) => m.id)),
        admin
          .from("client_task_responses")
          .select("mission_id, response, completed_at")
          .eq("client_id", client.id)
          .in("mission_id", valid.map((m: any) => m.id)),
        admin
          .from("client_video_progress")
          .select("video_id, is_completed")
          .eq("client_id", client.id)
          .in("video_id", videoIds),
      ]);

    const taskMap = new Map((tasks ?? []).map((t: any) => [t.id, t]));
    const videoMap = new Map((videos ?? []).map((v: any) => [v.id, v]));
    const completionMap = new Map((completions ?? []).map((c: any) => [c.mission_id, c]));
    const responseMap = new Map((responses ?? []).map((r: any) => [r.mission_id, r]));
    const videoCompletedSet = new Set(
      (videoProgress ?? []).filter((p: any) => p.is_completed).map((p: any) => p.video_id),
    );

    const rows = valid
      .map((m: any) => {
        const t: any = taskMap.get(m.task_ref);
        const v: any = videoMap.get(m.linked_video_id);
        if (!t || !v || !t.active || t.archived_at) return null;
        const completed = completionMap.has(m.id);
        const response = responseMap.get(m.id);
        return {
          missionId: m.id,
          taskId: t.id,
          videoId: v.id,
          videoTitle: v.title,
          title: t.title,
          instruction: t.instruction,
          miles: t.miles,
          responseRequired: t.response_required,
          unlocked: videoCompletedSet.has(v.id),
          completed,
          response: (response?.response as string | null) ?? null,
          completedAt: (response?.completed_at as string | null) ?? null,
        };
      })
      .filter(Boolean);
    return { tasks: rows };
  });

const completeSchema = z.object({
  clientId: z.string().uuid(),
  missionId: z.string().uuid(),
  response: z.string().trim().max(2000).optional(),
});

export const completePostVideoTask = createServerFn({ method: "POST" })
  .inputValidator((i) => completeSchema.parse(i))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: client } = await admin
      .from("clients")
      .select("id, tenant_id, active_journey_id")
      .eq("id", data.clientId)
      .maybeSingle();
    if (!client) throw new Error("Cliente não encontrada.");
    const journeyId = (client as any).active_journey_id as string | null;
    if (!journeyId) throw new Error("Jornada ativa não definida.");

    const { data: mission, error: mErr } = await admin
      .from("client_missions")
      .select("id, tenant_id, client_id, journey_id, due_date, linked_video_id, task_ref, mission_type")
      .eq("id", data.missionId)
      .maybeSingle();
    if (mErr) throw mErr;
    if (!mission) throw new Error("Missão não encontrada.");
    if (mission.client_id !== client.id || mission.journey_id !== journeyId) {
      throw new Error("Missão não pertence à cliente.");
    }
    if (mission.mission_type !== "post_video_task" || !mission.task_ref || !UUID_RE.test(mission.task_ref)) {
      throw new Error("Missão inválida.");
    }

    const { data: task } = await admin
      .from("video_post_tasks")
      .select("id, tenant_id, video_id, miles, response_required, active, archived_at")
      .eq("id", mission.task_ref)
      .maybeSingle();
    if (!task || !task.active || task.archived_at) throw new Error("Tarefa indisponível.");
    if (task.video_id !== mission.linked_video_id) throw new Error("Tarefa não corresponde ao vídeo da missão.");

    // Exige conclusão do vídeo
    const { data: prog } = await admin
      .from("client_video_progress")
      .select("is_completed")
      .eq("client_id", client.id)
      .eq("video_id", task.video_id)
      .maybeSingle();
    if (!prog?.is_completed) throw new Error("Conclua o vídeo antes de responder a tarefa.");

    if (task.response_required && (!data.response || data.response.trim().length < 2)) {
      throw new Error("Resposta obrigatória.");
    }

    // Resposta (idempotente por mission_id)
    const { error: upErr } = await admin
      .from("client_task_responses")
      .upsert(
        {
          tenant_id: client.tenant_id,
          client_id: client.id,
          journey_id: journeyId,
          mission_id: mission.id,
          linked_video_id: task.video_id,
          task_ref: task.id,
          due_date: mission.due_date,
          response: data.response ?? "",
          completed_at: new Date().toISOString(),
        },
        { onConflict: "client_id,mission_id" },
      );
    if (upErr) throw upErr;

    // Conceder Milhas (idempotente)
    const milesValue = Number(task.miles ?? 0);
    let ledgerRow: any = null;
    if (milesValue > 0) {
      const { data: awardData, error: awardErr } = await admin.rpc("award_miles", {
        _client_id: client.id,
        _source_kind: "post_video_task",
        _source_ref: mission.id,
        _miles: milesValue,
        _idempotency_key: `post_video_task:${mission.id}`,
        _reason: "Tarefa pós-vídeo",
        _metadata: { taskId: task.id, videoId: task.video_id } as any,
        _journey_id: journeyId,
      });
      if (awardErr) throw awardErr;
      ledgerRow = awardData;
    }

    // Marca conclusão da missão (idempotente)
    await admin.from("client_mission_completions").upsert(
      {
        tenant_id: client.tenant_id,
        client_id: client.id,
        mission_id: mission.id,
        journey_id: journeyId,
        miles_awarded: Number(ledgerRow?.miles ?? milesValue),
        source_kind: "post_video_task",
        source_ref: mission.id,
        idempotency_key: `post_video_task:${mission.id}`,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "client_id,mission_id" },
    );

    return { ok: true, awardedMiles: Number(ledgerRow?.miles ?? milesValue) };
  });

// Aplica tarefa a clientes que já concluíram o vídeo (idempotente, sem Milhas)
export const applyTaskToCompletedClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ taskId: z.string().uuid(), tenantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.tenantId);
    const admin = await getAdmin();
    const { data: task } = await admin
      .from("video_post_tasks")
      .select("id, tenant_id, video_id, journey_id, active, archived_at")
      .eq("id", data.taskId)
      .maybeSingle();
    if (!task || !task.active || task.archived_at) throw new Error("Tarefa indisponível.");
    if (task.tenant_id !== data.tenantId) throw new Error("Tarefa fora do tenant.");

    let q = admin
      .from("client_video_progress")
      .select("client_id, journey_id, completed_at, video_id")
      .eq("video_id", task.video_id)
      .eq("is_completed", true);
    if (task.journey_id) q = q.eq("journey_id", task.journey_id);
    const { data: done, error } = await q;
    if (error) throw error;

    let created = 0;
    for (const row of done ?? []) {
      const dueDate = (row as any).completed_at
        ? new Date((row as any).completed_at).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      try {
        await admin.rpc("ensure_post_video_task", {
          _client_id: (row as any).client_id,
          _journey_id: (row as any).journey_id,
          _day: dueDate,
          _video_id: task.video_id as any,
          _task_ref: task.id,
        } as any);
        created += 1;
      } catch (err) {
        console.error("applyTaskToCompletedClients failed for", row, err);
      }
    }
    return { ok: true, processed: created };
  });
