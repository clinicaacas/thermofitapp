import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveJourneyDay, PROGRAM_DURATION_DAYS } from "./journey-day";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type VideoDayState =
  | "video_available"
  | "video_done"
  | "no_video_today"
  | "prior_pending"
  | "all_completed"
  | "journey_finished";

export const getClientVideoDayState = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: client, error: cErr } = await admin
      .from("clients")
      .select("id, tenant_id, active_journey_id, start_date")
      .eq("id", data.clientId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!client) throw new Error("Cliente não encontrada.");

    const journeyId = (client as any).active_journey_id as string | null;
    let journeyStatus: string | null = null;
    let startedOn: string | null = (client as any).start_date ?? null;
    if (journeyId) {
      const { data: j } = await admin
        .from("client_journeys")
        .select("status, started_on")
        .eq("id", journeyId)
        .maybeSingle();
      journeyStatus = (j as any)?.status ?? null;
      startedOn = (j as any)?.started_on ?? startedOn;
    }
    const day = resolveJourneyDay({ startDate: startedOn, status: journeyStatus });

    // Sem jornada ou jornada encerrada → estado final
    if (!journeyId || day.journeyStatus === "archived" || day.journeyStatus === "completed") {
      return {
        state: "journey_finished" as VideoDayState,
        journeyStatus: day.journeyStatus,
        journeyDayNumber: day.journeyDayNumber,
        programDurationDays: PROGRAM_DURATION_DAYS,
        todayVideos: [] as any[],
        pendingPriorVideos: 0,
        nextReleaseDay: null as number | null,
      };
    }

    // Listar vídeos elegíveis do tenant para esta jornada
    let q = admin
      .from("videos")
      .select(
        "id, title, category, release_day, thumbnail_url, thumbnail_storage_key, miles_on_complete, min_completion_pct, journey_id",
      )
      .eq("tenant_id", client.tenant_id)
      .eq("status", "ativo");
    q = q.or(`journey_id.is.null,journey_id.eq.${journeyId}`);
    const { data: videos, error: vErr } = await q.order("release_day", { ascending: true, nullsFirst: true });
    if (vErr) throw vErr;
    const all = (videos ?? []).filter((v: any) => v.release_day != null);

    // Convenção oficial: release_day é 1-indexado (Dia 1 = release_day 1).
    // release_day = 0 é conteúdo inicial (fica sempre disponível a partir do Dia 1).
    const todayIdx = day.journeyDayNumber; // 1..N
    const todayVideosRaw = all.filter((v: any) => {
      const rd = Number(v.release_day);
      return rd === todayIdx || (todayIdx === 1 && rd === 0);
    });
    const priorVideos = all.filter((v: any) => {
      const rd = Number(v.release_day);
      return rd < todayIdx && !(todayIdx === 1 && rd === 0);
    });
    const futureVideos = all.filter((v: any) => Number(v.release_day) > todayIdx);

    // GETTER É READ-ONLY: não chama ensure_video_mission / award_miles / nenhum
    // RPC de materialização. A criação da missão `video_complete` acontece em
    // mutações explícitas: saveVideo (sincroniza para o dia atual) e o cron
    // diário (materialize_daily_missions_all). Em casos legados, ainda existe
    // a chance de não haver missão materializada; o app exibe o vídeo do dia
    // mesmo assim, e a missão é criada na próxima execução autorizada.

    // Progresso da cliente em todos os vídeos relevantes
    const ids = all.map((v: any) => v.id);
    let progMap = new Map<string, any>();
    if (ids.length) {
      const { data: progRows } = await admin
        .from("client_video_progress")
        .select("video_id, progress_percent, is_completed")
        .eq("client_id", client.id)
        .in("video_id", ids);
      progMap = new Map((progRows ?? []).map((p: any) => [p.video_id, p]));
    }

    // Buscar missões de hoje para anexar missionId
    const today = addDaysISO(startedOn, todayIdx);
    const { data: missions } = await admin
      .from("client_missions")
      .select("id, linked_video_id")
      .eq("client_id", client.id)
      .eq("journey_id", journeyId)
      .eq("mission_type", "video_complete")
      .eq("due_date", today);
    const missionByVideo = new Map((missions ?? []).map((m: any) => [m.linked_video_id, m.id]));

    // Assinar thumbnails
    const signed = await Promise.all(
      todayVideosRaw.map(async (v: any) => {
        if (!v.thumbnail_storage_key) return v.thumbnail_url ?? "";
        const { data: s } = await admin.storage.from("video-thumbnails").createSignedUrl(v.thumbnail_storage_key, 3600);
        return s?.signedUrl ?? v.thumbnail_url ?? "";
      }),
    );

    const todayVideos = todayVideosRaw.map((v: any, i: number) => {
      const p: any = progMap.get(v.id);
      return {
        videoId: v.id,
        missionId: missionByVideo.get(v.id) ?? null,
        title: v.title,
        category: v.category,
        thumbnailUrl: signed[i],
        miles: Number(v.miles_on_complete ?? 0),
        minCompletionPct: Number(v.min_completion_pct ?? 90),
        completed: !!p?.is_completed,
        progressPct: Number(p?.progress_percent ?? 0),
      };
    });

    const pendingPriorVideos = priorVideos.filter((v: any) => !progMap.get(v.id)?.is_completed).length;
    const nextReleaseDay = futureVideos.length ? Number(futureVideos[0].release_day) + 1 : null;
    const allPlannedCompleted =
      all.length > 0 && all.every((v: any) => progMap.get(v.id)?.is_completed) && futureVideos.length === 0;

    // REGRA OFICIAL: o bloco "Vídeo do Dia" considera apenas o grupo do dia atual.
    // Não agrega backlog de vídeos anteriores (isso é responsabilidade da aba Vídeos).
    let state: VideoDayState;
    if (todayVideos.length > 0) {
      state = todayVideos.every((v) => v.completed) ? "video_done" : "video_available";
    } else if (allPlannedCompleted) {
      state = "all_completed";
    } else {
      state = "no_video_today";
    }

    return {
      state,
      journeyStatus: day.journeyStatus,
      journeyDayNumber: day.journeyDayNumber,
      programDurationDays: PROGRAM_DURATION_DAYS,
      todayVideos,
      pendingPriorVideos,
      nextReleaseDay,
    };
  });

function addDaysISO(start: string | null, days: number) {
  if (!start) return new Date().toISOString().slice(0, 10);
  const d = new Date(`${start.slice(0, 10)}T12:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
