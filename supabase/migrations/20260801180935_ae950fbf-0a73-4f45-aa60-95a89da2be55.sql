CREATE OR REPLACE FUNCTION public.migration_schema_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'information_schema'
AS $$
DECLARE
  v_tables jsonb;
  v_functions jsonb;
  v_buckets jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: apenas super administradores';
  END IF;

  SELECT COALESCE(jsonb_agg(t ORDER BY t->>'table_name'), '[]'::jsonb) INTO v_tables
  FROM (
    SELECT jsonb_build_object(
      'table_name', c.relname,
      'estimated_rows', GREATEST(c.reltuples::bigint, 0),
      'column_count', (SELECT count(*) FROM information_schema.columns col
                        WHERE col.table_schema = 'public' AND col.table_name = c.relname),
      'rls_enabled', c.relrowsecurity,
      'policy_count', (SELECT count(*) FROM pg_policies p
                        WHERE p.schemaname = 'public' AND p.tablename = c.relname),
      'has_tenant_id', EXISTS (SELECT 1 FROM information_schema.columns col
                                WHERE col.table_schema='public' AND col.table_name=c.relname AND col.column_name='tenant_id'),
      'has_user_id', EXISTS (SELECT 1 FROM information_schema.columns col
                              WHERE col.table_schema='public' AND col.table_name=c.relname
                                AND col.column_name IN ('user_id','auth_user_id'))
    ) AS t
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  ) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'name', p.proname,
           'security_definer', p.prosecdef
         ) ORDER BY p.proname), '[]'::jsonb) INTO v_functions
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public';

  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', b.name, 'public', b.public) ORDER BY b.name), '[]'::jsonb)
    INTO v_buckets FROM storage.buckets b;

  RETURN jsonb_build_object(
    'tables', v_tables,
    'db_functions', v_functions,
    'storage_buckets', v_buckets,
    'generated_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.migration_schema_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.migration_schema_overview() TO authenticated;