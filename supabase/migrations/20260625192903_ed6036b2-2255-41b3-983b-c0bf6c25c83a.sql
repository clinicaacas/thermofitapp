
-- Tabela única de respostas diárias da cliente para a Rotina de Missões.
-- Permite editar a resposta no mesmo dia sem duplicar Milhas (idempotência fica no miles_ledger).
CREATE TABLE IF NOT EXISTS public.client_daily_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  response_date date NOT NULL,
  checkin_done boolean NOT NULL DEFAULT false,
  checkin_at timestamptz,
  meal_choice text CHECK (meal_choice IN ('otima','ok','dificil')),
  meal_at timestamptz,
  workout_choice text CHECK (workout_choice IN ('musc_cardio','cardio','descanso')),
  workout_at timestamptz,
  workout_photo_path text,
  workout_photo_note text,
  workout_photo_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, response_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_daily_responses TO authenticated;
GRANT ALL ON public.client_daily_responses TO service_role;

ALTER TABLE public.client_daily_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client reads own daily responses"
  ON public.client_daily_responses FOR SELECT
  TO authenticated
  USING (client_id = public.client_id_for_user(auth.uid()));

CREATE POLICY "tenant staff reads daily responses"
  ON public.client_daily_responses FOR SELECT
  TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TRIGGER trg_client_daily_responses_updated
  BEFORE UPDATE ON public.client_daily_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_client_daily_responses_client_date
  ON public.client_daily_responses (client_id, response_date DESC);
