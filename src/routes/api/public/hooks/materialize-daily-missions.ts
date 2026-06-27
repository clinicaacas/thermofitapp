import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Job diário (00:01 America/Sao_Paulo) e gatilho administrativo manual.
// Materializa missões estruturais do dia para todas as jornadas ativas.
// Não concede Milhas. Não cria conclusões. Apenas INSERT ... ON CONFLICT DO NOTHING.
//
// Autenticação obrigatória:
//  - Cron (pg_cron): envia header `x-cron-secret` igual a process.env.CRON_SECRET.
//  - Admin manual: envia Bearer do usuário; precisa ser super_admin/dono/admin.
// Publishable key sozinha NÃO autoriza.
export const Route = createFileRoute("/api/public/hooks/materialize-daily-missions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = process.env.SUPABASE_URL!;
        const cronSecret = process.env.CRON_SECRET;
        const cronHeader = request.headers.get("x-cron-secret");

        let authorized = false;

        if (cronSecret && cronHeader && cronHeader === cronSecret) {
          authorized = true;
        } else {
          const authHeader = request.headers.get("authorization") ?? request.headers.get("Authorization");
          const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
          if (token) {
            const userClient = createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY!, {
              auth: { persistSession: false, autoRefreshToken: false },
              global: { headers: { Authorization: `Bearer ${token}` } },
            });
            const { data: userData } = await userClient.auth.getUser();
            if (userData?.user) {
              const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
              const { data: prof } = await supabaseAdmin
                .from("profiles")
                .select("profile,status")
                .eq("id", userData.user.id)
                .maybeSingle();
              if (
                prof?.status === "ativo" &&
                ["super_admin", "dono", "admin"].includes(prof.profile)
              ) {
                authorized = true;
              }
            }
          }
        }

        if (!authorized) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let day: string | null = null;
        try {
          const body = (await request.json()) as { day?: string };
          day = body?.day ?? null;
        } catch {
          // body opcional
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc(
          "materialize_daily_missions_all",
          day ? { _day: day } : ({} as any),
        );
        if (error) {
          console.error("materialize_daily_missions_all failed", error);
          return new Response(JSON.stringify({ error: "internal" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return Response.json({ ok: true, result: data });
      },
    },
  },
});
