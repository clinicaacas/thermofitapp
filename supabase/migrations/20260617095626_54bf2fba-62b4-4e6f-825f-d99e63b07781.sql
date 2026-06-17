
-- vacuum-assets bucket policies
CREATE POLICY "vacuum-assets read team and clients"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'vacuum-assets'
    AND (
      public.is_tenant_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
      OR public.tenant_id_for_client_user(auth.uid()) = ((storage.foldername(name))[1])::uuid
    )
  );

CREATE POLICY "vacuum-assets manager insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vacuum-assets'
    AND public.is_profile_manager(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "vacuum-assets manager update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'vacuum-assets'
    AND public.is_profile_manager(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "vacuum-assets manager delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'vacuum-assets'
    AND public.is_profile_manager(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
