import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Identidade administrativa segura do Preview do App da Cliente.
 *
 * Read-only. Não cria, atualiza, corrige ou audita dados.
 * Valida:
 *  - sessão administrativa autenticada (via requireSupabaseAuth);
 *  - perfil ativo do administrador (super_admin / dono / admin / equipe);
 *  - Super Admin tem acesso global a qualquer tenant;
 *  - Dono / Admin / Equipe só acessam clientes do próprio tenant;
 *  - cliente existe;
 *  - retorna apenas { tenantId, clientId, journeyId, clientName } —
 *    nenhum dado sensível, nenhum tenant/jornada arbitrário do navegador.
 *
 * Esta função NÃO é usada por nenhuma rota nesta entrega (A2.1). Será o
 * único ponto de entrada de identidade do Preview reescrito em A2.2.
 */
export const getPreviewClientIdentity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };

    // 1. Perfil administrativo ativo
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, tenant_id, profile, status")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.status !== "ativo") {
      throw new Error("Acesso administrativo inválido.");
    }
    const role = profile.profile as string;
    const allowedRoles = new Set(["super_admin", "dono", "admin", "equipe"]);
    if (!allowedRoles.has(role)) {
      throw new Error("Perfil sem permissão para Preview.");
    }
    const isSuperAdmin = role === "super_admin";

    // 2. Cliente existe (via cliente RLS-scoped do admin)
    let clientRow:
      | { id: string; tenant_id: string; active_journey_id: string | null; name: string }
      | null = null;
    {
      const { data: row, error } = await supabase
        .from("clients")
        .select("id, tenant_id, active_journey_id, name")
        .eq("id", data.clientId)
        .maybeSingle();
      if (error) throw error;
      clientRow = row as any;
    }

    // Super Admin pode precisar de leitura cross-tenant via admin client.
    if (!clientRow && isSuperAdmin) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: row, error } = await supabaseAdmin
        .from("clients")
        .select("id, tenant_id, active_journey_id, name")
        .eq("id", data.clientId)
        .maybeSingle();
      if (error) throw error;
      clientRow = row as any;
    }

    if (!clientRow) {
      throw new Error("Cliente não encontrada ou sem acesso.");
    }

    // 3. Tenant da cliente vs tenant do administrador
    if (!isSuperAdmin && clientRow.tenant_id !== profile.tenant_id) {
      throw new Error("Cliente fora do tenant autorizado.");
    }

    return {
      tenantId: clientRow.tenant_id,
      clientId: clientRow.id,
      journeyId: clientRow.active_journey_id ?? null,
      clientName: clientRow.name,
    };
  });
