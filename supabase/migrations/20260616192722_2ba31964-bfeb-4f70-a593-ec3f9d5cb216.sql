
CREATE TABLE public.client_hydration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  log_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  ml INTEGER NOT NULL CHECK (ml <> 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_hydration_logs_client_date
  ON public.client_hydration_logs (client_id, log_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_hydration_logs TO authenticated;
GRANT ALL ON public.client_hydration_logs TO service_role;

ALTER TABLE public.client_hydration_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members manage hydration logs"
  ON public.client_hydration_logs
  FOR ALL
  TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
