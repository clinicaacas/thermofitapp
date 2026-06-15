
CREATE TABLE public.help_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  quick_topic TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'novo',
  created_alert_id UUID REFERENCES public.risk_alerts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.help_messages TO authenticated;
GRANT ALL ON public.help_messages TO service_role;

ALTER TABLE public.help_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers manage tenant help_messages"
  ON public.help_messages FOR ALL TO authenticated
  USING (public.is_profile_manager(auth.uid(), tenant_id))
  WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));

CREATE POLICY "Tenant members view help_messages"
  ON public.help_messages FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TRIGGER update_help_messages_updated_at
  BEFORE UPDATE ON public.help_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
