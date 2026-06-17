import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ClientAppShell } from "@/components/client-app-shell";
import { getVacuumDataForClient, logVacuumEvent } from "@/lib/thermofit-vacuum.functions";
import { Play, ChevronLeft, ChevronRight, CheckCircle2, Image as ImageIcon } from "lucide-react";

export const Route = createFileRoute("/app/vacuum")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

function Page() {
  const { clientId } = useSearch({ from: "/app/vacuum" });
  const fetchData = useServerFn(getVacuumDataForClient);
  const { data } = useQuery({
    queryKey: ["vacuum-client", clientId],
    queryFn: () => fetchData({ data: { clientId } }),
    enabled: !!clientId,
  });

  const [tab, setTab] = useState<"praticar" | "guia">("praticar");

  const s = data?.settings;
  const eyebrow = s?.eyebrow ?? "MÉTODO THERMOFIT";
  const titleFirst = s?.title_first ?? "Cintura";
  const titleSecond = s?.title_second ?? "Ativa";
  const subtitle = s?.subtitle ?? "Core de dentro pra fora — protocolo completo";

  return (
    <ClientAppShell>
      <div className="space-y-4">
        <div className="pt-1">
          <p className="text-[10px] font-semibold tracking-[0.2em]" style={{ color: "#8A6A3D" }}>
            {eyebrow}
          </p>
          <h1 className="mt-1 text-3xl font-bold leading-tight" style={{ color: "#1F2933" }}>
            {titleFirst}{" "}
            <span style={{ color: "#C9A24A" }}>{titleSecond}</span>
          </h1>
          <p className="mt-1 text-xs" style={{ color: "#6B7280" }}>
            {subtitle}
          </p>
        </div>

        <div className="flex rounded-full border p-1" style={{ borderColor: "#E5D6BD", background: "#FFFFFF" }}>
          <TabButton active={tab === "praticar"} onClick={() => setTab("praticar")} label={s?.practice_tab_label ?? "Praticar"} />
          <TabButton active={tab === "guia"} onClick={() => setTab("guia")} label={s?.guide_tab_label ?? "Guia Completo"} />
        </div>

        {tab === "praticar" ? (
          <Practice data={data} clientId={clientId} />
        ) : (
          <Guide data={data} onSkip={() => setTab("praticar")} />
        )}
      </div>
    </ClientAppShell>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 rounded-full py-2 text-sm font-medium transition"
      style={{
        background: active ? "#8A6A3D" : "transparent",
        color: active ? "#FFFFFF" : "#5C4528",
      }}
    >
      {label}
    </button>
  );
}

