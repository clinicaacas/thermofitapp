
-- 1) Permitir status 'archived' em client_journeys (a função start_client_journey já tenta arquivar a jornada anterior)
ALTER TABLE public.client_journeys DROP CONSTRAINT IF EXISTS client_journeys_status_check;
ALTER TABLE public.client_journeys
  ADD CONSTRAINT client_journeys_status_check
  CHECK (status IN ('active','ended','archived'));

-- 2) RPC transacional única: cria cliente, consentimentos e (opcionalmente) inicia o Plano de Voo
CREATE OR REPLACE FUNCTION public.create_client_with_journey(
  _payload jsonb,
  _consents jsonb DEFAULT '{}'::jsonb,
  _start_journey boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_tenant uuid;
  v_authorized boolean;
  v_client_id uuid;
  v_start date;
  v_journey_id uuid;
  v_name text;
  v_initial text;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT tenant_id INTO v_tenant FROM public.profiles WHERE id = v_caller AND status = 'ativo';
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'forbidden: caller has no active profile'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_caller AND p.status = 'ativo'
      AND p.profile IN ('super_admin','dono','admin','equipe')
  ) INTO v_authorized;
  IF NOT v_authorized THEN RAISE EXCEPTION 'forbidden: caller cannot create clients'; END IF;

  v_name := trim(coalesce(_payload->>'name',''));
  IF length(v_name) = 0 THEN RAISE EXCEPTION 'invalid: name required'; END IF;
  v_initial := upper(substr(v_name, 1, 1));
  v_start := COALESCE((_payload->>'startDate')::date, (now() AT TIME ZONE 'America/Sao_Paulo')::date);

  INSERT INTO public.clients (
    tenant_id, name, email, phone, birth_date, start_date, plan, goal, complaint,
    clinical_notes, hydration_goal_ml, status, avatar_initial, created_by, active_journey_id
  ) VALUES (
    v_tenant,
    v_name,
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
    v_initial,
    v_caller,
    NULL
  ) RETURNING id INTO v_client_id;

  -- Consentimentos (não fatal)
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
  EXCEPTION WHEN OTHERS THEN
    -- consentimentos com erro não devem derrubar a criação
    NULL;
  END;

  IF _start_journey THEN
    INSERT INTO public.client_journeys (tenant_id, client_id, started_on, status)
    VALUES (v_tenant, v_client_id, v_start, 'active')
    RETURNING id INTO v_journey_id;

    UPDATE public.clients
      SET active_journey_id = v_journey_id,
          start_date = v_start,
          updated_at = now()
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

REVOKE ALL ON FUNCTION public.create_client_with_journey(jsonb, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_client_with_journey(jsonb, jsonb, boolean) TO authenticated, service_role;
