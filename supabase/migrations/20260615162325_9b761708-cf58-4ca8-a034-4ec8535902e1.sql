ALTER TABLE public.profiles ALTER COLUMN must_change_password SET DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_profile_manager(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _user_id
      AND tenant_id = _tenant_id
      AND profile IN ('super_admin', 'dono', 'admin')
      AND status = 'ativo'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_profile_manager(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_profile_manager(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_profile_manager(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_profile_manager(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO service_role;

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can manage profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own tenant" ON public.tenants;
DROP POLICY IF EXISTS "Super admins can manage tenants" ON public.tenants;

CREATE POLICY "Users can read own profile or managers can read tenant profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid() OR public.is_profile_manager(auth.uid(), tenant_id));

CREATE POLICY "Managers can create tenant profiles"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));

CREATE POLICY "Managers can update tenant profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.is_profile_manager(auth.uid(), tenant_id))
WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));

CREATE POLICY "Managers can remove tenant profiles"
ON public.profiles
FOR DELETE
TO authenticated
USING (public.is_profile_manager(auth.uid(), tenant_id));

CREATE POLICY "Users can read own tenant or managers can read tenant"
ON public.tenants
FOR SELECT
TO authenticated
USING (
  public.is_profile_manager(auth.uid(), id)
  OR EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.tenant_id = tenants.id
  )
);

CREATE POLICY "Super admins can manage tenants"
ON public.tenants
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));