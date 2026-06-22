
-- Fase A: extend client_progress_photos with source/uploader/visibility/updated_at
ALTER TABLE public.client_progress_photos
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS uploaded_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS visible_to_client BOOLEAN,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Backfill existing rows
UPDATE public.client_progress_photos
SET source = COALESCE(source, 'client_upload'),
    visible_to_client = COALESCE(visible_to_client, true),
    updated_at = COALESCE(updated_at, created_at, now());

-- Defaults + NOT NULL for new rows
ALTER TABLE public.client_progress_photos
  ALTER COLUMN source SET DEFAULT 'client_upload',
  ALTER COLUMN source SET NOT NULL,
  ALTER COLUMN visible_to_client SET DEFAULT true,
  ALTER COLUMN visible_to_client SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

-- Restrict source values to known sources
ALTER TABLE public.client_progress_photos
  DROP CONSTRAINT IF EXISTS client_progress_photos_source_check;
ALTER TABLE public.client_progress_photos
  ADD CONSTRAINT client_progress_photos_source_check
  CHECK (source IN ('client_upload', 'admin_upload'));

-- Soft validation for week (1..12), but tolerate legacy values
ALTER TABLE public.client_progress_photos
  DROP CONSTRAINT IF EXISTS client_progress_photos_week_range_check;
ALTER TABLE public.client_progress_photos
  ADD CONSTRAINT client_progress_photos_week_range_check
  CHECK (week IS NULL OR (week >= 1 AND week <= 12))
  NOT VALID;
-- NOT VALID = applies to new/updated rows only; legacy out-of-range rows remain untouched.

-- updated_at trigger (reuses the shared public.update_updated_at_column())
DROP TRIGGER IF EXISTS set_updated_at_client_progress_photos ON public.client_progress_photos;
CREATE TRIGGER set_updated_at_client_progress_photos
BEFORE UPDATE ON public.client_progress_photos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helpful index for the upcoming admin/client week timelines
CREATE INDEX IF NOT EXISTS client_progress_photos_client_week_idx
  ON public.client_progress_photos (client_id, week);
