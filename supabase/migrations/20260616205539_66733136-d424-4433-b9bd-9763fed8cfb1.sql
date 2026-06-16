
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS access_email text,
  ADD COLUMN IF NOT EXISTS access_status text NOT NULL DEFAULT 'sem_acesso',
  ADD COLUMN IF NOT EXISTS last_access_at timestamptz;

CREATE INDEX IF NOT EXISTS clients_auth_user_idx ON public.clients(auth_user_id);

CREATE OR REPLACE FUNCTION public.client_id_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.clients WHERE auth_user_id = _user_id LIMIT 1; $$;

CREATE OR REPLACE FUNCTION public.tenant_id_for_client_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT tenant_id FROM public.clients WHERE auth_user_id = _user_id LIMIT 1; $$;

DROP POLICY IF EXISTS "Client reads own client row" ON public.clients;
CREATE POLICY "Client reads own client row" ON public.clients
  FOR SELECT TO authenticated USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "Client reads own missions" ON public.client_missions;
CREATE POLICY "Client reads own missions" ON public.client_missions
  FOR SELECT TO authenticated
  USING (client_id = public.client_id_for_user(auth.uid()));

DROP POLICY IF EXISTS "Client manages own mission completions" ON public.client_mission_completions;
CREATE POLICY "Client manages own mission completions" ON public.client_mission_completions
  FOR ALL TO authenticated
  USING (client_id = public.client_id_for_user(auth.uid()))
  WITH CHECK (client_id = public.client_id_for_user(auth.uid()));

DROP POLICY IF EXISTS "Client manages own hydration" ON public.client_hydration_logs;
CREATE POLICY "Client manages own hydration" ON public.client_hydration_logs
  FOR ALL TO authenticated
  USING (client_id = public.client_id_for_user(auth.uid()))
  WITH CHECK (client_id = public.client_id_for_user(auth.uid()));

DROP POLICY IF EXISTS "Client reads own letters" ON public.client_letters;
CREATE POLICY "Client reads own letters" ON public.client_letters
  FOR SELECT TO authenticated
  USING (client_id = public.client_id_for_user(auth.uid()));

DROP POLICY IF EXISTS "Client manages own photos" ON public.client_progress_photos;
CREATE POLICY "Client manages own photos" ON public.client_progress_photos
  FOR ALL TO authenticated
  USING (client_id = public.client_id_for_user(auth.uid()))
  WITH CHECK (client_id = public.client_id_for_user(auth.uid()));

DROP POLICY IF EXISTS "Client manages own vacuum" ON public.client_vacuum_sessions;
CREATE POLICY "Client manages own vacuum" ON public.client_vacuum_sessions
  FOR ALL TO authenticated
  USING (client_id = public.client_id_for_user(auth.uid()))
  WITH CHECK (client_id = public.client_id_for_user(auth.uid()));

DROP POLICY IF EXISTS "Client manages own pulse" ON public.client_weekly_pulse;
CREATE POLICY "Client manages own pulse" ON public.client_weekly_pulse
  FOR ALL TO authenticated
  USING (client_id = public.client_id_for_user(auth.uid()))
  WITH CHECK (client_id = public.client_id_for_user(auth.uid()));

DROP POLICY IF EXISTS "Client reads own nutrition plans" ON public.client_nutrition_plans;
CREATE POLICY "Client reads own nutrition plans" ON public.client_nutrition_plans
  FOR SELECT TO authenticated
  USING (client_id = public.client_id_for_user(auth.uid()));

DROP POLICY IF EXISTS "Client reads own workout plans" ON public.client_workout_plans;
CREATE POLICY "Client reads own workout plans" ON public.client_workout_plans
  FOR SELECT TO authenticated
  USING (client_id = public.client_id_for_user(auth.uid()));

DROP POLICY IF EXISTS "Client reads own app settings" ON public.client_app_settings;
CREATE POLICY "Client reads own app settings" ON public.client_app_settings
  FOR SELECT TO authenticated
  USING (tenant_id = public.tenant_id_for_client_user(auth.uid()));
