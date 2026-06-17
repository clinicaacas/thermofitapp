
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS thumbnail_storage_key text,
  ADD COLUMN IF NOT EXISTS thumbnail_source text;

CREATE POLICY "tenant members read video-thumbnails"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'video-thumbnails'
  AND public.is_tenant_member(auth.uid(), (split_part(name, '/', 1))::uuid)
);

CREATE POLICY "tenant managers write video-thumbnails"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'video-thumbnails'
  AND public.is_profile_manager(auth.uid(), (split_part(name, '/', 1))::uuid)
);

CREATE POLICY "tenant managers update video-thumbnails"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'video-thumbnails'
  AND public.is_profile_manager(auth.uid(), (split_part(name, '/', 1))::uuid)
);

CREATE POLICY "tenant managers delete video-thumbnails"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'video-thumbnails'
  AND public.is_profile_manager(auth.uid(), (split_part(name, '/', 1))::uuid)
);
