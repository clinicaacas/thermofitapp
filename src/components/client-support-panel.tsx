import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listClientConversationsAdmin,
  getConversationAdmin,
  replyAsAdmin,
  updateConversationStatus,
  listSupportTopicsAdmin,
  startConversationAsAdmin,
} from "@/lib/thermofit-support.functions";
import { Plus, Send } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  aberto: "Aberto",
  em_atendimento: "Em atendimento",
  respondido: "Respondido",
  encerrado: "Encerrado",
};
const STATUS_COLOR: Record<string, string> = {
  aberto: "bg-amber-100 text-amber-800",
  em_atendimento: "bg-blue-100 text-blue-800",
  respondido: "bg-emerald-100 text-emerald-800",
  encerrado: "bg-slate-200 text-slate-700",
};

export function ClientSupportPanel({ clientId, initialOpenId }: { clientId: string; initialOpenId?: string | null }) {
  const fetchConvs = useServerFn(listClientConversationsAdmin);
  const fetchConv = useServerFn(getConversationAdmin);
  const reply = useServerFn(replyAsAdmin);
  const setStatusFn = useServerFn(updateConversationStatus);
  const fetchTopics = useServerFn(listSupportTopicsAdmin);
  const startAdminConversation = useServerFn(startConversationAsAdmin);
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const [body, setBody] = useState("");
  const [newTopicId, setNewTopicId] = useState<string | null>(null);
  const [newBody, setNewBody] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const { data: convData } = useQuery({
    queryKey: ["client-support-conversations", clientId],
    queryFn: () => fetchConvs({ data: { clientId } }),
  });
  const conversations = convData?.conversations ?? [];

  const { data: topicsData } = useQuery({
    queryKey: ["support-topics-admin"],
    queryFn: () => fetchTopics(),
  });
  const topics = (topicsData?.topics ?? []) as Array<{ id: string; title: string; active: boolean; sort_order: number }>;
  const activeTopics = topics.filter((t) => t.active);

  const { data: openData } = useQuery({
    queryKey: ["support-conversation-admin", openId],
    queryFn: () => fetchConv({ data: { conversationId: openId! } }),
    enabled: !!openId,
    refetchInterval: openId ? 15000 : false,
  });

  const sendReply = useMutation({
    mutationFn: async () => reply({ data: { conversationId: openId!, body: body.trim() } }),
    onSuccess: () => {
      setBody("");
      setFeedback("Resposta enviada.");
      qc.invalidateQueries({ queryKey: ["support-conversation-admin", openId] });
      qc.invalidateQueries({ queryKey: ["client-support-conversations", clientId] });
      qc.invalidateQueries({ queryKey: ["support-conversations"] });
      qc.invalidateQueries({ queryKey: ["support-my-conversations"] });
    },
    onError: () => setFeedback("Não foi possível enviar a resposta."),
  });

  const startConversation = useMutation({
    mutationFn: async () => {
      const selected = activeTopics.find((t) => t.id === newTopicId) ?? activeTopics.find((t) => t.title === "Outro assunto") ?? activeTopics[0];
      return startAdminConversation({
        data: {
          clientId,
          topicId: selected?.id ?? null,
          topicLabel: selected?.title ?? "Outro assunto",
          body: newBody.trim(),
        },
      });
    },
    onSuccess: (res) => {
      setNewBody("");
      setNewTopicId(null);
      setFeedback("Conversa iniciada.");
      setOpenId(res.conversationId);
      qc.invalidateQueries({ queryKey: ["client-support-conversations", clientId] });
      qc.invalidateQueries({ queryKey: ["support-conversation-admin", res.conversationId] });
      qc.invalidateQueries({ queryKey: ["support-conversations"] });
      qc.invalidateQueries({ queryKey: ["support-my-conversations"] });
    },
    onError: () => setFeedback("Não foi possível iniciar a conversa."),
  });

  const changeStatus = useMutation({
    mutationFn: async (status: string) =>
      setStatusFn({ data: { conversationId: openId!, status: status as any } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-conversation-admin", openId] });
      qc.invalidateQueries({ queryKey: ["client-support-conversations", clientId] });
      qc.invalidateQueries({ queryKey: ["support-conversations"] });
    },
  });

  const conv = openData?.conversation;
  const msgs = openData?.messages ?? [];
  const limit = 2000;

  return (
    <section id="suporte" className="rounded-lg border border-border bg-card p-3">
      <h2 className="mb-2 text-sm font-semibold">Suporte</h2>
      <div className="grid gap-3 lg:grid-cols-[0.9fr_1.4fr]">
        <ul className="max-h-[420px] divide-y divide-border overflow-y-auto rounded border border-border">
          <li className="p-2">
            <button
              type="button"
              onClick={() => {
                setOpenId(null);
                setFeedback(null);
              }}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-input px-2 py-1.5 text-xs font-medium hover:bg-accent"
            >
              <Plus className="h-3.5 w-3.5" /> Iniciar conversa
            </button>
          </li>
          {conversations.map((c: any) => (
            <li key={c.id}>
              <button
                onClick={() => setOpenId(c.id)}
                className={`flex w-full flex-col items-start gap-0.5 px-2 py-2 text-left hover:bg-accent ${
                  openId === c.id ? "bg-accent" : ""
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="truncate text-xs font-medium">{c.topic_label ?? "Solicitação"}</span>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${STATUS_COLOR[c.status]}`}>
                    {STATUS_LABEL[c.status]}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(c.last_message_at).toLocaleString("pt-BR")}
                </span>
                {c.last_preview && (
                  <span className="line-clamp-1 text-[10px] text-muted-foreground">
                    {c.last_sender === "admin" ? "Equipe: " : "Cliente: "}{c.last_preview}
                  </span>
                )}
              </button>
            </li>
          ))}
          {conversations.length === 0 && (
            <li className="px-2 py-4 text-center text-xs text-muted-foreground">Nenhuma conversa ainda.</li>
          )}
        </ul>
        <div className="rounded border border-border p-2">
          {!conv ? (
            <div className="space-y-2">
              <div>
                <p className="text-xs font-semibold">Iniciar conversa</p>
                <p className="text-[11px] text-muted-foreground">Envie uma mensagem da equipe para esta cliente.</p>
              </div>
              <select
                value={newTopicId ?? ""}
                onChange={(e) => setNewTopicId(e.target.value || null)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
              >
                <option value="">Outro assunto</option>
                {activeTopics.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
              <textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value.slice(0, limit))}
                rows={3}
                placeholder="Mensagem para a cliente…"
                className="w-full resize-none rounded-md border border-input bg-background p-2 text-xs"
              />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{newBody.length}/{limit}</span>
                <button
                  disabled={!newBody.trim() || startConversation.isPending}
                  onClick={() => startConversation.mutate()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
                >
                  <Send className="h-3 w-3" /> {startConversation.isPending ? "Enviando…" : "Enviar mensagem"}
                </button>
              </div>
              {feedback && <p className="text-[11px] text-muted-foreground">{feedback}</p>}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <p className="text-xs font-semibold">{conv.topic_label ?? "Solicitação"}</p>
                <select
                  value={conv.status}
                  onChange={(e) => changeStatus.mutate(e.target.value)}
                  className="rounded-md border border-input bg-background px-2 py-1 text-[11px]"
                >
                  {Object.entries(STATUS_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="max-h-[300px] space-y-2 overflow-y-auto">
                {msgs.map((m: any) => (
                  <div
                    key={m.id}
                    className={`max-w-[85%] rounded-lg p-2 text-xs ${
                      m.sender_type === "admin"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "mr-auto border border-border bg-background"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p
                      className={`mt-1 text-[10px] ${
                        m.sender_type === "admin" ? "text-primary-foreground/70" : "text-muted-foreground"
                      }`}
                    >
                      {m.sender_type === "admin" ? "Equipe" : "Cliente"} ·{" "}
                      {new Date(m.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                ))}
              </div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, limit))}
                rows={2}
                placeholder="Resposta da equipe…"
                className="w-full resize-none rounded-md border border-input bg-background p-2 text-xs"
              />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  {body.length}/{limit}
                </span>
                <button
                  disabled={!body.trim() || sendReply.isPending}
                  onClick={() => sendReply.mutate()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
                >
                  <Send className="h-3 w-3" /> {sendReply.isPending ? "Enviando…" : "Enviar"}
                </button>
              </div>
              {feedback && <p className="text-[11px] text-muted-foreground">{feedback}</p>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
