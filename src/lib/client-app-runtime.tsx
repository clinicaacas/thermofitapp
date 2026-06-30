import { createContext, useContext, useMemo, type ReactNode } from "react";

/**
 * Camada única de runtime do App da Cliente.
 *
 * Toda tela do App da Cliente DEVE obter identidade desta camada — nunca
 * diretamente de `useSearch`, `useAuth`, querystring, contexto admin ou
 * clientId manual. Isso garante que as mesmas views funcionem em:
 *
 *  - mode="client"  → App real (sessão da cliente logada)
 *  - mode="preview" → Preview administrativo (identidade resolvida server-side)
 *
 * A2.1 cria a camada e a aplica em `/app` em modo "client" sem migrar as
 * views. A migração das views para `useClientAppRuntime()` acontece em A2.2,
 * junto com a remoção do iframe e a entrada do modo "preview".
 */
export type ClientAppRuntimeMode = "client" | "preview";

export type ClientAppRuntime = {
  mode: ClientAppRuntimeMode;
  tenantId: string | null;
  clientId: string | null;
  journeyId: string | null;
  /** Indica que a identidade ainda está sendo resolvida (preview/loading). */
  isResolving: boolean;
};

const ClientAppRuntimeContext = createContext<ClientAppRuntime | null>(null);

export function ClientAppRuntimeProvider({
  mode,
  tenantId,
  clientId,
  journeyId,
  isResolving = false,
  children,
}: {
  mode: ClientAppRuntimeMode;
  tenantId: string | null;
  clientId: string | null;
  journeyId: string | null;
  isResolving?: boolean;
  children: ReactNode;
}) {
  const value = useMemo<ClientAppRuntime>(
    () => ({ mode, tenantId, clientId, journeyId, isResolving }),
    [mode, tenantId, clientId, journeyId, isResolving],
  );
  return (
    <ClientAppRuntimeContext.Provider value={value}>
      {children}
    </ClientAppRuntimeContext.Provider>
  );
}

/** Lança se chamada fora do provider. Use nas views após A2.2. */
export function useClientAppRuntime(): ClientAppRuntime {
  const ctx = useContext(ClientAppRuntimeContext);
  if (!ctx) {
    throw new Error(
      "useClientAppRuntime deve ser usado dentro de <ClientAppRuntimeProvider>.",
    );
  }
  return ctx;
}

/** Variante não-lançadora para componentes compartilhados que ainda
 * podem ser renderizados fora do runtime durante a migração A2.2. */
export function useClientAppRuntimeOptional(): ClientAppRuntime | null {
  return useContext(ClientAppRuntimeContext);
}
