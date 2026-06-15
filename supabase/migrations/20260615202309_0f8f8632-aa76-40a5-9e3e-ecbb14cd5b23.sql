
-- =========================================================================
-- FASE 1 — Painel Administrativo ThermoFit Acas
-- =========================================================================

-- Helper: pode ler dados do tenant (qualquer usuário ativo do tenant)
CREATE OR REPLACE FUNCTION public.is_tenant_member(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id
      AND tenant_id = _tenant_id
      AND status = 'ativo'
  );
$$;

-- =========================================================================
-- clients
-- =========================================================================
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  birth_date date,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  plan text NOT NULL DEFAULT 'ThermoFit Essencial',
  goal text NOT NULL DEFAULT '',
  complaint text NOT NULL DEFAULT '',
  clinical_notes text NOT NULL DEFAULT '',
  hydration_goal_ml integer NOT NULL DEFAULT 2000,
  status text NOT NULL DEFAULT 'ativa',
  avatar_initial text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read tenant clients" ON public.clients
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Managers insert tenant clients" ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));

CREATE POLICY "Managers update tenant clients" ON public.clients
  FOR UPDATE TO authenticated
  USING (public.is_profile_manager(auth.uid(), tenant_id))
  WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));

CREATE POLICY "Managers delete tenant clients" ON public.clients
  FOR DELETE TO authenticated
  USING (public.is_profile_manager(auth.uid(), tenant_id));

CREATE INDEX clients_tenant_idx ON public.clients(tenant_id);
CREATE TRIGGER clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- consents
-- =========================================================================
CREATE TABLE public.consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  terms boolean NOT NULL DEFAULT false,
  privacy boolean NOT NULL DEFAULT false,
  data_processing boolean NOT NULL DEFAULT false,
  photos_internal boolean NOT NULL DEFAULT false,
  photos_marketing boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.consents TO authenticated;
GRANT ALL ON public.consents TO service_role;

ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read tenant consents" ON public.consents
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Managers write tenant consents" ON public.consents
  FOR ALL TO authenticated
  USING (public.is_profile_manager(auth.uid(), tenant_id))
  WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));

CREATE INDEX consents_tenant_idx ON public.consents(tenant_id);
CREATE TRIGGER consents_updated_at BEFORE UPDATE ON public.consents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- risk_alerts
-- =========================================================================
CREATE TABLE public.risk_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'geral',
  description text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'media',
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_alerts TO authenticated;
GRANT ALL ON public.risk_alerts TO service_role;

ALTER TABLE public.risk_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read tenant alerts" ON public.risk_alerts
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Managers write tenant alerts" ON public.risk_alerts
  FOR ALL TO authenticated
  USING (public.is_profile_manager(auth.uid(), tenant_id))
  WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));

CREATE INDEX risk_alerts_tenant_idx ON public.risk_alerts(tenant_id);
CREATE INDEX risk_alerts_client_idx ON public.risk_alerts(client_id);
CREATE TRIGGER risk_alerts_updated_at BEFORE UPDATE ON public.risk_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- messages
-- =========================================================================
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  template text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  channel text NOT NULL DEFAULT 'manual',
  recipients_count integer NOT NULL DEFAULT 0,
  sent_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read tenant messages" ON public.messages
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Managers write tenant messages" ON public.messages
  FOR ALL TO authenticated
  USING (public.is_profile_manager(auth.uid(), tenant_id))
  WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));

CREATE INDEX messages_tenant_idx ON public.messages(tenant_id);
CREATE TRIGGER messages_updated_at BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- approvals
-- =========================================================================
CREATE TABLE public.approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'geral',
  responsible_id uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pendente',
  reason text NOT NULL DEFAULT '',
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.approvals TO authenticated;
GRANT ALL ON public.approvals TO service_role;

ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read tenant approvals" ON public.approvals
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Managers write tenant approvals" ON public.approvals
  FOR ALL TO authenticated
  USING (public.is_profile_manager(auth.uid(), tenant_id))
  WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));

CREATE INDEX approvals_tenant_idx ON public.approvals(tenant_id);
CREATE TRIGGER approvals_updated_at BEFORE UPDATE ON public.approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- audit_logs
-- =========================================================================
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read tenant audit" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.is_profile_manager(auth.uid(), tenant_id));

CREATE POLICY "Members insert tenant audit" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE INDEX audit_logs_tenant_idx ON public.audit_logs(tenant_id);
CREATE INDEX audit_logs_entity_idx ON public.audit_logs(entity, entity_id);
