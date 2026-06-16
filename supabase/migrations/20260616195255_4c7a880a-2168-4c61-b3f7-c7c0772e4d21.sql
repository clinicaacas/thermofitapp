CREATE TABLE public.client_workout_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Plano de treino',
  frequency_per_week INTEGER,
  duration_minutes INTEGER,
  focus TEXT,
  notes TEXT,
  sessions JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_workout_plans_client ON public.client_workout_plans (client_id, active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_workout_plans TO authenticated;
GRANT ALL ON public.client_workout_plans TO service_role;

ALTER TABLE public.client_workout_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members manage workout plans"
  ON public.client_workout_plans
  FOR ALL
  TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TRIGGER update_client_workout_plans_updated_at
  BEFORE UPDATE ON public.client_workout_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();