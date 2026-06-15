GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approvals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO authenticated;

GRANT ALL ON public.clients TO service_role;
GRANT ALL ON public.consents TO service_role;
GRANT ALL ON public.risk_alerts TO service_role;
GRANT ALL ON public.messages TO service_role;
GRANT ALL ON public.approvals TO service_role;
GRANT ALL ON public.audit_logs TO service_role;