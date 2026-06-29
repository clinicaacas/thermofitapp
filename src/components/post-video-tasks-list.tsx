import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, MessageSquare } from "lucide-react";
import { useState } from "react";
import {
  listClientPostVideoTasks,
  completePostVideoTask,
} from "@/lib/thermofit-post-video-tasks.functions";
import { invalidateClientMissionData } from "@/hooks/use-missions-realtime";

type Props = { clientId: string };

export function PostVideoTasksList({ clientId }: Props) {
  const fetcher = useServerFn(listClientPostVideoTasks);
  const completeFn = useServerFn(completePostVideoTask);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["client-post-video-tasks", clientId],
    queryFn: () => fetcher({ data: { clientId } }),
    enabled: !!clientId,
    staleTime: 0,
  });

  const tasks: any[] = (data as any)?.tasks ?? [];
  if (tasks.length === 0) return null;

  return (
    <section className="mt-4">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: "#8A6A3D" }}>
        Tarefas pós-vídeo
      </h3>
      <ul className="space-y-2">
        {tasks.map((t) => (
          <TaskCard
            key={t.missionId}
            task={t}
            onSubmit={async (response) => {
              await completeFn({ data: { clientId, missionId: t.missionId, response } });
              invalidateClientMissionData(qc, clientId);
              qc.invalidateQueries({ queryKey: ["client-post-video-tasks", clientId] });
            }}
          />
        ))}
      </ul>
    </section>
  );
}

function TaskCard({ task, onSubmit }: { task: any; onSubmit: (r: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const blocked = !task.unlocked && !task.completed;

  return (
    <li
      className="rounded-2xl bg-white p-3"
      style={{
        border: `1px solid ${task.completed ? "#BFD8B7" : "#E5D6BD"}`,
        background: task.completed ? "#F1F8EF" : "#FFFFFF",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <MessageSquare className="h-4 w-4 mt-0.5" style={{ color: "#8A6A3D" }} />
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide" style={{ color: "#8A6A3D" }}>
              {task.videoTitle}
            </p>
            <p className="text-sm font-semibold" style={{ color: "#1F2933" }}>
              {task.title}
            </p>
            {task.instruction && (
              <p className="mt-1 text-xs" style={{ color: "#6B7280" }}>{task.instruction}</p>
            )}
          </div>
        </div>
        {task.completed ? (
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "#E8F2E5", color: "#3F7A3A" }}>
            <Check className="h-3 w-3" /> Concluída
          </span>
        ) : task.miles > 0 ? (
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "#F3E8D2", color: "#8A6A3D" }}>
            +{task.miles}
          </span>
        ) : null}
      </div>

      {task.completed && task.response && (
        <p
          className="mt-2 rounded-lg p-2 text-xs italic"
          style={{ background: "#FBF7EE", color: "#1F2933" }}
        >
          “{task.response}”
        </p>
      )}

      {blocked && (
        <p className="mt-2 text-xs" style={{ color: "#6B7280" }}>
          Disponível após concluir o vídeo.
        </p>
      )}

      {!task.completed && task.unlocked && (
        <div className="mt-3 space-y-2">
          {task.responseRequired && (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Escreva sua resposta…"
              className="w-full resize-none rounded-xl bg-white p-2 text-sm outline-none"
              style={{ border: "1px solid #E5D6BD", color: "#1F2933" }}
            />
          )}
          <button
            type="button"
            disabled={busy || (task.responseRequired && text.trim().length < 2)}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                await onSubmit(text.trim());
                setText("");
              } catch (e: any) {
                setErr(e?.message ?? "Falha ao enviar.");
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ background: "#C9A24A", color: "#FFFFFF" }}
          >
            {busy ? "Enviando…" : task.responseRequired ? "Enviar e concluir" : "Concluir tarefa"}
          </button>
          {err && <p className="text-xs" style={{ color: "#B23A48" }}>{err}</p>}
        </div>
      )}
    </li>
  );
}
