
-- ============================================
-- TURNO A — Fundação: client_journeys + journey_id em tabelas críticas
-- Aditivo e seguro: preserva todo o histórico e Milhas existentes.
-- ============================================

-- 1) Entidade oficial de jornadas
CREATE TABLE IF NOT EXISTS public.client_journeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  journey_number integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  started_on date NOT NULL,
  ended_on date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, journey_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_journeys TO authenticated;
GRANT ALL ON public.client_journeys TO service_role;

ALTER TABLE public.client_journeys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client reads own journeys" ON public.client_journeys;
CREATE POLICY "client reads own journeys" ON public.client_journeys
  FOR SELECT TO authenticated
  USING (client_id = public.client_id_for_user(auth.uid()));

DROP POLICY IF EXISTS "tenant members read journeys" ON public.client_journeys;
CREATE POLICY "tenant members read journeys" ON public.client_journeys
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "managers manage journeys" ON public.client_journeys;
CREATE POLICY "managers manage journeys" ON public.client_journeys
  FOR ALL TO authenticated
  USING (public.is_profile_manager(auth.uid(), tenant_id))
  WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_journey_per_client
  ON public.client_journeys (client_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_client_journeys_tenant ON public.client_journeys (tenant_id);

DROP TRIGGER IF EXISTS client_journeys_updated_at ON public.client_journeys;
CREATE TRIGGER client_journeys_updated_at
  BEFORE UPDATE ON public.client_journeys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Backfill: cria 1 jornada por cliente reutilizando o UUID existente em clients.active_journey_id
INSERT INTO public.client_journeys (id, tenant_id, client_id, journey_number, status, started_on)
SELECT c.active_journey_id, c.tenant_id, c.id, 1, 'active', c.start_date
FROM public.clients c
WHERE c.active_journey_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 3) FK em clients.active_journey_id
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_active_journey_id_fkey;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_active_journey_id_fkey
  FOREIGN KEY (active_journey_id) REFERENCES public.client_journeys(id) ON DELETE RESTRICT;

-- 4) Adicionar journey_id em tabelas dependentes (NULLABLE, backfill, depois NOT NULL)

-- 4a) client_daily_responses
ALTER TABLE public.client_daily_responses
  ADD COLUMN IF NOT EXISTS journey_id uuid;
UPDATE public.client_daily_responses r
  SET journey_id = c.active_journey_id
  FROM public.clients c
  WHERE r.client_id = c.id AND r.journey_id IS NULL;
ALTER TABLE public.client_daily_responses
  ALTER COLUMN journey_id SET NOT NULL;
ALTER TABLE public.client_daily_responses
  DROP CONSTRAINT IF EXISTS client_daily_responses_journey_id_fkey;
ALTER TABLE public.client_daily_responses
  ADD CONSTRAINT client_daily_responses_journey_id_fkey
  FOREIGN KEY (journey_id) REFERENCES public.client_journeys(id) ON DELETE CASCADE;
ALTER TABLE public.client_daily_responses
  DROP CONSTRAINT IF EXISTS client_daily_responses_client_id_response_date_key;
ALTER TABLE public.client_daily_responses
  ADD CONSTRAINT client_daily_responses_journey_date_key
  UNIQUE (client_id, journey_id, response_date);

-- 4b) miles_ledger
ALTER TABLE public.miles_ledger
  ADD COLUMN IF NOT EXISTS journey_id uuid;
UPDATE public.miles_ledger m
  SET journey_id = c.active_journey_id
  FROM public.clients c
  WHERE m.client_id = c.id AND m.journey_id IS NULL;
ALTER TABLE public.miles_ledger
  ALTER COLUMN journey_id SET NOT NULL;
ALTER TABLE public.miles_ledger
  DROP CONSTRAINT IF EXISTS miles_ledger_journey_id_fkey;
ALTER TABLE public.miles_ledger
  ADD CONSTRAINT miles_ledger_journey_id_fkey
  FOREIGN KEY (journey_id) REFERENCES public.client_journeys(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_miles_ledger_journey ON public.miles_ledger (journey_id, occurred_on);

-- 4c) client_video_progress
ALTER TABLE public.client_video_progress
  ADD COLUMN IF NOT EXISTS journey_id uuid;
