CREATE POLICY "Tenant members can read videos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'videos' AND public.is_tenant_member(auth.uid(), (storage.foldername(name))[1]::uuid));

CREATE POLICY "Tenant members can upload videos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'videos' AND public.is_tenant_member(auth.uid(), (storage.foldername(name))[1]::uuid));

CREATE POLICY "Tenant members can update videos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'videos' AND public.is_tenant_member(auth.uid(), (storage.foldername(name))[1]::uuid));

CREATE POLICY "Tenant members can delete videos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'videos' AND public.is_tenant_member(auth.uid(), (storage.foldername(name))[1]::uuid));