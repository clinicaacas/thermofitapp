
CREATE POLICY "nutrition-materials staff write" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'nutrition-materials' AND public.can_access_nutrition_material(auth.uid(), name));
CREATE POLICY "nutrition-materials staff update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'nutrition-materials' AND public.can_access_nutrition_material(auth.uid(), name))
  WITH CHECK (bucket_id = 'nutrition-materials' AND public.can_access_nutrition_material(auth.uid(), name));
CREATE POLICY "nutrition-materials staff delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'nutrition-materials' AND public.can_access_nutrition_material(auth.uid(), name));
CREATE POLICY "nutrition-materials read" ON storage.objects FOR SELECT
  USING (bucket_id = 'nutrition-materials' AND public.can_access_nutrition_material(auth.uid(), name));
