
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS thumbnail_frame_time NUMERIC,
  ADD COLUMN IF NOT EXISTS thumbnail_crop_data JSONB,
  ADD COLUMN IF NOT EXISTS thumbnail_updated_at TIMESTAMPTZ;
