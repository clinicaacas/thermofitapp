import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Job diário (00:01 America/Sao_Paulo) e gatilho administrativo manual.
// Materializa missões estruturais do dia para todas as jornadas ativas.
// Não concede Milhas. Não cria conclusões. Apenas INSERT ... ON CONFLICT DO NOTHING.
export const Route = createFileRoute("/api/public/hooks/materialize-daily-missions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
        if (!apiKey || !expected || apiKey !== expected) {
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
        const admin = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        const { data, error } = await admin.rpc("materialize_daily_missions_all", {
          _day: day,
        });
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
