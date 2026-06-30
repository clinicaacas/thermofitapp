
-- 1) Add optional PDF to library exercises
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS pdf_path text,
  ADD COLUMN IF NOT EXISTS pdf_uploaded_at timestamptz;

-- 2) Workout plans (one per client journey, with publish lifecycle)
CREATE TABLE IF NOT EXISTS public.workout_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  journey_id uuid REFERENCES public.client_journeys(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','publicado','arquivado')),
  pdf_path text,
  pdf_uploaded_at timestamptz,
  published_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_plans TO authenticated;
GRANT ALL ON public.workout_plans TO service_role;

ALTER TABLE public.workout_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workout_plans tenant members manage"
  ON public.workout_plans FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id) OR public.is_super_admin(auth.uid()));

CREATE POLICY "workout_plans client reads own published"
  ON public.workout_plans FOR SELECT TO authenticated
  USING (
    status = 'publicado'
    AND client_id = public.client_id_for_user(auth.uid())
  );

-- Ensure only one published plan per client/journey
CREATE UNIQUE INDEX IF NOT EXISTS workout_plans_one_published_per_journey
  ON public.workout_plans (client_id, COALESCE(journey_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'publicado';

CREATE INDEX IF NOT EXISTS workout_plans_client_idx ON public.workout_plans(client_id, status);
CREATE INDEX IF NOT EXISTS workout_plans_tenant_idx ON public.workout_plans(tenant_id, status);

CREATE TRIGGER workout_plans_updated_at
  BEFORE UPDATE ON public.workout_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Plan exercises (reference to library + per-plan overrides)
CREATE TABLE IF NOT EXISTS public.plan_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.workout_plans(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE RESTRICT,
  sets integer,
  reps text,
  notes text,
  order_index integer NOT NULL DEFAULT 0,
  pdf_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_exercises TO authenticated;
GRANT ALL ON public.plan_exercises TO service_role;

ALTER TABLE public.plan_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_exercises tenant members manage"
  ON public.plan_exercises FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workout_plans p
    WHERE p.id = plan_exercises.plan_id
      AND (public.is_tenant_member(auth.uid(), p.tenant_id) OR public.is_super_admin(auth.uid()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workout_plans p
    WHERE p.id = plan_exercises.plan_id
      AND (public.is_tenant_member(auth.uid(), p.tenant_id) OR public.is_super_admin(auth.uid()))
  ));

CREATE POLICY "plan_exercises client reads own published"
  ON public.plan_exercises FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workout_plans p
    WHERE p.id = plan_exercises.plan_id
      AND p.status = 'publicado'
      AND p.client_id = public.client_id_for_user(auth.uid())
  ));

CREATE INDEX IF NOT EXISTS plan_exercises_plan_idx ON public.plan_exercises(plan_id, order_index);

CREATE TRIGGER plan_exercises_updated_at
  BEFORE UPDATE ON public.plan_exercises
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Publish-archive guard: archive previous published when a new one is published
CREATE OR REPLACE FUNCTION public.workout_plans_archive_previous()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'publicado' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'publicado') THEN
    UPDATE public.workout_plans
       SET status = 'arquivado', updated_at = now()
     WHERE client_id = NEW.client_id
       AND COALESCE(journey_id, '00000000-0000-0000-0000-000000000000'::uuid)
           = COALESCE(NEW.journey_id, '00000000-0000-0000-0000-000000000000'::uuid)
       AND id <> NEW.id
       AND status = 'publicado';
    IF NEW.published_at IS NULL THEN NEW.published_at := now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workout_plans_archive_previous_trg ON public.workout_plans;
CREATE TRIGGER workout_plans_archive_previous_trg
  BEFORE INSERT OR UPDATE OF status ON public.workout_plans
  FOR EACH ROW EXECUTE FUNCTION public.workout_plans_archive_previous();
