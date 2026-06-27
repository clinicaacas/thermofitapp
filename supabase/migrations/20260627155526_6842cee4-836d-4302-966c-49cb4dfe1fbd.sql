
-- 1) Corrigir occurred_on dos créditos reconciliados (semântica de "milhas do dia")
-- Hidratação: data está embutida na idempotency_key 'hydration_goal:YYYY-MM-DD'
UPDATE public.miles_ledger
SET occurred_on = substring(idempotency_key from 'hydration_goal:(\d{4}-\d{2}-\d{2})')::date
WHERE source_kind = 'hydration_goal'
  AND idempotency_key ~ '^hydration_goal:\d{4}-\d{2}-\d{2}$'
  AND reason ILIKE 'Reconciliação técnica%';

-- Vídeo: derivar do client_video_progress.updated_at do mesmo video_id
UPDATE public.miles_ledger l
SET occurred_on = (p.updated_at AT TIME ZONE 'America/Sao_Paulo')::date
FROM public.client_video_progress p
WHERE l.source_kind = 'video_complete'
  AND l.reason ILIKE 'Reconciliação técnica%'
  AND p.client_id = l.client_id
  AND p.video_id::text = substring(l.idempotency_key from 'video_complete:(.+)$');

-- 2) Remover aliases legados inativos do mission_settings (apenas se inativos)
DELETE FROM public.mission_settings
WHERE active = false
  AND mission_kind IN (
    'meal_confirm','video_watch_90','video_task','weekly_evolution_photo',
    'workout_full','workout_cardio','workout_rest','workout_photo_bonus'
  );
