
-- =======================
-- client_video_progress
-- =======================
CREATE TABLE public.client_video_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  progress_percent integer NOT NULL DEFAULT 0,
  watched_seconds integer NOT NULL DEFAULT 0,
  last_position_seconds integer NOT NULL DEFAULT 0,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  miles_awarded integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, video_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_video_progress TO authenticated;
GRANT ALL ON public.client_video_progress TO service_role;

ALTER TABLE public.client_video_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client sees own video progress"
  ON public.client_video_progress FOR SELECT TO authenticated
  USING (client_id = public.client_id_for_user(auth.uid()));

CREATE POLICY "tenant managers see all video progress"
  ON public.client_video_progress FOR SELECT TO authenticated
  USING (public.is_profile_manager(auth.uid(), tenant_id));

CREATE POLICY "client upserts own video progress"
  ON public.client_video_progress FOR INSERT TO authenticated
  WITH CHECK (client_id = public.client_id_for_user(auth.uid()));

CREATE POLICY "client updates own video progress"
  ON public.client_video_progress FOR UPDATE TO authenticated
  USING (client_id = public.client_id_for_user(auth.uid()))
  WITH CHECK (client_id = public.client_id_for_user(auth.uid()));

CREATE TRIGGER update_client_video_progress_updated_at
  BEFORE UPDATE ON public.client_video_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =======================
-- client_exercise_progress
-- =======================
CREATE TABLE public.client_exercise_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL,
  module text NOT NULL DEFAULT 'vacuum',
  status text NOT NULL DEFAULT 'concluido',
  started_at timestamptz,
  completed_at timestamptz NOT NULL DEFAULT now(),
  duration_seconds integer NOT NULL DEFAULT 0,
  miles_awarded integer NOT NULL DEFAULT 0,
  completion_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, exercise_id, completion_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_exercise_progress TO authenticated;
GRANT ALL ON public.client_exercise_progress TO service_role;

ALTER TABLE public.client_exercise_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client sees own exercise progress"
  ON public.client_exercise_progress FOR SELECT TO authenticated
  USING (client_id = public.client_id_for_user(auth.uid()));

CREATE POLICY "tenant managers see all exercise progress"
  ON public.client_exercise_progress FOR SELECT TO authenticated
  USING (public.is_profile_manager(auth.uid(), tenant_id));

CREATE POLICY "client inserts own exercise progress"
  ON public.client_exercise_progress FOR INSERT TO authenticated
  WITH CHECK (client_id = public.client_id_for_user(auth.uid()));

CREATE TRIGGER update_client_exercise_progress_updated_at
  BEFORE UPDATE ON public.client_exercise_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =======================
-- vacuum_exercises: media + execution fields
-- =======================
ALTER TABLE public.vacuum_exercises
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS instruction_text text,
  ADD COLUMN IF NOT EXISTS duration_seconds integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS sets integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS reps integer,
  ADD COLUMN IF NOT EXISTS miles_reward integer NOT NULL DEFAULT 0;