function Practice({ data, clientId }: { data: any; clientId: string }) {
  const qc = useQueryClient();
  const log = useServerFn(logVacuumEvent);
  const [feedback, setFeedback] = useState<string | null>(null);

  const startMut = useMutation({
    mutationFn: () => log({ data: { clientId, eventType: "treino_iniciado" } }),
    onSuccess: () => {
      setFeedback("Treino iniciado.");
      qc.invalidateQueries({ queryKey: ["vacuum-client", clientId] });
      setTimeout(() => setFeedback(null), 3500);
    },
    onError: (e: any) => setFeedback(e?.message ?? "Falha ao registrar."),
  });

  const s = data?.settings;
  const exercises = data?.exercises ?? [];

  return (
    <div className="space-y-3">
      <div className="rounded-2xl p-4" style={{ background: "#3D2E1C", color: "#F8F1E6" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.18em]" style={{ color: "#C9A24A" }}>
              {s?.card_eyebrow ?? "PROTOCOLO COMPLETO"}
            </p>
            <h2 className="mt-1 text-lg font-bold">{s?.card_title ?? "Treino Cintura Ativa"}</h2>
            <p className="mt-0.5 text-xs" style={{ color: "#E5D6BD" }}>
              {s?.card_subtitle ?? "5 exercícios · 3 séries cada"}
            </p>
          </div>
          <span
            className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: "#C9A24A", color: "#3D2E1C" }}
          >
            {s?.estimated_time ?? "~10 min"}
          </span>
        </div>
      </div>

      <ul className="space-y-2">
        {exercises.map((ex: any, i: number) => (
          <li
            key={ex.id}
            className="flex items-center gap-3 rounded-2xl bg-white p-3"
            style={{ border: "1px solid #E5D6BD" }}
          >
            <div
              className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl"
              style={{ background: "#F3E8D2" }}
            >
              {ex.thumbnail_signed_url ? (
                <img
                  src={ex.thumbnail_signed_url}
                  alt={ex.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <ImageIcon className="h-5 w-5" style={{ color: "#8A6A3D" }} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold" style={{ color: "#1F2933" }}>
                {ex.name}
              </p>
              <p className="text-xs" style={{ color: "#6B7280" }}>
                {[ex.short_description, ex.prescription_text].filter(Boolean).join(" · ")}
              </p>
            </div>
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold"
              style={{ background: "#F3E8D2", color: "#8A6A3D" }}
            >
              {i + 1}
            </span>
          </li>
        ))}
        {exercises.length === 0 && (
          <li className="rounded-2xl bg-white p-4 text-center text-xs" style={{ color: "#6B7280", border: "1px solid #E5D6BD" }}>
            Nenhum exercício configurado.
          </li>
        )}
      </ul>

      {feedback && (
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
          style={{ background: "#E8F5E9", color: "#1B5E20" }}
        >
          <CheckCircle2 className="h-4 w-4" /> {feedback}
        </div>
      )}

      <button
        onClick={() => startMut.mutate()}
        disabled={startMut.isPending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold disabled:opacity-60"
        style={{ background: "#8A6A3D", color: "#FFFFFF" }}
      >
        <Play className="h-4 w-4" /> {startMut.isPending ? "Registrando…" : (s?.button_text ?? "Começar Treino")}
      </button>
    </div>
  );
}

function Guide({ data, onSkip }: { data: any; onSkip: () => void }) {
  const pages = data?.pages ?? [];
  const s = data?.settings;
  const [idx, setIdx] = useState(0);
  const total = pages.length;
  const current = pages[idx];
  const isLast = idx === total - 1;
  const pct = total > 0 ? ((idx + 1) / total) * 100 : 0;

  if (total === 0) {
    return (
      <div className="rounded-2xl bg-white p-4 text-center text-sm" style={{ color: "#6B7280", border: "1px solid #E5D6BD" }}>
        Guia ainda não publicado.
      </div>
    );
  }

  function next() {
    if (isLast) onSkip();
    else setIdx((i) => Math.min(total - 1, i + 1));
  }
  function prev() {
    setIdx((i) => Math.max(0, i - 1));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold" style={{ color: "#3D2E1C" }}>
          {current?.title}
        </span>
        <span style={{ color: "#6B7280" }}>
          {idx + 1} / {total}
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "#F3E8D2" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: "#C9A24A" }}
        />
      </div>

      <div
        className="overflow-hidden rounded-2xl bg-white"
        style={{ border: "1px solid #E5D6BD" }}
      >
        <div className="grid aspect-[3/4] w-full place-items-center" style={{ background: "#F8F1E6" }}>
          {current?.image_signed_url ? (
            <img
              src={current.image_signed_url}
              alt={current.alt_text || current.title}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="p-6 text-center text-xs" style={{ color: "#6B7280" }}>
              <ImageIcon className="mx-auto mb-2 h-8 w-8" style={{ color: "#C9A24A" }} />
              Imagem ainda não publicada para esta página.
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={prev}
          disabled={idx === 0}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-full border py-2.5 text-sm font-semibold disabled:opacity-40"
          style={{ borderColor: "#E5D6BD", color: "#5C4528", background: "#FFFFFF" }}
        >
          <ChevronLeft className="h-4 w-4" /> Anterior
        </button>
        <button
          onClick={next}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-full py-2.5 text-sm font-semibold"
          style={{ background: "#8A6A3D", color: "#FFFFFF" }}
        >
          {isLast ? (s?.finish_guide_text ?? "Começar a Praticar") : "Próximo"}
          {!isLast && <ChevronRight className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
        {pages.map((_: any, i: number) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            aria-label={`Página ${i + 1}`}
            className="h-2 rounded-full transition-all"
            style={{
              width: i === idx ? 18 : 8,
              background: i === idx ? "#C9A24A" : "#E5D6BD",
            }}
          />
        ))}
      </div>

      <button
        onClick={onSkip}
        className="block w-full pt-1 text-center text-xs underline-offset-2 hover:underline"
        style={{ color: "#8A6A3D" }}
      >
        {s?.skip_guide_text ?? "Pular guia e ir direto para a prática"}
      </button>
    </div>
  );
}
