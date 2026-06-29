import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getClientIdentity } from "@/lib/thermofit-client-app.functions";
import { supabase } from "@/integrations/supabase/client";

export type ClientIdentity = {
  clientId: string;
  tenantId: string;
  journeyId: string | null;
};

// Identidade da cliente para escopo de cache (tenant + jornada ativa).
// Toda query de vídeo DEVE incluir tenantId e journeyId na queryKey
// para evitar reuso de cache após troca de jornada, plano ou sessão.
export function useClientIdentity(clientId: string | null | undefined) {
  const fetchIdentity = useServerFn(getClientIdentity);
  const q = useQuery({
    queryKey: ["client-identity", clientId],
    queryFn: () => fetchIdentity({ data: { clientId: clientId! } }),
    enabled: !!clientId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });
  return q.data as ClientIdentity | undefined;
}

// Invalida e remove caches de vídeo da identidade anterior quando a
// jornada ativa ou o tenant da cliente muda (novo Plano de Voo, etc.).
export function useVideoCacheGuard(identity: ClientIdentity | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!identity) return;
    qc.cancelQueries({
      predicate: (q) => {
        const k = q.queryKey as unknown[];
        const head = String(k[0] ?? "");
        if (!head.startsWith("client-video")) return false;
        // Remove qualquer chave de vídeo cuja tupla (tenantId, clientId, journeyId)
        // não coincida com a identidade atual.
        const sameClient = k.includes(identity.clientId);
        const sameTenant = k.includes(identity.tenantId);
        const sameJourney = identity.journeyId ? k.includes(identity.journeyId) : true;
        return !(sameClient && sameTenant && sameJourney);
      },
    });
    qc.removeQueries({
      predicate: (q) => {
        const k = q.queryKey as unknown[];
        const head = String(k[0] ?? "");
        if (!head.startsWith("client-video")) return false;
        const sameClient = k.includes(identity.clientId);
        const sameTenant = k.includes(identity.tenantId);
        const sameJourney = identity.journeyId ? k.includes(identity.journeyId) : true;
        return !(sameClient && sameTenant && sameJourney);
      },
    });
  }, [identity?.tenantId, identity?.clientId, identity?.journeyId, qc]);
}

// Limpa cache inteiro em logout / troca de sessão.
export function useAuthSessionGuard() {
  const qc = useQueryClient();
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "USER_UPDATED" || event === "SIGNED_IN") {
        qc.cancelQueries();
        qc.removeQueries({
          predicate: (q) => {
            const head = String((q.queryKey as unknown[])[0] ?? "");
            return (
              head.startsWith("client-") ||
              head === "mission-summary" ||
              head === "journey-progress" ||
              head === "daily-routine" ||
              head === "weekly-photo-state" ||
              head === "post-video-task-state"
            );
          },
        });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);
}
