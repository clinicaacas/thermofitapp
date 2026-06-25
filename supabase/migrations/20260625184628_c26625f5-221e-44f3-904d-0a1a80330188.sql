
-- =========================================================
-- ENTREGA 1 — Fundação Missões & Milhas ThermoFit
-- =========================================================

-- 1) mission_settings: defaults oficiais editáveis por tenant
CREATE TABLE IF NOT EXISTS public.mission_settings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  mission_kind  text NOT NULL,
  label         text NOT NULL,
  default_miles integer NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, mission_kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_settings TO authenticated;
GRANT ALL ON public.mission_settings TO service_role;
ALTER TABLE public.mission_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mission_settings tenant read"   ON public.mission_settings FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id) OR tenant_id = public.tenant_id_for_client_user(auth.uid()));
CREATE POLICY "mission_settings tenant manage" ON public.mission_settings FOR ALL    TO authenticated USING (public.is_profile_manager(auth.uid(), tenant_id)) WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));
CREATE TRIGGER trg_mission_settings_updated BEFORE UPDATE ON public.mission_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) miles_ledger: ledger oficial idempotente
CREATE TABLE IF NOT EXISTS public.miles_ledger (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  source_kind     text NOT NULL,
  source_ref      text,
  miles           integer NOT NULL,
  reason          text NOT NULL DEFAULT '',
  idempotency_key text NOT NULL,
  occurred_on     date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  awarded_at      timestamptz NOT NULL DEFAULT now(),
  awarded_by      uuid,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (client_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_miles_ledger_client_day ON public.miles_ledger (client_id, occurred_on);
CREATE INDEX IF NOT EXISTS idx_miles_ledger_tenant     ON public.miles_ledger (tenant_id, awarded_at);
GRANT SELECT, INSERT ON public.miles_ledger TO authenticated;
GRANT ALL ON public.miles_ledger TO service_role;
ALTER TABLE public.miles_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "miles_ledger client reads own" ON public.miles_ledger FOR SELECT TO authenticated USING (client_id = public.client_id_for_user(auth.uid()));
CREATE POLICY "miles_ledger tenant reads"     ON public.miles_ledger FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "miles_ledger tenant inserts"   ON public.miles_ledger FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "miles_ledger client inserts"   ON public.miles_ledger FOR INSERT TO authenticated WITH CHECK (client_id = public.client_id_for_user(auth.uid()));

-- 3) client_seals
CREATE TABLE IF NOT EXISTS public.client_seals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  seal_code     text NOT NULL,
  miles_awarded integer NOT NULL DEFAULT 0,
  awarded_at    timestamptz NOT NULL DEFAULT now(),
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (client_id, seal_code)
);
GRANT SELECT, INSERT ON public.client_seals TO authenticated;
GRANT ALL ON public.client_seals TO service_role;
ALTER TABLE public.client_seals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_seals client reads" ON public.client_seals FOR SELECT TO authenticated USING (client_id = public.client_id_for_user(auth.uid()));
CREATE POLICY "client_seals tenant reads" ON public.client_seals FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "client_seals tenant writes" ON public.client_seals FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- 4) client_journey_milestones
CREATE TABLE IF NOT EXISTS public.client_journey_milestones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  milestone_code  text NOT NULL,
  miles_threshold integer NOT NULL,
  reached_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, milestone_code)
);
GRANT SELECT, INSERT ON public.client_journey_milestones TO authenticated;
GRANT ALL ON public.client_journey_milestones TO service_role;
ALTER TABLE public.client_journey_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "milestones client reads" ON public.client_journey_milestones FOR SELECT TO authenticated USING (client_id = public.client_id_for_user(auth.uid()));
CREATE POLICY "milestones tenant reads" ON public.client_journey_milestones FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "milestones tenant writes" ON public.client_journey_milestones FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- 5) miles_audit_log: justificativa obrigatória em correção manual
CREATE TABLE IF NOT EXISTS public.miles_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  actor_id      uuid,
  action        text NOT NULL,
  justification text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_miles_audit_client ON public.miles_audit_log (client_id, created_at);
