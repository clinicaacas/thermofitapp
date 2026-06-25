
CREATE TABLE public.client_task_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  client_id uuid NOT NULL,
  journey_id uuid NOT NULL,
  mission_id uuid NOT NULL,
  linked_video_id uuid,
  task_ref text,
  due_date date NOT NULL,
  response text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_task_responses_mission_unique UNIQUE (client_id, mission_id)
);

CREATE INDEX client_task_responses_client_day_idx
  ON public.client_task_responses (client_id, due_date);
CREATE INDEX client_task_responses_video_idx
  ON public.client_task_responses (client_id, linked_video_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_task_responses TO authenticated;
GRANT ALL ON public.client_task_responses TO service_role;

ALTER TABLE public.client_task_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client reads own task responses"
ON public.client_task_responses FOR SELECT TO authenticated
USING (
  client_id = public.client_id_for_user(auth.uid())
  OR public.is_tenant_member(auth.uid(), tenant_id)
);

CREATE POLICY "client writes own task responses"
ON public.client_task_responses FOR INSERT TO authenticated
WITH CHECK (client_id = public.client_id_for_user(auth.uid()));

CREATE POLICY "client updates own task responses"
ON public.client_task_responses FOR UPDATE TO authenticated
USING (client_id = public.client_id_for_user(auth.uid()))
WITH CHECK (client_id = public.client_id_for_user(auth.uid()));

CREATE TRIGGER trg_client_task_responses_updated_at
BEFORE UPDATE ON public.client_task_responses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
