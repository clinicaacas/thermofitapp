import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, MessageSquare } from "lucide-react";
import { useState } from "react";
import { getPostVideoTaskState, submitPostVideoTask } from "@/lib/thermofit-missions.functions";

type Props = { clientId: string };

export function PostVideoTaskCard({ clientId }: Props) {
  const qc = useQueryClient();
  const fetchState = useServerFn(getPostVideoTaskState);
  const submitFn = useServerFn(submitPostVideoTask);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["post-video-task-state", clientId],
    queryFn: () => fetchState({ data: { clientId } }),
    enabled: !!clientId,
    staleTime: 0,
  });

  const mut = useMutation({
    mutationFn: (response: string) => submitFn({ data: { clientId, response } }),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["post-video-task-state", clientId] });
      qc.invalidateQueries({ queryKey: ["mission-summary", clientId] });
      qc.invalidateQueries({ queryKey: ["client-home", clientId] });
    },
    onError: (e: any) => setError(e?.message ?? "Falha ao enviar."),
  });

  const unlocked = !!data?.unlocked;
  const completed = !!data?.completed;

  return (
    <section
      className="mt-3 rounded-2xl bg-white p-4"
      style={{ border: "1px solid #E5D6BD" }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" style={{ color: "#8A6A3D" }} />
          <div>
            <h3 className="text-sm font-bold" style={{ color: "#1F2933" }}>
              Tarefa pós-vídeo
            </h3>
            <p className="text-xs" style={{ color: "#6B7280" }}>
              {completed
                ? "Resposta registrada hoje."
                : unlocked
                ? "Conte o que você aprendeu hoje • +10 Milhas"
                : "Disponível após concluir 1 vídeo do dia."}
            </p>
          </div>
        </div>
        {completed ? (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: "#E8F2E5", color: "#3F7A3A" }}
          >
            <Check className="h-3 w-3" /> Concluída
          </span>
        ) : (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: "#F3E8D2", color: "#8A6A3D" }}
          >
            +10
          </span>
        )}
      </div>

      {completed && data?.response && (
        <p
          className="mt-2 rounded-lg p-2 text-xs italic"
          style={{ background: "#FBF7EE", color: "#1F2933" }}
        >
          “{data.response}”
        </p>
      )}

      {!completed && unlocked && (
        <div className="mt-3 space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Escreva sua resposta…"
            className="w-full resize-none rounded-xl bg-white p-2 text-sm outline-none"
            style={{ border: "1px solid #E5D6BD", color: "#1F2933" }}
          />
          <button
            type="button"
            disabled={mut.isPending || text.trim().length < 2}
            onClick={() => mut.mutate(text.trim())}
            className="rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ background: "#C9A24A", color: "#FFFFFF" }}
          >
            {mut.isPending ? "Enviando…" : "Enviar resposta"}
          </button>
          {error && (
            <p className="text-xs" style={{ color: "#B23A48" }}>{error}</p>
          )}
        </div>
      )}
    </section>
  );
}
