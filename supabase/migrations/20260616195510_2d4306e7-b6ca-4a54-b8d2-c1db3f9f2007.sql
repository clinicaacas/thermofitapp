CREATE TABLE public.client_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_letters_client_sent ON public.client_letters (client_id, sent_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_letters TO authenticated;
GRANT ALL ON public.client_letters TO service_role;

ALTER TABLE public.client_letters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members manage letters"
  ON public.client_letters
  FOR ALL
  TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));