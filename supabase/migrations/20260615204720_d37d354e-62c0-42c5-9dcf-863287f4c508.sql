-- VIDEOS
CREATE TABLE public.videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  url text NOT NULL DEFAULT '',
  thumbnail_url text NOT NULL DEFAULT '',
  duration_seconds integer NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'geral',
  status text NOT NULL DEFAULT 'ativo',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.videos TO authenticated;
GRANT ALL ON public.videos TO service_role;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read tenant videos" ON public.videos
  FOR SELECT USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "Managers insert tenant videos" ON public.videos
  FOR INSERT WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));
CREATE POLICY "Managers update tenant videos" ON public.videos
  FOR UPDATE USING (public.is_profile_manager(auth.uid(), tenant_id))
  WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));
CREATE POLICY "Managers delete tenant videos" ON public.videos
  FOR DELETE USING (public.is_profile_manager(auth.uid(), tenant_id));
CREATE TRIGGER update_videos_updated_at BEFORE UPDATE ON public.videos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- EXERCISES
CREATE TABLE public.exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  video_url text NOT NULL DEFAULT '',
  muscle_group text NOT NULL DEFAULT 'geral',
  equipment text NOT NULL DEFAULT '',
  sets integer NOT NULL DEFAULT 3,
  reps text NOT NULL DEFAULT '10',
  status text NOT NULL DEFAULT 'ativo',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exercises TO authenticated;
GRANT ALL ON public.exercises TO service_role;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read tenant exercises" ON public.exercises
  FOR SELECT USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "Managers insert tenant exercises" ON public.exercises
  FOR INSERT WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));
CREATE POLICY "Managers update tenant exercises" ON public.exercises
  FOR UPDATE USING (public.is_profile_manager(auth.uid(), tenant_id))
  WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));
CREATE POLICY "Managers delete tenant exercises" ON public.exercises
  FOR DELETE USING (public.is_profile_manager(auth.uid(), tenant_id));
CREATE TRIGGER update_exercises_updated_at BEFORE UPDATE ON public.exercises
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- REWARDS
CREATE TABLE public.rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  cost_miles integer NOT NULL DEFAULT 0,
  stock integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ativo',
  image_url text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rewards TO authenticated;
GRANT ALL ON public.rewards TO service_role;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read tenant rewards" ON public.rewards
  FOR SELECT USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "Managers insert tenant rewards" ON public.rewards
  FOR INSERT WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));
CREATE POLICY "Managers update tenant rewards" ON public.rewards
  FOR UPDATE USING (public.is_profile_manager(auth.uid(), tenant_id))
  WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));
CREATE POLICY "Managers delete tenant rewards" ON public.rewards
  FOR DELETE USING (public.is_profile_manager(auth.uid(), tenant_id));
CREATE TRIGGER update_rewards_updated_at BEFORE UPDATE ON public.rewards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- REWARD REDEMPTIONS
CREATE TABLE public.reward_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reward_id uuid NOT NULL REFERENCES public.rewards(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  cost_miles integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente',
  notes text NOT NULL DEFAULT '',
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reward_redemptions TO authenticated;
GRANT ALL ON public.reward_redemptions TO service_role;
ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read tenant redemptions" ON public.reward_redemptions
  FOR SELECT USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "Members insert tenant redemptions" ON public.reward_redemptions
  FOR INSERT WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "Managers update tenant redemptions" ON public.reward_redemptions
  FOR UPDATE USING (public.is_profile_manager(auth.uid(), tenant_id))
  WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));
CREATE POLICY "Managers delete tenant redemptions" ON public.reward_redemptions
  FOR DELETE USING (public.is_profile_manager(auth.uid(), tenant_id));
CREATE TRIGGER update_reward_redemptions_updated_at BEFORE UPDATE ON public.reward_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();