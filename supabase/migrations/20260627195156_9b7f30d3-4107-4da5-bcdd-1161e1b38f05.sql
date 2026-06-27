
-- 1) client_mission_completions: read-only para clientes e equipe; escrita só via service role (RPC server-side)
DROP POLICY IF EXISTS "Client manages own mission completions" ON public.client_mission_completions;
DROP POLICY IF EXISTS "tenant members manage mission completions" ON public.client_mission_completions;

CREATE POLICY "client reads own mission completions"
  ON public.client_mission_completions FOR SELECT TO authenticated
  USING (client_id = public.client_id_for_user(auth.uid()));

CREATE POLICY "tenant members read mission completions"
  ON public.client_mission_completions FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_tenant_member(auth.uid(), tenant_id));

-- 2) miles_ledger: imutável para clientes; apenas leitura para clientes/equipe; escrita via award_miles (SECURITY DEFINER) com service role
DROP POLICY IF EXISTS "miles_ledger client inserts" ON public.miles_ledger;
DROP POLICY IF EXISTS "miles_ledger tenant inserts" ON public.miles_ledger;
DROP POLICY IF EXISTS "miles_ledger client reads own" ON public.miles_ledger;
DROP POLICY IF EXISTS "miles_ledger tenant reads" ON public.miles_ledger;

CREATE POLICY "miles_ledger client reads own"
  ON public.miles_ledger FOR SELECT TO authenticated
  USING (client_id = public.client_id_for_user(auth.uid()));

CREATE POLICY "miles_ledger tenant reads"
  ON public.miles_ledger FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_tenant_member(auth.uid(), tenant_id));

-- 3) storage.objects no bucket client-photos
-- Helper: valida acesso a um objeto seguindo os dois padrões reais já existentes
--   a) "<tenantId>/<clientId>/..." (fotos gerais e weekly)
--   b) "workout/<clientId>/..."   (foto de treino)
CREATE OR REPLACE FUNCTION public.can_access_client_photo(_user uuid, _name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p1 text := split_part(_name, '/', 1);
  v_p2 text := split_part(_name, '/', 2);
  v_tenant uuid;
  v_client uuid;
BEGIN
  IF _user IS NULL OR v_p1 = '' OR v_p2 = '' THEN RETURN false; END IF;
  IF public.is_super_admin(_user) THEN RETURN true; END IF;
  BEGIN
    IF v_p1 = 'workout' THEN
      v_client := v_p2::uuid;
      RETURN EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = v_client
          AND (c.auth_user_id = _user OR public.is_tenant_member(_user, c.tenant_id))
      );
    ELSE
      v_tenant := v_p1::uuid;
      v_client := v_p2::uuid;
      RETURN EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = v_client
          AND c.tenant_id = v_tenant
          AND (c.auth_user_id = _user OR public.is_tenant_member(_user, c.tenant_id))
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;
END;
$$;

DROP POLICY IF EXISTS "client-photos read" ON storage.objects;
DROP POLICY IF EXISTS "client-photos insert" ON storage.objects;
DROP POLICY IF EXISTS "client-photos update" ON storage.objects;
DROP POLICY IF EXISTS "client-photos delete" ON storage.objects;

CREATE POLICY "client-photos read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'client-photos' AND public.can_access_client_photo(auth.uid(), name));

CREATE POLICY "client-photos insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'client-photos' AND public.can_access_client_photo(auth.uid(), name));

CREATE POLICY "client-photos update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'client-photos' AND public.can_access_client_photo(auth.uid(), name))
  WITH CHECK (bucket_id = 'client-photos' AND public.can_access_client_photo(auth.uid(), name));

CREATE POLICY "client-photos delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'client-photos' AND public.can_access_client_photo(auth.uid(), name));
