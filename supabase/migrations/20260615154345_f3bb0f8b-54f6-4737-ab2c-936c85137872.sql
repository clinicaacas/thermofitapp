CREATE TYPE public.plan_id AS ENUM ('essencial', 'profissional', 'premium', 'enterprise', 'interno');
CREATE TYPE public.tenant_status AS ENUM ('ativa', 'suspensa', 'cancelada');
CREATE TYPE public.profile_role AS ENUM ('super_admin', 'dono', 'admin', 'equipe');
CREATE TYPE public.user_status AS ENUM ('ativo', 'inativo', 'bloqueado', 'convite_pendente');

CREATE TABLE public.tenants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  clinic_name text NOT NULL,
  system_name text NOT NULL,
  system_subtitle text NOT NULL,
  public_app_url text NOT NULL DEFAULT 'https://thermofitapp.lovable.app',
  owner_name text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  contact_phone text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  status public.tenant_status NOT NULL DEFAULT 'ativa',
  plan_id public.plan_id NOT NULL DEFAULT 'interno',
  account_type text NOT NULL DEFAULT 'internal_master',
  user_limit integer NOT NULL DEFAULT -1,
  client_limit integer NOT NULL DEFAULT -1,
  primary_color text NOT NULL DEFAULT '#5b6cff',
  secondary_color text NOT NULL DEFAULT '#f1f2f6',
  accent_color text NOT NULL DEFAULT '#7c83ff',
  default_theme text NOT NULL DEFAULT 'light',
  white_label_enabled boolean NOT NULL DEFAULT false,
  brand_name text NOT NULL DEFAULT 'ThermoFit',
  brand_short_name text NOT NULL DEFAULT 'Clínica Acas',
  footer_text text NOT NULL DEFAULT '© Clínica Acas',
  subdomain text NOT NULL DEFAULT 'clinicaacas.thermofit.app',
  custom_domain text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.profiles (
  id uuid NOT NULL PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'Equipe',
  profile public.profile_role NOT NULL DEFAULT 'equipe',
  status public.user_status NOT NULL DEFAULT 'ativo',
  must_change_password boolean NOT NULL DEFAULT true,
  last_access timestamptz,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_tenants_updated_at
BEFORE UPDATE ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _user_id
      AND profile = 'super_admin'
      AND status = 'ativo'
  );
$$;

CREATE POLICY "Users can read own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can manage profiles"
ON public.profiles
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Users can read own tenant"
ON public.tenants
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.tenant_id = tenants.id
  )
);

CREATE POLICY "Super admins can manage tenants"
ON public.tenants
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

INSERT INTO public.tenants (
  slug, clinic_name, system_name, system_subtitle, public_app_url,
  owner_name, contact_email, city, state, status, plan_id, account_type,
  user_limit, client_limit
) VALUES (
  'acas', 'Clínica Acas', 'ThermoFit Acas', 'Plano de Voo da Transformação', 'https://thermofitapp.lovable.app',
  'Dra. Cynara Acas', 'studioacass@gmail.com', 'São Luís', 'Maranhão', 'ativa', 'interno', 'internal_master',
  -1, -1
)
ON CONFLICT (slug) DO UPDATE SET
  clinic_name = EXCLUDED.clinic_name,
  system_name = EXCLUDED.system_name,
  system_subtitle = EXCLUDED.system_subtitle,
  public_app_url = EXCLUDED.public_app_url,
  owner_name = EXCLUDED.owner_name,
  contact_email = EXCLUDED.contact_email,
  city = EXCLUDED.city,
  state = EXCLUDED.state,
  status = EXCLUDED.status,
  plan_id = EXCLUDED.plan_id,
  account_type = EXCLUDED.account_type,
  user_limit = EXCLUDED.user_limit,
  client_limit = EXCLUDED.client_limit,
  updated_at = now();