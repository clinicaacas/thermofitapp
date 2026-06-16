
CREATE TABLE public.client_progress_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  week INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_progress_photos_client_taken
  ON public.client_progress_photos (client_id, taken_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_progress_photos TO authenticated;
GRANT ALL ON public.client_progress_photos TO service_role;

ALTER TABLE public.client_progress_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members manage client photos"
  ON public.client_progress_photos
  FOR ALL
  TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
