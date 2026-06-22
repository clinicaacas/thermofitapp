import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to a PRIVATE Supabase Realtime Broadcast channel that signals
 * changes to client_progress_photos for a single client_id. The channel never
 * carries row data — only `{ type, clientId, change, photoId, occurredAt }`.
 * Consumers MUST refetch via authenticated server functions inside `onChange`.
 *
 * Authorization is enforced by RLS on `realtime.messages`:
 * only the owning client (auth_user_id) or an active tenant member may join
 * the topic `client-photos:<clientId>`. The channel name is NOT a secret on
 * its own — RLS is the gate.
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
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!cancelled) cbRef.current();
      }, debounceMs);
    };

    (async () => {
      // Authenticate the realtime socket for private channels.
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          await supabase.realtime.setAuth(session.access_token);
        }
      } catch {
        // ignore; private subscribe will simply fail and we'll get no events
      }
      if (cancelled) return;
      channel = supabase
        .channel(`client-photos:${clientId}`, { config: { private: true } })
        .on("broadcast", { event: "client_photo_changed" }, () => fire());
      channel.subscribe();
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [clientId, debounceMs]);
}
