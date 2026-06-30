
-- 1) nutrition_plans
CREATE TABLE public.nutrition_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  journey_id uuid REFERENCES public.client_journeys(id) ON DELETE SET NULL,
  title text NOT NULL,
  general_guidance text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','publicado','arquivado')),
  main_pdf_path text,
  main_pdf_uploaded_at timestamptz,
  created_by uuid,
  updated_by uuid,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nutrition_plans_client_idx ON public.nutrition_plans(client_id, status);
CREATE INDEX nutrition_plans_tenant_idx ON public.nutrition_plans(tenant_id);
CREATE UNIQUE INDEX nutrition_plans_one_published ON public.nutrition_plans(client_id, COALESCE(journey_id,'00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'publicado';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_plans TO authenticated;
GRANT ALL ON public.nutrition_plans TO service_role;
ALTER TABLE public.nutrition_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nutrition_plans staff" ON public.nutrition_plans FOR ALL
  USING (public.is_super_admin(auth.uid()) OR public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "nutrition_plans client read published" ON public.nutrition_plans FOR SELECT
  USING (status = 'publicado' AND client_id = public.client_id_for_user(auth.uid()));

-- 2) nutrition_library_materials
CREATE TABLE public.nutrition_library_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'outros',
  description text NOT NULL DEFAULT '',
  storage_path text,
  mime_type text,
  size_bytes integer,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','arquivado')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nutrition_library_tenant_idx ON public.nutrition_library_materials(tenant_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_library_materials TO authenticated;
GRANT ALL ON public.nutrition_library_materials TO service_role;
ALTER TABLE public.nutrition_library_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nutrition_library staff" ON public.nutrition_library_materials FOR ALL
  USING (public.is_super_admin(auth.uid()) OR public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_tenant_member(auth.uid(), tenant_id));

-- 3) nutrition_plan_materials
CREATE TABLE public.nutrition_plan_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  plan_id uuid NOT NULL REFERENCES public.nutrition_plans(id) ON DELETE CASCADE,
  library_material_id uuid REFERENCES public.nutrition_library_materials(id) ON DELETE RESTRICT,
  storage_path text,
  mime_type text,
  size_bytes integer,
  display_title text,
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  origin text NOT NULL CHECK (origin IN ('exclusivo','biblioteca')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nutrition_plan_materials_one_source CHECK (
    (origin = 'exclusivo' AND storage_path IS NOT NULL AND library_material_id IS NULL)
    OR (origin = 'biblioteca' AND library_material_id IS NOT NULL AND storage_path IS NULL)
  )
);
CREATE INDEX nutrition_plan_materials_plan_idx ON public.nutrition_plan_materials(plan_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_plan_materials TO authenticated;
GRANT ALL ON public.nutrition_plan_materials TO service_role;
ALTER TABLE public.nutrition_plan_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nutrition_plan_materials staff" ON public.nutrition_plan_materials FOR ALL
  USING (public.is_super_admin(auth.uid()) OR public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "nutrition_plan_materials client read" ON public.nutrition_plan_materials FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.nutrition_plans p
     WHERE p.id = plan_id
       AND p.status = 'publicado'
       AND p.client_id = public.client_id_for_user(auth.uid())
  ));

-- Library client-read policy (after plan_materials exists)
CREATE POLICY "nutrition_library client read referenced" ON public.nutrition_library_materials FOR SELECT
  USING (EXISTS (
    SELECT 1
      FROM public.nutrition_plan_materials pm
      JOIN public.nutrition_plans p ON p.id = pm.plan_id
     WHERE pm.library_material_id = nutrition_library_materials.id
       AND p.status = 'publicado'
       AND p.client_id = public.client_id_for_user(auth.uid())
  ));

-- Triggers updated_at
CREATE TRIGGER trg_nutrition_plans_updated
  BEFORE UPDATE ON public.nutrition_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_nutrition_library_updated
  BEFORE UPDATE ON public.nutrition_library_materials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_nutrition_plan_materials_updated
  BEFORE UPDATE ON public.nutrition_plan_materials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Archive previous published plan on publish
CREATE OR REPLACE FUNCTION public.nutrition_plans_archive_previous()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'publicado' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'publicado') THEN
    UPDATE public.nutrition_plans
       SET status = 'arquivado',
           archived_at = now(),
           updated_at = now()
     WHERE client_id = NEW.client_id
       AND COALESCE(journey_id,'00000000-0000-0000-0000-000000000000'::uuid)
           = COALESCE(NEW.journey_id,'00000000-0000-0000-0000-000000000000'::uuid)
       AND id <> NEW.id
       AND status = 'publicado';
    IF NEW.published_at IS NULL THEN NEW.published_at := now(); END IF;
  END IF;
  IF NEW.status = 'arquivado' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'arquivado') THEN
    IF NEW.archived_at IS NULL THEN NEW.archived_at := now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_nutrition_plans_archive_previous
  BEFORE INSERT OR UPDATE ON public.nutrition_plans
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_plans_archive_previous();

-- Tenant coherence for plan materials
CREATE OR REPLACE FUNCTION public.validate_nutrition_plan_material()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_plan_tenant uuid; v_lib_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_plan_tenant FROM public.nutrition_plans WHERE id = NEW.plan_id;
  IF v_plan_tenant IS NULL THEN RAISE EXCEPTION 'nutrition_plan_materials: plano não existe'; END IF;
  IF NEW.tenant_id <> v_plan_tenant THEN
    RAISE EXCEPTION 'nutrition_plan_materials: tenant difere do tenant do plano';
  END IF;
  IF NEW.library_material_id IS NOT NULL THEN
    SELECT tenant_id INTO v_lib_tenant FROM public.nutrition_library_materials WHERE id = NEW.library_material_id;
    IF v_lib_tenant IS NULL OR v_lib_tenant <> NEW.tenant_id THEN
      RAISE EXCEPTION 'nutrition_plan_materials: material da biblioteca de outro tenant';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_nutrition_plan_materials_validate
  BEFORE INSERT OR UPDATE ON public.nutrition_plan_materials
  FOR EACH ROW EXECUTE FUNCTION public.validate_nutrition_plan_material();

-- Storage gate
CREATE OR REPLACE FUNCTION public.can_access_nutrition_material(_user uuid, _name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p1 text := split_part(_name, '/', 1);
  v_p2 text := split_part(_name, '/', 2);
  v_p3 text := split_part(_name, '/', 3);
  v_tenant uuid;
  v_kind text;
  v_id uuid;
  v_client uuid;
  v_status text;
BEGIN
  IF _user IS NULL OR v_p1 = '' OR v_p2 = '' OR v_p3 = '' THEN RETURN false; END IF;
  IF public.is_super_admin(_user) THEN RETURN true; END IF;
  BEGIN
    v_tenant := v_p1::uuid;
    v_kind := v_p2;
    v_id := v_p3::uuid;
  EXCEPTION WHEN OTHERS THEN RETURN false; END;
  IF public.is_tenant_member(_user, v_tenant) THEN RETURN true; END IF;
  IF v_kind = 'plans' THEN
    SELECT client_id, status INTO v_client, v_status
      FROM public.nutrition_plans WHERE id = v_id AND tenant_id = v_tenant;
    IF v_status = 'publicado' AND v_client = public.client_id_for_user(_user) THEN
      RETURN true;
    END IF;
  END IF;
  RETURN false;
END;
$$;
