
-- 1) Tabela
CREATE TABLE IF NOT EXISTS public.video_post_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  journey_id uuid NULL REFERENCES public.client_journeys(id) ON DELETE SET NULL,
  title text NOT NULL,
  instruction text NOT NULL DEFAULT '',
  ordering int NOT NULL DEFAULT 1,
  miles int NOT NULL DEFAULT 10 CHECK (miles >= 0 AND miles <= 50),
  response_required boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  archived_at timestamptz NULL,
  archived_by uuid NULL,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS video_post_tasks_unique_ordering
  ON public.video_post_tasks (video_id, COALESCE(journey_id, '00000000-0000-0000-0000-000000000000'::uuid), ordering)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS video_post_tasks_video_idx ON public.video_post_tasks(video_id);
CREATE INDEX IF NOT EXISTS video_post_tasks_tenant_idx ON public.video_post_tasks(tenant_id);

-- 2) GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_post_tasks TO authenticated;
GRANT ALL ON public.video_post_tasks TO service_role;

-- 3) RLS
ALTER TABLE public.video_post_tasks ENABLE ROW LEVEL SECURITY;

-- Leitura: membros do tenant OU cliente final cujo vídeo é acessível
CREATE POLICY "video_post_tasks_select"
  ON public.video_post_tasks FOR SELECT
  TO authenticated
  USING (
    public.is_tenant_member(auth.uid(), tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.auth_user_id = auth.uid()
        AND c.tenant_id = video_post_tasks.tenant_id
        AND (
          video_post_tasks.journey_id IS NULL
          OR video_post_tasks.journey_id = c.active_journey_id
        )
    )
  );

-- Escrita: somente gestores do tenant
CREATE POLICY "video_post_tasks_manage"
  ON public.video_post_tasks FOR ALL
  TO authenticated
  USING (public.is_profile_manager(auth.uid(), tenant_id))
  WITH CHECK (public.is_profile_manager(auth.uid(), tenant_id));

-- 4) Trigger de integridade Video × Tarefa × Jornada × Tenant
CREATE OR REPLACE FUNCTION public.validate_video_post_task()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_video_tenant uuid;
  v_video_journey uuid;
  v_journey_tenant uuid;
BEGIN
  SELECT tenant_id, journey_id INTO v_video_tenant, v_video_journey
    FROM public.videos WHERE id = NEW.video_id;
  IF v_video_tenant IS NULL THEN
    RAISE EXCEPTION 'video_post_tasks: vídeo % não encontrado', NEW.video_id;
  END IF;
  IF NEW.tenant_id <> v_video_tenant THEN
    RAISE EXCEPTION 'video_post_tasks: tenant da tarefa difere do tenant do vídeo';
  END IF;
  IF v_video_journey IS NOT NULL THEN
    -- vídeo exclusivo de uma jornada → tarefa precisa coincidir
    IF NEW.journey_id IS NULL OR NEW.journey_id <> v_video_journey THEN
      RAISE EXCEPTION 'video_post_tasks: tarefa não pode ampliar visibilidade do vídeo exclusivo';
    END IF;
  END IF;
  IF NEW.journey_id IS NOT NULL THEN
    SELECT tenant_id INTO v_journey_tenant FROM public.client_journeys WHERE id = NEW.journey_id;
    IF v_journey_tenant IS NULL OR v_journey_tenant <> NEW.tenant_id THEN
      RAISE EXCEPTION 'video_post_tasks: jornada não pertence ao tenant';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_video_post_task ON public.video_post_tasks;
CREATE TRIGGER trg_validate_video_post_task
  BEFORE INSERT OR UPDATE ON public.video_post_tasks
  FOR EACH ROW EXECUTE FUNCTION public.validate_video_post_task();

DROP TRIGGER IF EXISTS trg_video_post_tasks_updated_at ON public.video_post_tasks;
CREATE TRIGGER trg_video_post_tasks_updated_at
  BEFORE UPDATE ON public.video_post_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