UPDATE public.client_video_progress v
  SET journey_id = c.active_journey_id
  FROM public.clients c
  WHERE v.client_id = c.id AND v.journey_id IS NULL;
ALTER TABLE public.client_video_progress
  ALTER COLUMN journey_id SET NOT NULL;
ALTER TABLE public.client_video_progress
  DROP CONSTRAINT IF EXISTS client_video_progress_journey_id_fkey;
ALTER TABLE public.client_video_progress
  ADD CONSTRAINT client_video_progress_journey_id_fkey
  FOREIGN KEY (journey_id) REFERENCES public.client_journeys(id) ON DELETE CASCADE;

-- 4d) client_hydration_logs
ALTER TABLE public.client_hydration_logs
  ADD COLUMN IF NOT EXISTS journey_id uuid;
UPDATE public.client_hydration_logs h
  SET journey_id = c.active_journey_id
  FROM public.clients c
  WHERE h.client_id = c.id AND h.journey_id IS NULL;
ALTER TABLE public.client_hydration_logs
  ALTER COLUMN journey_id SET NOT NULL;
ALTER TABLE public.client_hydration_logs
  DROP CONSTRAINT IF EXISTS client_hydration_logs_journey_id_fkey;
ALTER TABLE public.client_hydration_logs
  ADD CONSTRAINT client_hydration_logs_journey_id_fkey
  FOREIGN KEY (journey_id) REFERENCES public.client_journeys(id) ON DELETE CASCADE;

-- 4e) client_seals
ALTER TABLE public.client_seals
  ADD COLUMN IF NOT EXISTS journey_id uuid;
UPDATE public.client_seals s
  SET journey_id = c.active_journey_id
  FROM public.clients c
  WHERE s.client_id = c.id AND s.journey_id IS NULL;
ALTER TABLE public.client_seals
  ALTER COLUMN journey_id SET NOT NULL;
ALTER TABLE public.client_seals
  DROP CONSTRAINT IF EXISTS client_seals_journey_id_fkey;
ALTER TABLE public.client_seals
  ADD CONSTRAINT client_seals_journey_id_fkey
  FOREIGN KEY (journey_id) REFERENCES public.client_journeys(id) ON DELETE CASCADE;
ALTER TABLE public.client_seals
  DROP CONSTRAINT IF EXISTS client_seals_client_id_seal_code_key;
ALTER TABLE public.client_seals
  ADD CONSTRAINT client_seals_journey_seal_key
  UNIQUE (client_id, journey_id, seal_code);

-- 4f) client_journey_milestones
ALTER TABLE public.client_journey_milestones
  ADD COLUMN IF NOT EXISTS journey_id uuid;
UPDATE public.client_journey_milestones m
  SET journey_id = c.active_journey_id
  FROM public.clients c
  WHERE m.client_id = c.id AND m.journey_id IS NULL;
ALTER TABLE public.client_journey_milestones
  ALTER COLUMN journey_id SET NOT NULL;
ALTER TABLE public.client_journey_milestones
  DROP CONSTRAINT IF EXISTS client_journey_milestones_journey_id_fkey;
ALTER TABLE public.client_journey_milestones
  ADD CONSTRAINT client_journey_milestones_journey_id_fkey
  FOREIGN KEY (journey_id) REFERENCES public.client_journeys(id) ON DELETE CASCADE;

-- 4g) client_mission_completions
ALTER TABLE public.client_mission_completions
  ADD COLUMN IF NOT EXISTS journey_id uuid;
UPDATE public.client_mission_completions cm
  SET journey_id = c.active_journey_id
  FROM public.clients c
  WHERE cm.client_id = c.id AND cm.journey_id IS NULL;
ALTER TABLE public.client_mission_completions
  ALTER COLUMN journey_id SET NOT NULL;
ALTER TABLE public.client_mission_completions
  DROP CONSTRAINT IF EXISTS client_mission_completions_journey_id_fkey;
ALTER TABLE public.client_mission_completions
  ADD CONSTRAINT client_mission_completions_journey_id_fkey
  FOREIGN KEY (journey_id) REFERENCES public.client_journeys(id) ON DELETE CASCADE;

