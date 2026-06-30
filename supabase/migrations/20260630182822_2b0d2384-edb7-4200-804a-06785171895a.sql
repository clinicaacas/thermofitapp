
-- Helper: can current user access a workout-materials object?
CREATE OR REPLACE FUNCTION public.can_access_workout_material(_user uuid, _name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p1 text := split_part(_name, '/', 1);   -- tenantId
  v_p2 text := split_part(_name, '/', 2);   -- 'plans' | 'library'
  v_p3 text := split_part(_name, '/', 3);   -- planId | exerciseId
  v_tenant uuid;
  v_kind text;
  v_id uuid;
  v_client uuid;
  v_status text;
BEGIN
  IF _user IS NULL OR v_p1 = '' OR v_p2 = '' OR v_p3 = '' THEN RETURN false; END IF;
  IF public.is_super_admin(_user) THEN RETURN true; END IF;
  BEGIN
    v_tenant := v_p1::uuid;
    v_kind := v_p2;
    v_id := v_p3::uuid;
  EXCEPTION WHEN OTHERS THEN RETURN false; END;

  -- Tenant staff: full access to own-tenant files
  IF public.is_tenant_member(_user, v_tenant) THEN RETURN true; END IF;

  -- Client final: only PDFs of own published plan
  IF v_kind = 'plans' THEN
    SELECT client_id, status INTO v_client, v_status
      FROM public.workout_plans WHERE id = v_id AND tenant_id = v_tenant;
    IF v_status = 'publicado' AND v_client = public.client_id_for_user(_user) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- Policies on storage.objects for bucket workout-materials
DROP POLICY IF EXISTS "workout-materials read" ON storage.objects;
CREATE POLICY "workout-materials read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'workout-materials' AND public.can_access_workout_material(auth.uid(), name));

DROP POLICY IF EXISTS "workout-materials insert" ON storage.objects;
CREATE POLICY "workout-materials insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'workout-materials'
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_tenant_member(auth.uid(), NULLIF(split_part(name,'/',1),'')::uuid)
    )
  );

DROP POLICY IF EXISTS "workout-materials update" ON storage.objects;
CREATE POLICY "workout-materials update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'workout-materials'
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_tenant_member(auth.uid(), NULLIF(split_part(name,'/',1),'')::uuid)
    )
  );

DROP POLICY IF EXISTS "workout-materials delete" ON storage.objects;
CREATE POLICY "workout-materials delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'workout-materials'
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_tenant_member(auth.uid(), NULLIF(split_part(name,'/',1),'')::uuid)
    )
  );