GRANT SELECT, INSERT ON public.miles_audit_log TO authenticated;
GRANT ALL ON public.miles_audit_log TO service_role;
ALTER TABLE public.miles_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "miles_audit tenant reads"  ON public.miles_audit_log FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "miles_audit tenant writes" ON public.miles_audit_log FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- 6) Extensão de client_missions / client_mission_completions p/ ledger
ALTER TABLE public.client_mission_completions
  ADD COLUMN IF NOT EXISTS source_kind text,
  ADD COLUMN IF NOT EXISTS source_ref  text,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- 7) award_miles: gravação idempotente e segura (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.award_miles(
  _client_id uuid,
  _source_kind text,
  _source_ref text,
  _miles integer,
  _idempotency_key text,
  _reason text DEFAULT '',
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS public.miles_ledger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_row public.miles_ledger;
BEGIN
  IF _miles IS NULL OR _miles = 0 THEN
    RAISE EXCEPTION 'award_miles: miles must be non-zero';
  END IF;
  IF _idempotency_key IS NULL OR length(_idempotency_key) < 4 THEN
    RAISE EXCEPTION 'award_miles: idempotency_key required';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.clients WHERE id = _client_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'award_miles: client not found';
  END IF;

  INSERT INTO public.miles_ledger
    (tenant_id, client_id, source_kind, source_ref, miles, reason, idempotency_key, awarded_by, metadata)
  VALUES
    (v_tenant, _client_id, _source_kind, _source_ref, _miles, COALESCE(_reason,''), _idempotency_key, auth.uid(), COALESCE(_metadata,'{}'::jsonb))
  ON CONFLICT (client_id, idempotency_key) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM public.miles_ledger
    WHERE client_id = _client_id AND idempotency_key = _idempotency_key;
  END IF;

  RETURN v_row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.award_miles(uuid,text,text,integer,text,text,jsonb) TO authenticated, service_role;

-- 8) get_today_mission_summary: fonte única
CREATE OR REPLACE FUNCTION public.get_today_mission_summary(_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_total integer;
  v_done  integer;
  v_miles_today integer;
  v_miles_total integer;
BEGIN
  SELECT COUNT(*) INTO v_total
    FROM public.client_missions
    WHERE client_id = _client_id AND active = true AND due_date = v_today;

  SELECT COUNT(*) INTO v_done
    FROM public.client_mission_completions c
    JOIN public.client_missions m ON m.id = c.mission_id
    WHERE c.client_id = _client_id AND m.due_date = v_today;

  SELECT COALESCE(SUM(miles),0) INTO v_miles_today
    FROM public.miles_ledger
    WHERE client_id = _client_id AND occurred_on = v_today;

  SELECT COALESCE(SUM(miles),0) INTO v_miles_total
    FROM public.miles_ledger WHERE client_id = _client_id;

  RETURN jsonb_build_object(
    'date', v_today,
    'total', v_total,
    'completed', v_done,
    'pending', GREATEST(v_total - v_done, 0),
    'milesToday', v_miles_today,
    'milesTotal', v_miles_total
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_today_mission_summary(uuid) TO authenticated, service_role;

-- 9) Backfill ledger a partir de completions existentes (idempotente)
INSERT INTO public.miles_ledger
  (tenant_id, client_id, source_kind, source_ref, miles, reason, idempotency_key, occurred_on, awarded_at)
SELECT
  c.tenant_id, c.client_id, 'mission_completion', c.mission_id::text,
  c.miles_awarded, 'backfill', 'backfill:completion:'||c.id::text,
  (c.completed_at AT TIME ZONE 'America/Sao_Paulo')::date, c.completed_at
FROM public.client_mission_completions c
WHERE c.miles_awarded <> 0
ON CONFLICT (client_id, idempotency_key) DO NOTHING;

-- 10) Seed defaults oficiais de Milhas por tenant
INSERT INTO public.mission_settings (tenant_id, mission_kind, label, default_miles, active)
SELECT t.id, k.mission_kind, k.label, k.default_miles, true
FROM public.tenants t
CROSS JOIN (VALUES
  ('video_watch_90',      'Assistir vídeo do dia até 90%', 5),
  ('video_task',          'Responder tarefa do vídeo', 10),
  ('daily_checkin',       'Me Conta Sua Jornada (check-in diário)', 5),
  ('hydration_goal',      'Atingir meta de hidratação (2L)', 10),
  ('meal_confirm',        'Confirmar alimentação', 5),
  ('workout_full',        'Treino: musculação + cardio', 10),
  ('workout_cardio',      'Treino: só cardio', 10),
  ('workout_rest',        'Hoje não treinei', 0),
  ('workout_photo_bonus', 'Foto do treino (bônus diário)', 5),
  ('weekly_evolution_photo','Foto de evolução semanal', 15),
  ('seal_streak_7',       'Selo: 7 dias consecutivos', 20),
  ('seal_streak_14',      'Selo: 14 dias consecutivos', 40),
  ('seal_streak_21',      'Selo: 21 dias consecutivos', 70),
  ('seal_program_complete','Selo: Programa completo', 100)
) AS k(mission_kind, label, default_miles)
ON CONFLICT (tenant_id, mission_kind) DO NOTHING;
