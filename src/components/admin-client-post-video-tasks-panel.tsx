import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList, RefreshCw } from "lucide-react";
import { getClientPostVideoTaskSubmissions } from "@/lib/thermofit-post-video-tasks.functions";

type Item = {
  id: string;
  videoTitle: string | null;
  releaseDay: number | null;
  taskTitle: string;
  taskInstruction: string | null;
  response: string | null;
  responsePlaceholder: string | null;
  submittedAt: string;
  dueDate: string;
  missionActive: boolean | null;
  miles: number | null;
};

function fmtDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function AdminClientPostVideoTasksPanel({ clientId }: { clientId: string }) {
  const fetcher = useServerFn(getClientPostVideoTaskSubmissions);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin-client-post-video-tasks", clientId],
    queryFn: () => fetcher({ data: { clientId } }),
    enabled: !!clientId,
  });

  const items: Item[] = (data?.items ?? []) as Item[];

  return (
    <section id="tarefas-pos-video" className="rounded-lg border border-border bg-card p-4">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Tarefas pós-vídeo</h2>
          {items.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {items.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={"h-3 w-3 " + (isFetching ? "animate-spin" : "")} />
          Atualizar
        </button>
      </header>

      {isLoading && (
        <div className="space-y-2">
          {[0, 1].map((k) => (
            <div key={k} className="h-24 animate-pulse rounded-md border border-border bg-muted/30" />
          ))}
        </div>
      )}

      {!isLoading && isError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <p>Não foi possível carregar as tarefas pós-vídeo agora.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-100"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Esta cliente ainda não enviou tarefas pós-vídeo.
        </p>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="rounded-md border border-border bg-background p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                {it.releaseDay != null && (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                    Dia {String(it.releaseDay).padStart(2, "0")}
                  </span>
                )}
                {it.videoTitle && (
                  <span className="text-[11px] text-muted-foreground">
                    Vídeo: <span className="text-foreground">{it.videoTitle}</span>
                  </span>
                )}
              </div>

              <p className="text-sm font-semibold text-foreground">Tarefa: {it.taskTitle}</p>

              {it.taskInstruction && (
                <div className="mt-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Orientação da tarefa
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-xs text-foreground/80">
                    {it.taskInstruction}
                  </p>
                </div>
              )}

              <div className="mt-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Resposta da cliente
                </p>
                {it.response ? (
                  <p className="mt-0.5 whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-2 text-xs text-foreground">
                    {it.response}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs italic text-muted-foreground">
                    {it.responsePlaceholder ?? "Concluída sem resposta escrita."}
                  </p>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span>Enviada em {fmtDateTime(it.submittedAt)}</span>
                <span className="text-muted-foreground/40">•</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                  Concluída
                </span>
                {it.miles != null && it.miles > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                    +{it.miles} Milhas
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
