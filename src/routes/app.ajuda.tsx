import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ClientAppShell } from "@/components/client-app-shell";
import {
  sendHelpMessage,
  listHelpMessages,
  getAppSettingsForClient,
} from "@/lib/thermofit-client-app.functions";
import { MessageCircle, Send, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/app/ajuda")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

function Page() {
  const { clientId } = useSearch({ from: "/app/ajuda" });
  const qc = useQueryClient();
  const sendFn = useServerFn(sendHelpMessage);
  const listFn = useServerFn(listHelpMessages);
  const settingsFn = useServerFn(getAppSettingsForClient);

  const { data: settings } = useQuery({
    queryKey: ["client-app-settings", clientId],
    queryFn: () => settingsFn({ data: { clientId } }),
    enabled: !!clientId,
  });
  const { data: messagesData } = useQuery({
    queryKey: ["client-help-messages", clientId],
    queryFn: () => listFn({ data: { clientId } }),
    enabled: !!clientId,
  });

  const quickTopics = settings?.quickTopics ?? [];
  const [topic, setTopic] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const selectedTopic = quickTopics.find((t: any) => t.key === topic);
  const willAlert = !!selectedTopic?.creates_alert;

  const mut = useMutation({
    mutationFn: () =>
      sendFn({
        data: {
          clientId,
          quickTopic: selectedTopic?.label ?? null,
          body: body.trim(),
          createAlert: willAlert,
        },
      }),
    onSuccess: (res: any) => {
      setBody("");
      setTopic(null);
      setFeedback({
        type: "ok",
        text: res?.alertCreated
          ? "Mensagem enviada — a equipe foi alertada e vai te responder em breve."
          : "Mensagem enviada! Responderemos o quanto antes.",
      });
      qc.invalidateQueries({ queryKey: ["client-help-messages", clientId] });
    },
    onError: (e: any) =>
      setFeedback({ type: "err", text: e?.message ?? "Falha ao enviar mensagem." }),
  });

  const messages = messagesData?.messages ?? [];
  const canSend = body.trim().length > 0 && !mut.isPending;

  return (
    <ClientAppShell
      title="Falar com a equipe"
      subtitle="A equipe Acas está aqui para você. Não estamos aqui para cobrar — estamos aqui para ajudar."
    >
      <div className="space-y-4">
        <div
          className="rounded-2xl p-3 text-xs"
          style={{ background: "#FDF6EC", color: "#5C4528", border: "1px solid #E5D6BD" }}
        >
          <MessageCircle className="mb-1 h-4 w-4" />
          Sua mensagem vai direto para a equipe. Respondemos o mais rápido possível.
        </div>

        {quickTopics.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7A6A52]">
              Sobre o que é?
            </p>
            <div className="flex flex-wrap gap-2">
              {quickTopics.map((t: any) => {
                const active = topic === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTopic(active ? null : t.key)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? "border-[#8A6A3D] bg-[#8A6A3D] text-white"
                        : "border-[#E5D6BD] bg-white text-[#5C4528]"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-[#E5D6BD] bg-white p-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={500}
            rows={5}
            placeholder="Escreva sua mensagem aqui…"
            className="w-full resize-none rounded-lg border-none bg-transparent p-2 text-sm text-[#3D2E1C] focus:outline-none"
          />
          <div className="flex items-center justify-between border-t border-[#F3E8D2] px-2 pt-2">
            <span className="text-[10px] text-[#7A6A52]">{body.length}/500</span>
            {willAlert && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700">
                <AlertTriangle className="h-3 w-3" /> Equipe será alertada
              </span>
            )}
          </div>
        </div>

        {feedback && (
          <div
            className={`rounded-lg px-3 py-2 text-sm ${
              feedback.type === "ok"
                ? "border border-green-200 bg-green-50 text-green-700"
                : "border border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {feedback.text}
          </div>
        )}

        <button
          onClick={() => {
            setFeedback(null);
            mut.mutate();
          }}
          disabled={!canSend}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#8A6A3D] py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {mut.isPending ? "Enviando…" : "Enviar mensagem"}
        </button>

        {messages.length > 0 && (
          <div className="rounded-2xl border border-[#E5D6BD] bg-white p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7A6A52]">
              Histórico
            </p>
            <ul className="divide-y divide-[#F3E8D2]">
              {messages.map((m: any) => (
                <li key={m.id} className="py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#8A6A3D]">
                      {m.quick_topic || "Mensagem"}
                    </span>
                    <span className="text-[10px] text-[#7A6A52]">
                      {new Date(m.created_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-[#3D2E1C]">{m.body}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ClientAppShell>
  );
}
