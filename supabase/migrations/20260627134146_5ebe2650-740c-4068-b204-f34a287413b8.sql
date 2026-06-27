
-- 1. Rewards: novas colunas oficiais (idempotente)
ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS reward_type text,
  ADD COLUMN IF NOT EXISTS milestone_miles integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Permitir uma linha oficial por (tenant, reward_type) preservando linhas legadas (reward_type NULL)
CREATE UNIQUE INDEX IF NOT EXISTS rewards_tenant_type_uniq
  ON public.rewards(tenant_id, reward_type)
  WHERE reward_type IS NOT NULL;

-- 2. Reward redemptions: journey_id, status enriquecido, decisão/justificativa
ALTER TABLE public.reward_redemptions
  ADD COLUMN IF NOT EXISTS journey_id uuid,
  ADD COLUMN IF NOT EXISTS justification text NOT NULL DEFAULT '';

-- Backfill journey_id usando a jornada ativa do cliente
UPDATE public.reward_redemptions r
SET journey_id = c.active_journey_id
FROM public.clients c
WHERE r.client_id = c.id AND r.journey_id IS NULL;

-- Status: aceitar antigos + novos (não destrutivo)
ALTER TABLE public.reward_redemptions DROP CONSTRAINT IF EXISTS reward_redemptions_status_check;
ALTER TABLE public.reward_redemptions
  ADD CONSTRAINT reward_redemptions_status_check
  CHECK (status IN ('pendente','aprovado','recusado','bloqueado','liberado','solicitado','entregue','cancelado'));

-- Unicidade parcial: uma solicitação ativa por (cliente, prêmio, jornada)
CREATE UNIQUE INDEX IF NOT EXISTS reward_redemptions_active_uniq
  ON public.reward_redemptions(client_id, reward_id, journey_id)
  WHERE status <> 'cancelado' AND journey_id IS NOT NULL;

-- 3. Marco Check-in (0) — incluir no avaliador, idempotente
CREATE OR REPLACE FUNCTION public.evaluate_client_milestones(_client_id uuid, _journey_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_total int;
  v_thresholds int[] := ARRAY[0,300,600,900,1300];
  v_codes text[] := ARRAY['milestone_checkin','milestone_300','milestone_600','milestone_900','milestone_1300'];
  v_awarded jsonb := '[]'::jsonb;
  i int;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.clients WHERE id = _client_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'evaluate_client_milestones: client not found'; END IF;

  SELECT COALESCE(SUM(miles),0) INTO v_total
    FROM public.miles_ledger
    WHERE client_id = _client_id AND journey_id = _journey_id;

  FOR i IN 1..array_length(v_thresholds,1) LOOP
    IF v_total >= v_thresholds[i] THEN
      INSERT INTO public.client_journey_milestones
        (tenant_id, client_id, journey_id, milestone_code, miles_threshold)
      VALUES (v_tenant, _client_id, _journey_id, v_codes[i], v_thresholds[i])
      ON CONFLICT (client_id, milestone_code) DO NOTHING;
      IF FOUND THEN v_awarded := v_awarded || to_jsonb(v_codes[i]); END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('milesTotal', v_total, 'reached', v_awarded);
END;
$function$;

-- 4. Seed oficial dos 4 prêmios por tenant (idempotente)
INSERT INTO public.rewards (tenant_id, name, description, cost_miles, milestone_miles, stock, status, reward_type, sort_order)
SELECT t.id, x.name, x.description, x.miles, x.miles, 999999, 'ativo', x.reward_type, x.sort_order
FROM public.tenants t
CROSS JOIN (VALUES
  ('mimo',    'Mimo de boas-vindas',                       'Mimo exclusivo ao atingir 300 Milhas',           300, 1),
  ('sessao',  'Sessão bônus de massagem/drenagem',         'Sessão bônus ao atingir 600 Milhas',             600, 2),
  ('voucher', 'Voucher para jantar especial — R$ 300,00',  'Voucher de R$ 300 ao atingir 900 Milhas',        900, 3),
  ('ensaio',  'Ensaio fotográfico de transformação',       'Ensaio fotográfico ao atingir 1.200 Milhas',    1200, 4)
) AS x(reward_type, name, description, miles, sort_order)
ON CONFLICT (tenant_id, reward_type) WHERE reward_type IS NOT NULL
DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  cost_miles = EXCLUDED.cost_miles,
  milestone_miles = EXCLUDED.milestone_miles,
  sort_order = EXCLUDED.sort_order,
  status = 'ativo';

-- 5. Realtime
DO $$
BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='miles_ledger';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.miles_ledger; END IF;
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='client_seals';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.client_seals; END IF;
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='client_journey_milestones';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.client_journey_milestones; END IF;
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='reward_redemptions';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.reward_redemptions; END IF;
END $$;
