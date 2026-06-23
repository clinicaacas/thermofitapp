import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { listMessages, sendMessage, listClients } from "@/lib/thermofit-data.functions";
import {
  listSupportConversations,
  getConversationAdmin,
  replyAsAdmin,
  updateConversationStatus,
  listSupportTopicsAdmin,
} from "@/lib/thermofit-support.functions";
import { Send, Search } from "lucide-react";

export const Route = createFileRoute("/mensagens")({
  head: () => ({ meta: [{ title: "Suporte — ThermoFit" }] }),
  component: Page,
});

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
const FILTERS = ["todos", "aberto", "em_atendimento", "respondido", "encerrado"] as const;

function Page() {
  const fetchConvs = useServerFn(listSupportConversations);
  const fetchConv = useServerFn(getConversationAdmin);
  const reply = useServerFn(replyAsAdmin);
  const setStatusFn = useServerFn(updateConversationStatus);
  const fetchTopics = useServerFn(listSupportTopicsAdmin);
  const qc = useQueryClient();

  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("todos");
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState("todos");
  const [openId, setOpenId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [showHistorico, setShowHistorico] = useState(false);

  const { data: convData } = useQuery({
    queryKey: ["support-conversations", filter, search, topic],
    queryFn: () =>
      fetchConvs({ data: { status: filter === "todos" ? undefined : filter, search: search || undefined, topic: topic === "todos" ? undefined : topic } }),
    refetchInterval: 20000,
  });
  const conversations = convData?.conversations ?? [];

  const { data: topicsData } = useQuery({
    queryKey: ["support-topics-admin"],
    queryFn: () => fetchTopics(),
  });
  const topics = (topicsData?.topics ?? []) as Array<{ id: string; title: string; active: boolean }>;

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
      qc.invalidateQueries({ queryKey: ["support-conversation-admin", openId] });
      qc.invalidateQueries({ queryKey: ["support-conversations"] });
    },
  });

  const changeStatus = useMutation({
    mutationFn: async (status: string) =>
      setStatusFn({ data: { conversationId: openId!, status: status as any } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-conversation-admin", openId] });
      qc.invalidateQueries({ queryKey: ["support-conversations"] });
    },
  });

  const limit = 2000;
  const conv = openData?.conversation;
  const msgs = openData?.messages ?? [];

  return (
    <AppShell>
      <div className="space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Suporte</h1>
            <p className="text-sm text-muted-foreground">
              Solicitações enviadas pelas clientes pelo app.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowHistorico((v) => !v)}
            className="rounded-md border border-input px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
          >
            {showHistorico ? "Ocultar histórico de comunicados" : "Histórico de comunicados"}
          </button>
        </header>

        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          {/* List */}
          <section className="rounded-lg border border-border bg-card p-3">
            <div className="mb-2 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar cliente"
                  className="w-full rounded-md border border-input bg-background py-1.5 pl-7 pr-2 text-xs"
                />
              </div>
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="max-w-[180px] rounded-md border border-input bg-background px-2 py-1.5 text-xs"
              >
                <option value="todos">Todos os assuntos</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.title}>{t.title}</option>
                ))}
              </select>
            </div>
            <div className="mb-2 flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-2.5 py-1 text-[11px] ${
                    filter === f
                      ? "bg-primary text-primary-foreground"
                      : "border border-input bg-background text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {f === "todos" ? "Todos" : STATUS_LABEL[f]}
                </button>
              ))}
            </div>
            <ul className="max-h-[600px] divide-y divide-border overflow-y-auto">
              {conversations.map((c: any) => (
                <li key={c.id}>
                  <button
                    onClick={() => setOpenId(c.id)}
                    className={`flex w-full items-start gap-2 px-2 py-2 text-left hover:bg-accent ${
                      openId === c.id ? "bg-accent" : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="truncate text-sm font-medium">{c.client_name}</span>
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${STATUS_COLOR[c.status]}`}
                        >
                          {STATUS_LABEL[c.status]}
                        </span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{c.topic_label ?? "Solicitação"}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {c.last_sender === "admin" ? "Equipe: " : ""}
                        {c.last_preview}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(c.last_message_at).toLocaleString("pt-BR")}
                        {c.unread_for_admin ? " · não lida" : ""}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Responsável: {c.assigned_to_user_id ? "atribuído" : "—"}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
              {conversations.length === 0 && (
                <li className="px-2 py-4 text-center text-xs text-muted-foreground">Nenhuma solicitação.</li>
              )}
            </ul>
          </section>

          {/* Conversation */}
          <section className="rounded-lg border border-border bg-card p-3">
            {!conv ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Selecione uma solicitação.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <div>
                    <p className="text-sm font-semibold">{conv.topic_label ?? "Solicitação"}</p>
                    <Link
                      to="/clientes/$id"
                      params={{ id: conv.client_id }}
                      search={{ section: "suporte" } as any}
                      className="text-xs text-primary hover:underline"
                    >
                      Abrir perfil da cliente →
                    </Link>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={conv.status}
                      onChange={(e) => changeStatus.mutate(e.target.value)}
                      className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                    >
                      {Object.entries(STATUS_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="max-h-[420px] space-y-2 overflow-y-auto">
                  {msgs.map((m: any) => (
                    <div
                      key={m.id}
                      className={`max-w-[85%] rounded-lg p-2.5 text-sm ${
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
                <div className="space-y-2 border-t border-border pt-2">
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value.slice(0, limit))}
                    rows={3}
                    placeholder="Resposta da equipe…"
                    className="w-full resize-none rounded-md border border-input bg-background p-2 text-sm"
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {body.length}/{limit}
                    </span>
                    <button
                      disabled={!body.trim() || sendReply.isPending}
                      onClick={() => sendReply.mutate()}
                      className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" /> {sendReply.isPending ? "Enviando…" : "Enviar"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        {showHistorico && <HistoricoComunicados />}
      </div>
    </AppShell>
  );
}

function HistoricoComunicados() {
  const fetchMsgs = useServerFn(listMessages);
  const fetchClients = useServerFn(listClients);
  const send = useServerFn(sendMessage);
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [template, setTemplate] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const TEMPLATES = [
    { key: "pulso", label: "Pulso de hoje", body: "Oi! Como você está se sentindo hoje? Conta pra equipe ❤️" },
    { key: "reavaliacao", label: "Reavaliação", body: "Está na hora da sua reavaliação ThermoFit. Vamos agendar?" },
    { key: "arrasando", label: "Arrasando", body: "Você está arrasando! Continue firme, estamos com você 🚀" },
    { key: "sentimos_falta", label: "Sentimos falta", body: "Sentimos sua falta por aqui. Tá tudo bem? Conta pra gente." },
    { key: "foto_progresso", label: "Foto de progresso", body: "Que tal enviar sua foto de progresso esta semana?" },
  ];

  const { data: msgs } = useQuery({ queryKey: ["messages"], queryFn: () => fetchMsgs() });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: () => fetchClients() });
  const activeCount = (clients?.clients ?? []).filter((c) => c.status === "ativa").length;

  async function onSend() {
    if (!body.trim()) return;
    setSending(true);
    setFeedback(null);
    try {
      await send({ data: { template, body } });
      setBody("");
      setTemplate("");
      setFeedback("Mensagem registrada no histórico.");
      await qc.invalidateQueries({ queryKey: ["messages"] });
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Erro ao enviar.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="mb-3 text-sm font-semibold text-foreground">Histórico de comunicados</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Envios proativos antigos para todas as clientes. Preservado para auditoria.
      </p>
      <div className="flex flex-wrap gap-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTemplate(t.key);
              setBody(t.body);
            }}
            className={`rounded-full border px-3 py-1.5 text-xs ${
              template === t.key ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-accent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 2000))}
        placeholder="Escreva o comunicado…"
        className="mt-3 min-h-[100px] w-full rounded-md border border-input bg-background p-3 text-sm"
      />
      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>{body.length}/2000</span>
        {feedback && <span className="text-foreground">{feedback}</span>}
      </div>
      <button
        onClick={onSend}
        disabled={sending || !body.trim()}
        className="mt-3 inline-flex justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {sending ? "Registrando…" : `Registrar para ${activeCount} cliente${activeCount === 1 ? "" : "s"}`}
      </button>
      <div className="mt-4 max-h-[300px] overflow-y-auto">
        {(msgs?.messages ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum comunicado registrado.</p>
        ) : (
          <ul className="divide-y divide-border">
            {msgs!.messages.map((m) => (
              <li key={m.id} className="py-2">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{m.template || "manual"}</span>
                  <span>{new Date(m.createdAt).toLocaleString("pt-BR")}</span>
                </div>
                <p className="mt-1 text-xs">{m.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
