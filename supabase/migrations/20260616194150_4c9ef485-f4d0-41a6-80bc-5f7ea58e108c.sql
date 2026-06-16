
CREATE TABLE public.client_weekly_pulse (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  mood SMALLINT NOT NULL CHECK (mood BETWEEN 1 AND 5),
  energy SMALLINT NOT NULL CHECK (energy BETWEEN 1 AND 5),
  hunger SMALLINT NOT NULL CHECK (hunger BETWEEN 1 AND 5),
  sleep SMALLINT NOT NULL CHECK (sleep BETWEEN 1 AND 5),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, week_start)
);

CREATE INDEX idx_client_weekly_pulse_client_week
  ON public.client_weekly_pulse (client_id, week_start DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_weekly_pulse TO authenticated;
GRANT ALL ON public.client_weekly_pulse TO service_role;

ALTER TABLE public.client_weekly_pulse ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members manage weekly pulse"
  ON public.client_weekly_pulse
  FOR ALL
  TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TRIGGER update_client_weekly_pulse_updated_at
  BEFORE UPDATE ON public.client_weekly_pulse
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
