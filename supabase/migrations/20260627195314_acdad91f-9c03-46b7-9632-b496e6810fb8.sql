
DROP POLICY IF EXISTS "Client inserts own support_messages" ON public.support_messages;
CREATE POLICY "Client inserts own support_messages"
  ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_type = 'client'
    AND EXISTS (
      SELECT 1 FROM public.support_conversations c
      WHERE c.id = support_messages.conversation_id
        AND public.client_id_for_user(auth.uid()) = c.client_id
        AND c.tenant_id = support_messages.tenant_id
    )
  );
