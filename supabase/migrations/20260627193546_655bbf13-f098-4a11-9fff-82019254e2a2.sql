
-- ============================================================
-- Phase 1: Multi-clinic memberships foundation
-- ============================================================

-- 1) Memberships table
CREATE TABLE IF NOT EXISTS public.profile_tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('dono','admin','equipe')),
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  deactivated_at timestamptz,
  deactivated_by uuid,
  CONSTRAINT profile_tenant_memberships_unique UNIQUE (profile_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS profile_tenant_memberships_tenant_idx
  ON public.profile_tenant_memberships(tenant_id);
CREATE INDEX IF NOT EXISTS profile_tenant_memberships_profile_idx
  ON public.profile_tenant_memberships(profile_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_tenant_memberships TO authenticated;
GRANT ALL ON public.profile_tenant_memberships TO service_role;
ALTER TABLE public.profile_tenant_memberships ENABLE ROW LEVEL SECURITY;

-- updated_at trigger
DROP TRIGGER IF EXISTS update_profile_tenant_memberships_updated_at
  ON public.profile_tenant_memberships;
CREATE TRIGGER update_profile_tenant_memberships_updated_at
  BEFORE UPDATE ON public.profile_tenant_memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Authorization helpers
CREATE OR REPLACE FUNCTION public.has_tenant_access(
  _user_id uuid, _tenant_id uuid, _roles text[] DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    -- Super admin = global access
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id AND p.status = 'ativo' AND p.profile = 'super_admin'
  ) OR EXISTS (
    SELECT 1 FROM public.profile_tenant_memberships m
    JOIN public.profiles p ON p.id = m.profile_id
    WHERE m.profile_id = _user_id
      AND m.tenant_id = _tenant_id
      AND m.status = 'ativo'
      AND p.status = 'ativo'
      AND (_roles IS NULL OR m.role = ANY(_roles))
  );
$$;

CREATE OR REPLACE FUNCTION public.count_active_super_admins()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::int FROM public.profiles
  WHERE profile = 'super_admin' AND status = 'ativo';
$$;

-- 3) RLS policies on memberships
DROP POLICY IF EXISTS "memberships_select" ON public.profile_tenant_memberships;
CREATE POLICY "memberships_select" ON public.profile_tenant_memberships
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_member(auth.uid(), tenant_id)
    OR profile_id = auth.uid()
  );

DROP POLICY IF EXISTS "memberships_write" ON public.profile_tenant_memberships;
CREATE POLICY "memberships_write" ON public.profile_tenant_memberships
  FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_profile_manager(auth.uid(), tenant_id)
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.is_profile_manager(auth.uid(), tenant_id)
  );

-- 4) Backfill from current profiles
INSERT INTO public.profile_tenant_memberships (profile_id, tenant_id, role, status, created_by)
SELECT p.id, p.tenant_id,
  CASE WHEN p.profile IN ('dono','admin','equipe') THEN p.profile ELSE 'equipe' END,
  CASE WHEN p.status = 'ativo' THEN 'ativo' ELSE 'inativo' END,
  p.id
FROM public.profiles p
WHERE p.profile IN ('dono','admin','equipe')
  AND p.tenant_id IS NOT NULL
ON CONFLICT (profile_id, tenant_id) DO NOTHING;

-- 5) E2E demo tenant
INSERT INTO public.tenants (
  slug, clinic_name, system_name, system_subtitle, public_app_url,
  owner_name, contact_email, city, state, status, plan_id,
  account_type, user_limit, client_limit
) VALUES (
  'acas-demo-e2e',
  'ACAS DEMO — E2E / NÃO USAR EM PRODUÇÃO',
  'ThermoFit ACAS DEMO (E2E)',
  'Ambiente isolado para testes técnicos',
  'https://thermofitapp.lovable.app',
  'Ambiente Técnico de Testes',
  'qa+e2e@thermofit.test',
  'São Luís', 'Maranhão',
  'ativa', 'interno', 'e2e_test_tenant', -1, -1
)
ON CONFLICT (slug) DO UPDATE SET
  clinic_name = EXCLUDED.clinic_name,
  account_type = 'e2e_test_tenant';

