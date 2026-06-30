import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

// Same-origin PDF streamer for workout materials.
// Auth is enforced via a short-lived HMAC token minted by `mintWorkoutMaterialToken`.
// Avoids ERR_BLOCKED_BY_CLIENT (ad blockers blocking *.supabase.co) by serving
// the file from the ThermoFit domain itself.
export const Route = createFileRoute("/api/public/materiais/treino")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("t") ?? "";
        const dl = url.searchParams.get("dl") === "1";
        const [payloadB64, sig] = token.split(".");
        if (!payloadB64 || !sig) {
          return new Response("Token inválido", { status: 400 });
        }
        const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!secret) return new Response("Servidor mal configurado", { status: 500 });

        const expected = createHmac("sha256", secret).update(payloadB64).digest("hex");
        let a: Buffer, b: Buffer;
        try {
          a = Buffer.from(sig, "hex");
          b = Buffer.from(expected, "hex");
        } catch {
          return new Response("Assinatura inválida", { status: 401 });
        }
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Assinatura inválida", { status: 401 });
        }

        let payload: { p?: string; e?: number };
        try {
          payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
        } catch {
          return new Response("Payload inválido", { status: 400 });
        }
        if (!payload.p || !payload.e || payload.e * 1000 < Date.now()) {
          return new Response("Token expirado", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: file, error } = await supabaseAdmin.storage
          .from("workout-materials")
          .download(payload.p);
        if (error || !file) {
          return new Response("Arquivo não encontrado", { status: 404 });
        }
        const buf = await file.arrayBuffer();
        const rawName = payload.p.split("/").pop() || "material.pdf";
        const safeName = rawName.replace(/[^a-zA-Z0-9._-]+/g, "_");
        return new Response(buf, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `${dl ? "attachment" : "inline"}; filename="${safeName}"`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
          },
        });
      },
    },
  },
});
