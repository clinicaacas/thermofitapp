-- Revoga acesso direto à award_miles: cliente não pode mais chamar via RPC
REVOKE ALL ON FUNCTION public.award_miles(uuid, text, text, integer, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.award_miles(uuid, text, text, integer, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.award_miles(uuid, text, text, integer, text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.award_miles(uuid, text, text, integer, text, text, jsonb) TO service_role;

-- Documenta a regra de uso para evitar regressão futura
COMMENT ON FUNCTION public.award_miles(uuid, text, text, integer, text, text, jsonb) IS
'INTERNAL ONLY. Não pode ser exposta via PostgREST/RPC ao cliente. Deve ser invocada apenas por server functions autorizadas (service_role) que validam o evento real (vídeo, tarefa, check-in, hidratação, treino, alimentação, foto, selo) e calculam as Milhas a partir de public.mission_settings. O front-end nunca envia o valor de milhas, kind, ref, idempotency_key, reason ou metadata diretamente.';
