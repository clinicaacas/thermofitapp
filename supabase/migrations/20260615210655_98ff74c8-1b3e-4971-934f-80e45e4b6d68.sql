
CREATE TABLE public.client_app_settings (
  tenant_id UUID NOT NULL PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  app_name TEXT NOT NULL DEFAULT 'ThermoFit',
  app_subtitle TEXT NOT NULL DEFAULT 'Plano de Voo da Transformação',
  welcome_text TEXT NOT NULL DEFAULT 'Bem-vinda ao seu Plano de Voo!',
  primary_color TEXT NOT NULL DEFAULT '#5b6cff',
  accent_color TEXT NOT NULL DEFAULT '#7c83ff',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_app_settings TO authenticated;
GRANT ALL ON public.client_app_settings TO service_role;
ALTER TABLE public.client_app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read client_app_settings" ON public.client_app_settings
  FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "Managers manage client_app_settings" ON public.client_app_settings
  FOR ALL TO authenticated
  USING (public.is_profile_manager(auth.uid(), tenant_id))
  WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));
CREATE TRIGGER update_client_app_settings_updated_at BEFORE UPDATE ON public.client_app_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.app_module_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, module_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_module_settings TO authenticated;
GRANT ALL ON public.app_module_settings TO service_role;
ALTER TABLE public.app_module_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read app_module_settings" ON public.app_module_settings
  FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "Managers manage app_module_settings" ON public.app_module_settings
  FOR ALL TO authenticated
  USING (public.is_profile_manager(auth.uid(), tenant_id))
  WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));
CREATE TRIGGER update_app_module_settings_updated_at BEFORE UPDATE ON public.app_module_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.app_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  creates_alert BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, kind, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_templates TO authenticated;
GRANT ALL ON public.app_templates TO service_role;
ALTER TABLE public.app_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read app_templates" ON public.app_templates
  FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "Managers manage app_templates" ON public.app_templates
  FOR ALL TO authenticated
  USING (public.is_profile_manager(auth.uid(), tenant_id))
  WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));
CREATE TRIGGER update_app_templates_updated_at BEFORE UPDATE ON public.app_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
