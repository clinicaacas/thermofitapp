ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS video_type text NOT NULL DEFAULT 'manha',
  ADD COLUMN IF NOT EXISTS release_day integer,
  ADD COLUMN IF NOT EXISTS phase text,
  ADD COLUMN IF NOT EXISTS miles_on_complete integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS min_completion_pct integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS storage_key text;