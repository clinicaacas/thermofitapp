import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ClientAppShell, useAppSettings } from "@/components/client-app-shell";
import { listHelpMessages, sendHelpMessage } from "@/lib/thermofit-client-app.functions";
import { AlertTriangle, Send } from "lucide-react";

export const Route = createFileRoute("/app/falar")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

function Page() {
  const { clientId } = useSearch({ from: "/app/falar" });
  const fetchMsgs = useServerFn(listHelpMessages);
  const sendMsg = useServerFn(sendHelpMessage);
  const qc = useQueryClient();
  const { data: settings } = useAppSettings(clientId);
  const QUICK = (settings?.quickTopics ?? []) as { key: string; label: string; creates_alert: boolean }[];

  const { data } = useQuery({
    queryKey: ["help-messages", clientId],
    queryFn: () => fetchMsgs({ data: { clientId } }),
    enabled: !!clientId,
  });

  const [topic, setTopic] = useState<string>("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const currentTopic = topic || QUICK[0]?.key || "";

  const mut = useMutation({
    mutationFn: async () => {
      const q = QUICK.find((x) => x.key === currentTopic);
      return sendMsg({
        data: {
          clientId,
          quickTopic: q?.label ?? null,
          body: body.trim(),
          createAlert: !!q?.creates_alert,
        },
      });
    },
    onSuccess: (res) => {
      setBody("");
      setStatus(res.alertCreated ? "Mensagem enviada — a equipe foi alertada." : "Mensagem enviada para a equipe.");
      qc.invalidateQueries({ queryKey: ["help-messages", clientId] });
    },
    onError: (e: any) => setStatus(e?.message ?? "Falha ao enviar."),
  });

  const remaining = 500 - body.length;

  return (
    <ClientAppShell title="Falar com a equipe">
      <div className="space-y-3">
        <p className="text-xs text-slate-500">Escolha um assunto rápido:</p>
        <div className="grid grid-cols-1 gap-2">
          {QUICK.map((q) => (
            <button
              key={q.key}
              onClick={() => setTopic(q.key)}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                currentTopic === q.key
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <span>{q.label}</span>
              {q.creates_alert && <AlertTriangle className="h-4 w-4 text-amber-500" />}
            </button>
          ))}
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 500))}
          rows={5}
          placeholder="Escreva sua mensagem (máx. 500 caracteres)"
          className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{remaining} caracteres restantes</span>
          <button
            disabled={!body.trim() || mut.isPending || !clientId}
            onClick={() => mut.mutate()}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-60"
          >
            <Send className="h-3.5 w-3.5" /> {mut.isPending ? "Enviando…" : "Enviar"}
          </button>
        </div>
        {status && (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
            {status}
          </div>
        )}

        <h3 className="mt-4 text-xs font-semibold uppercase text-slate-500">Suas mensagens</h3>
        <ul className="space-y-2">
          {(data?.messages ?? []).map((m: any) => (
            <li key={m.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">{new Date(m.created_at).toLocaleString("pt-BR")} · {m.quick_topic ?? "Mensagem"}</p>
              <p className="mt-1 text-sm">{m.body}</p>
              {m.created_alert_id && (
                <p className="mt-1 text-[11px] text-amber-600">⚠ Alerta gerado para a equipe</p>
              )}
            </li>
          ))}
          {(data?.messages ?? []).length === 0 && (
            <li className="text-xs text-slate-500">Nenhuma mensagem enviada ainda.</li>
          )}
        </ul>
      </div>
    </ClientAppShell>
  );
}
