
-- 1) Tornar coluna nullable e remover default ruim
ALTER TABLE public.clients ALTER COLUMN active_journey_id DROP DEFAULT;
ALTER TABLE public.clients ALTER COLUMN active_journey_id DROP NOT NULL;

-- 2) Reparar dados: anular jornadas ativas que não existem ou não pertencem ao mesmo cliente/tenant
WITH bad AS (
  SELECT c.id
  FROM public.clients c
  LEFT JOIN public.client_journeys j ON j.id = c.active_journey_id
  WHERE c.active_journey_id IS NOT NULL
    AND (j.id IS NULL OR j.client_id <> c.id OR j.tenant_id <> c.tenant_id)
)
UPDATE public.clients SET active_journey_id = NULL
WHERE id IN (SELECT id FROM bad);

-- 3) Trigger de integridade: jornada ativa precisa pertencer ao mesmo cliente e tenant
CREATE OR REPLACE FUNCTION public.validate_clients_active_journey()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_client uuid; v_tenant uuid;
BEGIN
  IF NEW.active_journey_id IS NULL THEN RETURN NEW; END IF;
  SELECT client_id, tenant_id INTO v_client, v_tenant
    FROM public.client_journeys WHERE id = NEW.active_journey_id;
  IF v_client IS NULL THEN
    RAISE EXCEPTION 'active_journey_id % does not reference an existing journey', NEW.active_journey_id;
  END IF;
  IF v_client <> NEW.id OR v_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'active_journey_id % does not belong to this client/tenant', NEW.active_journey_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_clients_active_journey ON public.clients;
CREATE CONSTRAINT TRIGGER trg_validate_clients_active_journey
  AFTER INSERT OR UPDATE OF active_journey_id, tenant_id ON public.clients
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_clients_active_journey();

-- 4) RPC transacional para iniciar (ou reiniciar) Plano de Voo
CREATE OR REPLACE FUNCTION public.start_client_journey(
  _client_id uuid,
  _start_date date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_caller uuid := auth.uid();
  v_authorized boolean;
  v_journey_id uuid;
  v_start date;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT tenant_id INTO v_tenant FROM public.clients WHERE id = _client_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'client not found'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_caller AND p.status = 'ativo'
      AND (
        p.profile = 'super_admin'
        OR (p.tenant_id = v_tenant AND p.profile IN ('dono','admin','equipe'))
      )
  ) INTO v_authorized;
  IF NOT v_authorized THEN RAISE EXCEPTION 'forbidden'; END IF;

  v_start := COALESCE(_start_date, (now() AT TIME ZONE 'America/Sao_Paulo')::date);

  -- Arquiva jornada ativa atual, se houver
  UPDATE public.client_journeys
    SET status = 'archived'
    WHERE client_id = _client_id AND status = 'active';

  INSERT INTO public.client_journeys (tenant_id, client_id, started_on, status)
  VALUES (v_tenant, _client_id, v_start, 'active')
  RETURNING id INTO v_journey_id;

  UPDATE public.clients
    SET active_journey_id = v_journey_id,
        start_date = v_start,
        updated_at = now()
    WHERE id = _client_id;

  -- Materializa missões estruturais (idempotente)
  PERFORM public.generate_journey_missions(_client_id, v_journey_id);
  PERFORM public.ensure_daily_missions(_client_id, v_journey_id, v_start);

  RETURN jsonb_build_object(
    'journeyId', v_journey_id,
    'startedOn', v_start,
    'clientId', _client_id,
    'tenantId', v_tenant
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_client_journey(uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION public.start_client_journey(uuid, date) TO authenticated;
