DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_conversations'
      AND policyname = 'Tenant team inserts support_conversations'
  ) THEN
    CREATE POLICY "Tenant team inserts support_conversations"
      ON public.support_conversations
      FOR INSERT
      TO authenticated
      WITH CHECK (
        public.is_tenant_member(auth.uid(), tenant_id)
        AND EXISTS (
          SELECT 1
          FROM public.clients c
          WHERE c.id = client_id
            AND c.tenant_id = support_conversations.tenant_id
        )
      );
  END IF;
END $$;