import { useState } from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mail, MailOpen, ArrowLeft } from "lucide-react";
import { ClientAppShell } from "@/components/client-app-shell";
import { listClientLetters, markLetterRead } from "@/lib/thermofit-client-app.functions";

export const Route = createFileRoute("/app/cartas")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

type Letter = {
  id: string;
  title: string;
  body: string;
  sent_at: string;
  read_at: string | null;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function Page() {
  const { clientId } = useSearch({ from: "/app/cartas" });
  const fetchLetters = useServerFn(listClientLetters);
  const markRead = useServerFn(markLetterRead);
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["client-letters", clientId],
    queryFn: () => fetchLetters({ data: { clientId } }),
    enabled: !!clientId,
  });

  const mutation = useMutation({
    mutationFn: (letterId: string) => markRead({ data: { clientId, letterId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-letters", clientId] }),
  });

  const letters = (data?.letters ?? []) as Letter[];
  const open = letters.find((l) => l.id === openId) ?? null;

  function handleOpen(letter: Letter) {
    setOpenId(letter.id);
    if (!letter.read_at) mutation.mutate(letter.id);
  }

  if (open) {
    return (
      <ClientAppShell>
        <button
          type="button"
          onClick={() => setOpenId(null)}
          className="inline-flex items-center gap-1 text-xs font-medium"
          style={{ color: "#8A6A3D" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar
        </button>
        <article
          className="mt-3 rounded-2xl bg-white p-5"
          style={{ border: "1px solid #E5E0D8" }}
        >
          <p className="text-[10px] font-semibold tracking-wider" style={{ color: "#8A6A3D" }}>
            CARTA · {formatDate(open.sent_at)}
          </p>
          <h2 className="mt-1 text-lg font-semibold" style={{ color: "#1F2933" }}>
            {open.title}
          </h2>
          <div
            className="mt-4 whitespace-pre-line text-sm leading-relaxed"
            style={{ color: "#374151" }}
          >
            {open.body}
          </div>
        </article>
      </ClientAppShell>
    );
  }

  return (
    <ClientAppShell title="Cartas" subtitle="Mensagens da equipe para você">
      {isLoading ? (
        <p className="text-sm" style={{ color: "#6B7280" }}>Carregando…</p>
      ) : letters.length === 0 ? (
        <section
          className="rounded-2xl bg-white p-6 text-center"
          style={{ border: "1px solid #E5E0D8" }}
        >
          <div
            className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl"
            style={{ background: "#F3E8D2" }}
          >
            <Mail className="h-6 w-6" style={{ color: "#8A6A3D" }} />
          </div>
          <p className="text-sm font-semibold" style={{ color: "#1F2933" }}>
            Nenhuma carta ainda
          </p>
          <p className="mt-1 text-xs" style={{ color: "#6B7280" }}>
            Quando a equipe escrever para você, aparece aqui.
          </p>
        </section>
      ) : (
        <ul className="space-y-2">
          {letters.map((letter) => {
            const unread = !letter.read_at;
            const Icon = unread ? Mail : MailOpen;
            return (
              <li key={letter.id}>
                <button
                  type="button"
                  onClick={() => handleOpen(letter)}
                  className="flex w-full items-start gap-3 rounded-2xl bg-white p-3 text-left"
                  style={{ border: "1px solid #E5E0D8" }}
                >
                  <div
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                    style={{ background: unread ? "#F3E8D2" : "#FAF5EC" }}
                  >
                    <Icon className="h-4 w-4" style={{ color: "#8A6A3D" }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className="truncate text-sm"
                        style={{ color: "#1F2933", fontWeight: unread ? 600 : 500 }}
                      >
                        {letter.title}
                      </p>
                      {unread && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ background: "#D6A93F", color: "#FFFFFF" }}
                        >
                          Nova
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[11px]" style={{ color: "#6B7280" }}>
                      {formatDate(letter.sent_at)} · {letter.body.slice(0, 60)}
                      {letter.body.length > 60 ? "…" : ""}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </ClientAppShell>
  );
}
