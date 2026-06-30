import { useSearch } from "@tanstack/react-router";
import { useClientAppRuntimeOptional } from "@/lib/client-app-runtime";

/**
 * Camada oficial e única para resolver a identidade do App da Cliente.
 *
 * Ordem de resolução:
 *  1. ClientAppRuntimeProvider (modo `client` ou `preview`) — fonte canônica.
 *  2. Fallback transitório: ?clientId=... da URL (compatível com as views
 *     `app.*.tsx` legadas que ainda lêem `useSearch`). Será removido quando
 *     todas as views forem migradas.
 *
 * Não criar novos fallbacks fora deste hook. Não ler `useAuth`, querystring
 * ou contextos administrativos em views do App — sempre passar por aqui.
 */
export type ResolvedClientAppIdentity = {
  mode: "client" | "preview" | "unknown";
  tenantId: string | null;
  clientId: string | null;
  journeyId: string | null;
  isResolving: boolean;
};

export function useResolvedClientAppIdentity(): ResolvedClientAppIdentity {
  const runtime = useClientAppRuntimeOptional();
  const search = useSearch({ strict: false }) as { clientId?: string };

  if (runtime) {
    return {
      mode: runtime.mode,
      tenantId: runtime.tenantId,
      clientId: runtime.clientId,
      journeyId: runtime.journeyId,
      isResolving: runtime.isResolving,
    };
  }

  return {
    mode: "unknown",
    tenantId: null,
    clientId: search?.clientId ?? null,
    journeyId: null,
    isResolving: false,
  };
}
