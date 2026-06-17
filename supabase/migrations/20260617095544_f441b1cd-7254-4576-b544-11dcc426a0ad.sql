
-- =========================================================
-- VACUUM SETTINGS (1 row per tenant)
-- =========================================================
CREATE TABLE public.vacuum_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  eyebrow text NOT NULL DEFAULT 'MÉTODO THERMOFIT',
  title_first text NOT NULL DEFAULT 'Cintura',
  title_second text NOT NULL DEFAULT 'Ativa',
  subtitle text NOT NULL DEFAULT 'Core de dentro pra fora — protocolo completo',
  practice_tab_label text NOT NULL DEFAULT 'Praticar',
  guide_tab_label text NOT NULL DEFAULT 'Guia Completo',
  card_eyebrow text NOT NULL DEFAULT 'PROTOCOLO COMPLETO',
  card_title text NOT NULL DEFAULT 'Treino Cintura Ativa',
  card_subtitle text NOT NULL DEFAULT '5 exercícios · 3 séries cada',
  estimated_time text NOT NULL DEFAULT '~10 min',
  button_text text NOT NULL DEFAULT 'Começar Treino',
  skip_guide_text text NOT NULL DEFAULT 'Pular guia e ir direto para a prática',
  finish_guide_text text NOT NULL DEFAULT 'Começar a Praticar',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vacuum_settings TO authenticated;
GRANT ALL ON public.vacuum_settings TO service_role;
ALTER TABLE public.vacuum_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vacuum_settings team read"
  ON public.vacuum_settings FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)
         OR public.tenant_id_for_client_user(auth.uid()) = tenant_id);

CREATE POLICY "vacuum_settings manager write"
  ON public.vacuum_settings FOR ALL TO authenticated
  USING (public.is_profile_manager(auth.uid(), tenant_id))
  WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));

CREATE TRIGGER vacuum_settings_updated_at
  BEFORE UPDATE ON public.vacuum_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- VACUUM EXERCISES
-- =========================================================
CREATE TABLE public.vacuum_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_index int NOT NULL DEFAULT 0,
  name text NOT NULL,
  short_description text,
  prescription_text text,
  thumbnail_url text,
  status text NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vacuum_exercises_tenant_order_idx
  ON public.vacuum_exercises (tenant_id, order_index);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vacuum_exercises TO authenticated;
GRANT ALL ON public.vacuum_exercises TO service_role;
ALTER TABLE public.vacuum_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vacuum_exercises team read"
  ON public.vacuum_exercises FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)
         OR public.tenant_id_for_client_user(auth.uid()) = tenant_id);

CREATE POLICY "vacuum_exercises manager write"
  ON public.vacuum_exercises FOR ALL TO authenticated
  USING (public.is_profile_manager(auth.uid(), tenant_id))
  WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));

CREATE TRIGGER vacuum_exercises_updated_at
  BEFORE UPDATE ON public.vacuum_exercises
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- VACUUM GUIDE PAGES
-- =========================================================
CREATE TABLE public.vacuum_guide_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_index int NOT NULL DEFAULT 0,
  title text NOT NULL,
  image_url text,
  alt_text text,
  status text NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vacuum_guide_pages_tenant_order_idx
  ON public.vacuum_guide_pages (tenant_id, order_index);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vacuum_guide_pages TO authenticated;
GRANT ALL ON public.vacuum_guide_pages TO service_role;
ALTER TABLE public.vacuum_guide_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vacuum_guide_pages team read"
  ON public.vacuum_guide_pages FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)
         OR public.tenant_id_for_client_user(auth.uid()) = tenant_id);

CREATE POLICY "vacuum_guide_pages manager write"
  ON public.vacuum_guide_pages FOR ALL TO authenticated
  USING (public.is_profile_manager(auth.uid(), tenant_id))
  WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));

CREATE TRIGGER vacuum_guide_pages_updated_at
  BEFORE UPDATE ON public.vacuum_guide_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- CLIENT VACUUM EVENTS
-- =========================================================
CREATE TABLE public.client_vacuum_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX client_vacuum_events_tenant_client_idx
  ON public.client_vacuum_events (tenant_id, client_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_vacuum_events TO authenticated;
GRANT ALL ON public.client_vacuum_events TO service_role;
ALTER TABLE public.client_vacuum_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_vacuum_events team read"
  ON public.client_vacuum_events FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)
         OR public.client_id_for_user(auth.uid()) = client_id);

CREATE POLICY "client_vacuum_events client insert"
  ON public.client_vacuum_events FOR INSERT TO authenticated
  WITH CHECK (public.client_id_for_user(auth.uid()) = client_id
              AND public.tenant_id_for_client_user(auth.uid()) = tenant_id);

CREATE POLICY "client_vacuum_events manager write"
  ON public.client_vacuum_events FOR ALL TO authenticated
  USING (public.is_profile_manager(auth.uid(), tenant_id))
  WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));