-- 4h) client_missions: journey_id já existe nullable. Backfill e NOT NULL.
UPDATE public.client_missions m
  SET journey_id = c.active_journey_id
  FROM public.clients c
  WHERE m.client_id = c.id AND m.journey_id IS NULL;
ALTER TABLE public.client_missions
  ALTER COLUMN journey_id SET NOT NULL;
ALTER TABLE public.client_missions
  DROP CONSTRAINT IF EXISTS client_missions_journey_id_fkey;
ALTER TABLE public.client_missions
  ADD CONSTRAINT client_missions_journey_id_fkey
  FOREIGN KEY (journey_id) REFERENCES public.client_journeys(id) ON DELETE CASCADE;

-- 5) award_miles: aceita journey_id explícito (default lê active_journey_id do cliente)
CREATE OR REPLACE FUNCTION public.award_miles(
  _client_id uuid,
  _source_kind text,
  _source_ref text,
  _miles integer,
  _idempotency_key text,
  _reason text DEFAULT ''::text,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _journey_id uuid DEFAULT NULL
)
RETURNS public.miles_ledger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_journey uuid;
  v_row public.miles_ledger;
BEGIN
  IF _miles IS NULL OR _miles = 0 THEN
    RAISE EXCEPTION 'award_miles: miles must be non-zero';
  END IF;
  IF _idempotency_key IS NULL OR length(_idempotency_key) < 4 THEN
    RAISE EXCEPTION 'award_miles: idempotency_key required';
  END IF;

  SELECT tenant_id, active_journey_id INTO v_tenant, v_journey
    FROM public.clients WHERE id = _client_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'award_miles: client not found';
  END IF;

  v_journey := COALESCE(_journey_id, v_journey);
  IF v_journey IS NULL THEN
    RAISE EXCEPTION 'award_miles: journey not resolved for client';
  END IF;

  INSERT INTO public.miles_ledger
    (tenant_id, client_id, journey_id, source_kind, source_ref, miles, reason, idempotency_key, awarded_by, metadata)
  VALUES
    (v_tenant, _client_id, v_journey, _source_kind, _source_ref, _miles, COALESCE(_reason,''), _idempotency_key, auth.uid(), COALESCE(_metadata,'{}'::jsonb))
  ON CONFLICT (client_id, idempotency_key) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM public.miles_ledger
      WHERE client_id = _client_id AND idempotency_key = _idempotency_key;
  END IF;

  RETURN v_row;
END;
$function$;

-- 6) get_today_mission_summary: escopo na jornada ativa
CREATE OR REPLACE FUNCTION public.get_today_mission_summary(_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_journey uuid;
  v_total integer;
  v_done  integer;
  v_miles_today integer;
  v_miles_total integer;
BEGIN
  SELECT active_journey_id INTO v_journey FROM public.clients WHERE id = _client_id;

  SELECT COUNT(*) INTO v_total
    FROM public.client_missions
    WHERE client_id = _client_id AND active = true AND due_date = v_today
      AND (v_journey IS NULL OR journey_id = v_journey);

  SELECT COUNT(*) INTO v_done
    FROM public.client_mission_completions c
    JOIN public.client_missions m ON m.id = c.mission_id
    WHERE c.client_id = _client_id AND m.due_date = v_today
      AND (v_journey IS NULL OR c.journey_id = v_journey);

  SELECT COALESCE(SUM(miles),0) INTO v_miles_today
    FROM public.miles_ledger
    WHERE client_id = _client_id AND occurred_on = v_today
      AND (v_journey IS NULL OR journey_id = v_journey);

  SELECT COALESCE(SUM(miles),0) INTO v_miles_total
    FROM public.miles_ledger
    WHERE client_id = _client_id
      AND (v_journey IS NULL OR journey_id = v_journey);

  RETURN jsonb_build_object(
    'date', v_today,
    'journeyId', v_journey,
    'total', v_total,
    'completed', v_done,
    'pending', GREATEST(v_total - v_done, 0),
    'milesToday', v_miles_today,
    'milesTotal', v_miles_total
  );
END;
$function$;
