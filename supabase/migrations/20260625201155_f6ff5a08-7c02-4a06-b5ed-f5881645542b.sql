
-- Atualiza defaults oficiais e mantém ensure_mission_settings idempotente
CREATE OR REPLACE FUNCTION public.ensure_mission_settings(_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.mission_settings (tenant_id, mission_kind, label, default_miles, active, metadata)
  VALUES
    (_tenant_id, 'daily_checkin',   'Check-in diário',          5, true, '{}'::jsonb),
    (_tenant_id, 'daily_meal',      'Alimentação do dia',       5, true, '{}'::jsonb),
    (_tenant_id, 'daily_workout',   'Treino do dia',           10, true, '{}'::jsonb),
    (_tenant_id, 'workout_photo',   'Foto do treino',           5, true, '{}'::jsonb),
    (_tenant_id, 'hydration_goal',  'Meta de hidratação',      10, true, '{}'::jsonb),
    (_tenant_id, 'video_complete',  'Vídeo do dia concluído',   5, true, '{}'::jsonb),
    (_tenant_id, 'weekly_photo',    'Foto de evolução semanal',15, true, '{}'::jsonb),
    (_tenant_id, 'post_video_task', 'Tarefa pós-vídeo',        10, true, '{}'::jsonb)
  ON CONFLICT (tenant_id, mission_kind) DO NOTHING;
END;
$function$;

-- Alinha tenants já existentes aos valores oficiais (não reduz labels customizados)
UPDATE public.mission_settings SET default_miles = 5  WHERE mission_kind = 'daily_checkin';
UPDATE public.mission_settings SET default_miles = 5  WHERE mission_kind = 'daily_meal';
UPDATE public.mission_settings SET default_miles = 10 WHERE mission_kind = 'daily_workout';
UPDATE public.mission_settings SET default_miles = 10 WHERE mission_kind = 'hydration_goal';
UPDATE public.mission_settings SET default_miles = 5  WHERE mission_kind = 'video_complete';
UPDATE public.mission_settings SET default_miles = 10 WHERE mission_kind = 'post_video_task';
UPDATE public.mission_settings SET default_miles = 5  WHERE mission_kind = 'workout_photo';
UPDATE public.mission_settings SET default_miles = 15 WHERE mission_kind = 'weekly_photo';
