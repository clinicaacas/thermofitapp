
CREATE TABLE public.client_vacuum_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rounds INTEGER NOT NULL CHECK (rounds > 0),
  total_seconds INTEGER NOT NULL CHECK (total_seconds >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_vacuum_sessions_client_performed
  ON public.client_vacuum_sessions (client_id, performed_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_vacuum_sessions TO authenticated;
GRANT ALL ON public.client_vacuum_sessions TO service_role;

ALTER TABLE public.client_vacuum_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members manage vacuum sessions"
  ON public.client_vacuum_sessions
  FOR ALL
  TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
