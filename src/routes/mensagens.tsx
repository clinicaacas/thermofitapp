import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { listMessages, sendMessage, listClients } from "@/lib/thermofit-data.functions";

const TEMPLATES: { key: string; label: string; body: string }[] = [
  { key: "pulso", label: "Pulso de hoje", body: "Oi! Como você está se sentindo hoje? Conta pra equipe ❤️" },
  { key: "reavaliacao", label: "Reavaliação", body: "Está na hora da sua reavaliação ThermoFit. Vamos agendar?" },
  { key: "arrasando", label: "Arrasando", body: "Você está arrasando! Continue firme, estamos com você 🚀" },
  { key: "sentimos_falta", label: "Sentimos falta", body: "Sentimos sua falta por aqui. Tá tudo bem? Conta pra gente." },
  { key: "foto_progresso", label: "Foto de progresso", body: "Que tal enviar sua foto de progresso esta semana?" },
];

export const Route = createFileRoute("/mensagens")({
  head: () => ({ meta: [{ title: "Mensagens — ThermoFit" }] }),
  component: Page,
});

function Page() {
  const fetchMsgs = useServerFn(listMessages);
  const fetchClients = useServerFn(listClients);
  const send = useServerFn(sendMessage);
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [template, setTemplate] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const { data: msgs } = useQuery({ queryKey: ["messages"], queryFn: () => fetchMsgs() });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: () => fetchClients() });

  const activeCount = (clients?.clients ?? []).filter((c) => c.status === "ativa").length;

  function pickTemplate(t: (typeof TEMPLATES)[number]) {
    setTemplate(t.key);
    setBody(t.body);
  }

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
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-foreground">Mensagens</h1>
          <p className="text-sm text-muted-foreground">
            Envie uma mensagem para todas as clientes ativas
          </p>
        </header>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Templates rápidos</h2>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.key}
                onClick={() => pickTemplate(t)}
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
            placeholder="Escreva a mensagem…"
            className="mt-4 min-h-[140px] w-full rounded-md border border-input bg-background p-3 text-sm"
          />
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>{body.length}/2000</span>
            {feedback && <span className="text-foreground">{feedback}</span>}
          </div>

          <button
            onClick={onSend}
            disabled={sending || !body.trim()}
            className="mt-3 inline-flex w-full justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {sending ? "Registrando…" : `Enviar para ${activeCount} cliente${activeCount === 1 ? "" : "s"}`}
          </button>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Nesta versão a mensagem é registrada manualmente no histórico. O envio real por WhatsApp será integrado em fase futura.
          </p>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Histórico recente</h2>
          {(msgs?.messages ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma mensagem registrada.</p>
          ) : (
            <ul className="divide-y divide-border">
              {msgs!.messages.map((m) => (
                <li key={m.id} className="py-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{m.template || "manual"}</span>
                    <span>{new Date(m.createdAt).toLocaleString("pt-BR")}</span>
                  </div>
                  <p className="mt-1 text-sm text-foreground">{m.body}</p>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {m.clientName ? `Para ${m.clientName}` : `Para ${m.recipientsCount} cliente(s)`}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
