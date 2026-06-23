import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ClientAppShell } from "@/components/client-app-shell";
import {
  listSupportTopicsClient,
  listMyConversations,
  getMyConversation,
  startConversation,
  replyAsClient,
} from "@/lib/thermofit-support.functions";
import { Send, ChevronLeft, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/app/falar")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

const STATUS_LABEL: Record<string, string> = {
  aberto: "Aberto",
  em_atendimento: "Em atendimento",
  respondido: "Respondido",
  encerrado: "Encerrado",
};
const STATUS_COLOR: Record<string, string> = {
  aberto: "#B45309",
  em_atendimento: "#1D4ED8",
  respondido: "#047857",
  encerrado: "#6B7280",
};

function Page() {
  const { clientId } = Route.useSearch();
  const fetchTopics = useServerFn(listSupportTopicsClient);
  const fetchConvs = useServerFn(listMyConversations);
  const fetchConv = useServerFn(getMyConversation);
  const startConv = useServerFn(startConversation);
  const reply = useServerFn(replyAsClient);
  const qc = useQueryClient();

  const [openId, setOpenId] = useState<string | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const { data: topicsData } = useQuery({
    queryKey: ["support-topics-client", clientId],
    queryFn: () => fetchTopics({ data: clientId ? { clientId } : {} }),
    refetchInterval: 15000,
  });
  const topics = (topicsData?.topics ?? [{ id: null, title: "Outro assunto", sort_order: 0 }]) as Array<{
    id: string | null;
    title: string;
    sort_order: number;
  }>;

  const { data: convData } = useQuery({
    queryKey: ["support-my-conversations", clientId],
    queryFn: () => fetchConvs({ data: clientId ? { clientId } : {} }),
    refetchInterval: 15000,
  });
  const conversations = convData?.conversations ?? [];

  const { data: openData } = useQuery({
    queryKey: ["support-conversation", openId, clientId],
    queryFn: () => fetchConv({ data: { conversationId: openId!, ...(clientId ? { clientId } : {}) } }),
    enabled: !!openId,
    refetchInterval: openId ? 15000 : false,
  });

  const sendNew = useMutation({
    mutationFn: async () => {
      const t = topics.find((x) => x.id === topicId) ?? topics.find((x) => x.title === "Outro assunto") ?? topics[0];
      return startConv({
        data: {
          ...(clientId ? { clientId } : {}),
          topicId: t?.id ?? null,
          topicLabel: t?.title ?? "Outro assunto",
          body: body.trim(),
        },
      });
    },
    onSuccess: (res) => {
      setBody("");
      setTopicId(null);
      setStatus("Mensagem enviada para a equipe.");
      qc.invalidateQueries({ queryKey: ["support-my-conversations"] });
      qc.invalidateQueries({ queryKey: ["support-conversations"] });
      qc.invalidateQueries({ queryKey: ["client-support-conversations"] });
      setOpenId(res.conversationId);
    },
    onError: () => setStatus("Não foi possível enviar sua solicitação. Tente novamente."),
  });

  const sendReply = useMutation({
    mutationFn: async () => {
      return reply({ data: { conversationId: openId!, body: body.trim(), ...(clientId ? { clientId } : {}) } });
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["support-conversation", openId] });
      qc.invalidateQueries({ queryKey: ["support-my-conversations"] });
      qc.invalidateQueries({ queryKey: ["support-conversations"] });
      qc.invalidateQueries({ queryKey: ["client-support-conversations"] });
    },
    onError: () => setStatus("Não foi possível enviar sua solicitação. Tente novamente."),
  });

  const limit = 2000;
  const counter = `${body.length}/${limit}`;

  if (openId) {
    const conv = openData?.conversation;
    const msgs = openData?.messages ?? [];
    return (
      <ClientAppShell title="Suporte" allowMissingClientId>
        <div className="space-y-3">
          <button
            onClick={() => {
              setOpenId(null);
              setBody("");
              setStatus(null);
            }}
            className="inline-flex items-center gap-1 text-xs text-slate-600"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Voltar
          </button>
          {conv && (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">{conv.topic_label ?? "Solicitação"}</span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                  style={{ background: STATUS_COLOR[conv.status] }}
                >
                  {STATUS_LABEL[conv.status]}
                </span>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {msgs.map((m: any) => (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-lg p-2.5 text-sm ${
                  m.sender_type === "client"
                    ? "ml-auto bg-indigo-600 text-white"
                    : "mr-auto border border-slate-200 bg-white text-slate-800"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`mt-1 text-[10px] ${m.sender_type === "client" ? "text-indigo-100" : "text-slate-500"}`}>
                  {m.sender_type === "client" ? "Você" : "Equipe"} ·{" "}
                  {new Date(m.created_at).toLocaleString("pt-BR")}
                </p>
              </div>
            ))}
          </div>
          <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, limit))}
              rows={3}
              placeholder="Escreva sua resposta…"
              className="w-full resize-none rounded-md border border-slate-200 bg-white p-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{counter}</span>
              <button
                disabled={!body.trim() || sendReply.isPending}
                onClick={() => sendReply.mutate()}
                className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
              >
                <Send className="h-3.5 w-3.5" /> {sendReply.isPending ? "Enviando…" : "Enviar"}
              </button>
            </div>
            {status && <p className="text-[11px] text-slate-500">{status}</p>}
          </div>
        </div>
      </ClientAppShell>
    );
  }

  return (
    <ClientAppShell title="Suporte" allowMissingClientId>
      <div className="space-y-3">
        <p className="text-xs text-slate-600">
          Envie sua mensagem para nossa equipe. Vamos acompanhar sua solicitação e responder por aqui.
        </p>

        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold text-slate-700">Assunto</p>
          <div className="grid grid-cols-1 gap-1.5">
            {topics.map((t: any) => {
              const selectedTopic = topics.find((x) => x.id === topicId) ?? topics.find((x) => x.title === "Outro assunto") ?? topics[0];
              const selected = selectedTopic?.id === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTopicId(t.id)}
                  className={`rounded-md border px-3 py-2 text-left text-sm ${
                    selected
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  {t.title}
                </button>
              );
            })}
          </div>

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, limit))}
            rows={4}
            placeholder="Escreva sua mensagem"
            className="mt-1 w-full resize-none rounded-md border border-slate-200 bg-white p-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{counter}</span>
            <button
              disabled={!body.trim() || sendNew.isPending}
              onClick={() => sendNew.mutate()}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" /> {sendNew.isPending ? "Enviando…" : "Enviar"}
            </button>
          </div>
          {status && (
            <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
              {status}
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Suas solicitações</h3>
          <ul className="space-y-2">
            {conversations.map((c: any) => (
              <li key={c.id}>
                <button
                  onClick={() => setOpenId(c.id)}
                  className="flex w-full items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-left"
                >
                  <MessageCircle className="mt-0.5 h-4 w-4 text-indigo-500" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-800">{c.topic_label ?? "Solicitação"}</p>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                        style={{ background: STATUS_COLOR[c.status] }}
                      >
                        {STATUS_LABEL[c.status]}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-600">
                      {c.last_sender === "admin" ? "Equipe: " : ""}
                      {c.last_preview}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {new Date(c.last_message_at).toLocaleString("pt-BR")}
                      {c.unread_for_client ? " · nova resposta" : ""}
                    </p>
                  </div>
                </button>
              </li>
            ))}
            {conversations.length === 0 && (
              <li className="text-xs text-slate-500">Nenhuma solicitação ainda.</li>
            )}
          </ul>
        </div>
      </div>
    </ClientAppShell>
  );
}
