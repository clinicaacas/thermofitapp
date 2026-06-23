
-- ============ support_topics ============
CREATE TABLE public.support_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_topics_tenant_idx ON public.support_topics(tenant_id, active, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_topics TO authenticated;
GRANT ALL ON public.support_topics TO service_role;

ALTER TABLE public.support_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members view support_topics"
  ON public.support_topics FOR SELECT TO authenticated
  USING (
    public.is_tenant_member(auth.uid(), tenant_id)
    OR public.tenant_id_for_client_user(auth.uid()) = tenant_id
  );

CREATE POLICY "Managers manage support_topics"
  ON public.support_topics FOR ALL TO authenticated
  USING (public.is_profile_manager(auth.uid(), tenant_id))
  WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));

CREATE TRIGGER support_topics_updated
  BEFORE UPDATE ON public.support_topics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ support_conversations ============
CREATE TABLE public.support_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  topic_id uuid REFERENCES public.support_topics(id) ON DELETE SET NULL,
  topic_label text,
  status text NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto','em_atendimento','respondido','encerrado')),
  assigned_to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  unread_for_admin boolean NOT NULL DEFAULT true,
  unread_for_client boolean NOT NULL DEFAULT false,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_conv_tenant_idx ON public.support_conversations(tenant_id, status, last_message_at DESC);
CREATE INDEX support_conv_client_idx ON public.support_conversations(client_id, last_message_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_conversations TO authenticated;
GRANT ALL ON public.support_conversations TO service_role;

ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client views own support_conversations"
  ON public.support_conversations FOR SELECT TO authenticated
  USING (public.client_id_for_user(auth.uid()) = client_id);

CREATE POLICY "Client inserts own support_conversations"
  ON public.support_conversations FOR INSERT TO authenticated
  WITH CHECK (
    public.client_id_for_user(auth.uid()) = client_id
    AND public.tenant_id_for_client_user(auth.uid()) = tenant_id
  );

CREATE POLICY "Client updates own support_conversations"
  ON public.support_conversations FOR UPDATE TO authenticated
  USING (public.client_id_for_user(auth.uid()) = client_id)
  WITH CHECK (public.client_id_for_user(auth.uid()) = client_id);

CREATE POLICY "Tenant team views support_conversations"
  ON public.support_conversations FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant team updates support_conversations"
  ON public.support_conversations FOR UPDATE TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TRIGGER support_conv_updated
  BEFORE UPDATE ON public.support_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ support_messages ============
CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('client','admin')),
  sender_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_msg_conv_idx ON public.support_messages(conversation_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_messages TO authenticated;
GRANT ALL ON public.support_messages TO service_role;

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client views own support_messages"
  ON public.support_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.support_conversations c
    WHERE c.id = conversation_id
      AND public.client_id_for_user(auth.uid()) = c.client_id
  ));

CREATE POLICY "Client inserts own support_messages"
  ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_type = 'client'
    AND EXISTS (
      SELECT 1 FROM public.support_conversations c
      WHERE c.id = conversation_id
        AND public.client_id_for_user(auth.uid()) = c.client_id
        AND c.tenant_id = tenant_id
    )
  );

CREATE POLICY "Tenant team views support_messages"
  ON public.support_messages FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant team inserts support_messages"
  ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_type = 'admin'
    AND public.is_tenant_member(auth.uid(), tenant_id)
  );

CREATE POLICY "Tenant team updates support_messages"
  ON public.support_messages FOR UPDATE TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
