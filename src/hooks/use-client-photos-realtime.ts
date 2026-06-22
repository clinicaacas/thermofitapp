import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to realtime changes on public.client_progress_photos for a single
 * client_id and call onChange (debounced) on every INSERT/UPDATE/DELETE.
 *
 * The channel transmits only change notifications — no signed URLs and no
 * cross-client rows (server-side filter on client_id). Consumers should call
 * their authenticated server functions inside `onChange` to refresh data.
 */
export function useClientPhotosRealtime(
  clientId: string | null | undefined,
  onChange: () => void,
  debounceMs = 300,
) {
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  useEffect(() => {
    if (!clientId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => cbRef.current(), debounceMs);
    };
    const channel = supabase
      .channel(`client-photos:${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "client_progress_photos",
          filter: `client_id=eq.${clientId}`,
        },
        () => fire(),
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [clientId, debounceMs]);
}