-- 6) create_client_with_journey: tenant-aware
CREATE OR REPLACE FUNCTION public.create_client_with_journey(
  _payload jsonb, _consents jsonb DEFAULT '{}'::jsonb, _start_journey boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_tenant uuid;
  v_requested_tenant uuid;
  v_is_super boolean;
  v_authorized boolean;
  v_client_id uuid;
  v_start date;
  v_journey_id uuid;
  v_name text;
  v_initial text;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  v_is_super := public.is_super_admin(v_caller);

  -- Resolve tenant: payload override (super admin only) or caller's default
  BEGIN
    v_requested_tenant := NULLIF(_payload->>'tenantId','')::uuid;
  EXCEPTION WHEN OTHERS THEN v_requested_tenant := NULL; END;

  IF v_requested_tenant IS NOT NULL THEN
    IF NOT v_is_super AND NOT public.has_tenant_access(v_caller, v_requested_tenant, ARRAY['dono','admin','equipe']) THEN
      RAISE EXCEPTION 'forbidden: caller has no access to requested tenant';
    END IF;
    v_tenant := v_requested_tenant;
  ELSE
    SELECT tenant_id INTO v_tenant FROM public.profiles
      WHERE id = v_caller AND status = 'ativo';
    IF v_tenant IS NULL THEN RAISE EXCEPTION 'forbidden: caller has no active profile'; END IF;
  END IF;

  IF NOT v_is_super THEN
    v_authorized := public.has_tenant_access(v_caller, v_tenant, ARRAY['dono','admin','equipe']);
    IF NOT v_authorized THEN RAISE EXCEPTION 'forbidden: caller cannot create clients in tenant'; END IF;
  END IF;

  v_name := trim(coalesce(_payload->>'name',''));
  IF length(v_name) = 0 THEN RAISE EXCEPTION 'invalid: name required'; END IF;
  v_initial := upper(substr(v_name, 1, 1));
  v_start := COALESCE(NULLIF(_payload->>'startDate','')::date, (now() AT TIME ZONE 'America/Sao_Paulo')::date);

  INSERT INTO public.clients (
    tenant_id, name, email, phone, birth_date, start_date, plan, goal, complaint,
    clinical_notes, hydration_goal_ml, status, avatar_initial, created_by, active_journey_id
  ) VALUES (
    v_tenant, v_name,
    NULLIF(_payload->>'email',''),
    NULLIF(_payload->>'phone',''),
    NULLIF(_payload->>'birthDate','')::date,
    v_start,
    NULLIF(_payload->>'plan',''),
    NULLIF(_payload->>'goal',''),
    NULLIF(_payload->>'complaint',''),
    NULLIF(_payload->>'clinicalNotes',''),
    COALESCE((_payload->>'hydrationGoalMl')::int, 2000),
    COALESCE(NULLIF(_payload->>'status',''),'ativa'),
    v_initial, v_caller, NULL
  ) RETURNING id INTO v_client_id;

  BEGIN
    INSERT INTO public.consents (
      tenant_id, client_id, terms, privacy, data_processing, photos_internal, photos_marketing
    ) VALUES (
      v_tenant, v_client_id,
      COALESCE((_consents->>'terms')::boolean,false),
      COALESCE((_consents->>'privacy')::boolean,false),
      COALESCE((_consents->>'dataProcessing')::boolean,false),
      COALESCE((_consents->>'photosInternal')::boolean,false),
      COALESCE((_consents->>'photosMarketing')::boolean,false)
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  IF _start_journey THEN
    INSERT INTO public.client_journeys (tenant_id, client_id, started_on, status)
    VALUES (v_tenant, v_client_id, v_start, 'active')
    RETURNING id INTO v_journey_id;

    UPDATE public.clients
      SET active_journey_id = v_journey_id, start_date = v_start, updated_at = now()
      WHERE id = v_client_id;

    PERFORM public.generate_journey_missions(v_client_id, v_journey_id);
    PERFORM public.ensure_daily_missions(v_client_id, v_journey_id, v_start);
  END IF;

  RETURN jsonb_build_object(
    'clientId', v_client_id,
    'journeyId', v_journey_id,
    'tenantId', v_tenant,
    'startedOn', v_start
  );
END;
$$;
