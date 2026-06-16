
-- Missões da cliente
CREATE TABLE public.client_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  miles integer NOT NULL DEFAULT 0,
  due_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_missions TO authenticated;
GRANT ALL ON public.client_missions TO service_role;
ALTER TABLE public.client_missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members manage missions"
  ON public.client_missions FOR ALL
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_client_missions_updated
  BEFORE UPDATE ON public.client_missions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_client_missions_client_date
  ON public.client_missions(client_id, due_date);

-- Conclusões de missões
CREATE TABLE public.client_mission_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES public.client_missions(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  miles_awarded integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, client_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_mission_completions TO authenticated;
GRANT ALL ON public.client_mission_completions TO service_role;
ALTER TABLE public.client_mission_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members manage mission completions"
  ON public.client_mission_completions FOR ALL
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE INDEX idx_mission_completions_client
  ON public.client_mission_completions(client_id, completed_at);
