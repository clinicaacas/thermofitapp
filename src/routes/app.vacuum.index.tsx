import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useMemo, useRef } from "react";
import { ClientAppShell } from "@/components/client-app-shell";
import { useAuth } from "@/lib/auth-context";
import { getVacuumDataForClient, logVacuumEvent } from "@/lib/thermofit-vacuum.functions";
import { Play, ChevronLeft, ChevronRight, CheckCircle2, Image as ImageIcon } from "lucide-react";


export const Route = createFileRoute("/app/vacuum/")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

function Page() {
  const { clientId } = Route.useSearch();
  const { user } = useAuth();
  const scopeClientId = user?.kind === "client" && user.clientId ? user.clientId : clientId;
  const fetchData = useServerFn(getVacuumDataForClient);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["vacuum-client-data", scopeClientId],
    queryFn: () => fetchData({ data: { clientId: scopeClientId || undefined } }),
    enabled: !!scopeClientId,
    staleTime: 0,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    placeholderData: keepPreviousData,
  });

  const [tab, setTab] = useState<"praticar" | "guia">("praticar");

  const s = data?.settings;
  const eyebrow = s?.eyebrow ?? "MÉTODO THERMOFIT";
  const titleFirst = s?.title_first ?? "Cintura";
  const titleSecond = s?.title_second ?? "Ativa";
  const subtitle = s?.subtitle ?? "Core de dentro pra fora — protocolo completo";

  // Preload all guide images + exercise thumbs once data arrives (background)
  useEffect(() => {
    if (!data) return;
    const urls: string[] = [];
    for (const p of data.pages ?? []) if (p.image_signed_url) urls.push(p.image_signed_url);
    for (const e of data.exercises ?? []) if (e.thumbnail_signed_url) urls.push(e.thumbnail_signed_url);
    const schedule =
      (typeof window !== "undefined" && (window as any).requestIdleCallback) ||
      ((cb: () => void) => setTimeout(cb, 1));
    schedule(() => {
      for (const u of urls) {
        const img = new Image();
        img.decoding = "async";
        img.src = u;
      }
    });
  }, [data]);

  return (
    <ClientAppShell allowMissingClientId>
      <div className="space-y-4">
        <div className="pt-1">
          <p className="text-[10px] font-semibold tracking-[0.2em]" style={{ color: "#8A6A3D" }}>
            {eyebrow}
          </p>
          <h1 className="mt-1 text-3xl font-bold leading-tight" style={{ color: "#1F2933" }}>
            {titleFirst} <span style={{ color: "#C9A24A" }}>{titleSecond}</span>
          </h1>
          <p className="mt-1 text-xs" style={{ color: "#6B7280" }}>
            {subtitle}
          </p>
        </div>

        <div className="flex rounded-full border p-1" style={{ borderColor: "#E5D6BD", background: "#FFFFFF" }}>
          <TabButton active={tab === "praticar"} onClick={() => setTab("praticar")} label={s?.practice_tab_label ?? "Praticar"} />
          <TabButton active={tab === "guia"} onClick={() => setTab("guia")} label={s?.guide_tab_label ?? "Guia Completo"} />
        </div>

        {/* Mount both, keep one hidden, to avoid remount/refetch when switching */}
        <div hidden={tab !== "praticar"}>
          <Practice data={data} clientId={data?.resolvedClientId ?? scopeClientId} loading={isLoading} hasClientContext={!!scopeClientId} hasLoadError={isError} />
        </div>
        <div hidden={tab !== "guia"}>
          <Guide data={data} onSkip={() => setTab("praticar")} loading={isLoading} />
        </div>
      </div>
    </ClientAppShell>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 rounded-full py-2 text-sm font-medium transition"
      style={{ background: active ? "#8A6A3D" : "transparent", color: active ? "#FFFFFF" : "#5C4528" }}
    >
      {label}
    </button>
  );
}

function ExerciseSkeleton() {
  return (
    <li
      className="relative flex items-center gap-3 rounded-2xl bg-white p-3 pr-16"
      style={{ border: "1px solid #E5D6BD", minHeight: 76 }}
    >
      <div className="h-12 w-12 shrink-0 animate-pulse rounded-xl" style={{ background: "#F3E8D2" }} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3 w-2/3 animate-pulse rounded" style={{ background: "#F3E8D2" }} />
        <div className="h-2 w-1/2 animate-pulse rounded" style={{ background: "#F3E8D2" }} />
      </div>
    </li>
  );
}

function Practice({
  data,
  clientId,
  loading,
  hasClientContext,
  hasLoadError,
}: {
  data: any;
  clientId: string;
  loading: boolean;
  hasClientContext: boolean;
  hasLoadError: boolean;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const log = useServerFn(logVacuumEvent);
  const [feedback, setFeedback] = useState<string | null>(null);

  const startMut = useMutation({
    mutationFn: () => log({ data: { clientId, eventType: "treino_iniciado" } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vacuum-client-data", clientId] });
    },
    onError: (e: any) => setFeedback(e?.message ?? "Falha ao registrar."),
  });

  async function startProtocol(startIdx = 0) {
    if (!clientId) {
      setFeedback("Não foi possível abrir o exercício. Tente novamente.");
      return;
    }
    try {
      void qc.invalidateQueries({ queryKey: ["vacuum-client-data", clientId], refetchType: "none" }).catch(() => undefined);
      void navigate({ to: "/app/vacuum/treino", search: { clientId, start: startIdx } }).catch(() => {
        setFeedback("Não foi possível abrir o exercício. Tente novamente.");
      });
      startMut.mutate();
    } catch {
      setFeedback("Não foi possível abrir o exercício. Tente novamente.");
    }
  }


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
          <span className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "#C9A24A", color: "#3D2E1C" }}>
            {s?.estimated_time ?? "~10 min"}
          </span>
        </div>
      </div>

      <ul className="space-y-2">
        {!hasClientContext || hasLoadError ? (
          <li className="rounded-2xl bg-white p-4 text-center text-xs" style={{ color: "#6B7280", border: "1px solid #E5D6BD" }}>
            Não foi possível carregar seu treino. Volte ao início e tente novamente.
          </li>
        ) : loading && exercises.length === 0 ? (
          <>
            <ExerciseSkeleton />
            <ExerciseSkeleton />
            <ExerciseSkeleton />
            <ExerciseSkeleton />
            <ExerciseSkeleton />
          </>
        ) : exercises.length === 0 ? (
          <li className="rounded-2xl bg-white p-4 text-center text-xs" style={{ color: "#6B7280", border: "1px solid #E5D6BD" }}>
            Nenhum exercício configurado.
          </li>
        ) : (
          exercises.map((ex: any, i: number) => (
            <li
              key={ex.id}
              className="relative flex items-center gap-3 rounded-2xl bg-white p-3 pr-20"
              style={{ border: "1px solid #E5D6BD", minHeight: 76 }}
            >
              <div
                className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl"
                style={{ background: "#F3E8D2" }}
              >
                {ex.thumbnail_signed_url ? (
                  <img
                    src={ex.thumbnail_signed_url}
                    alt={ex.name}
                    width={48}
                    height={48}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImageIcon className="h-5 w-5" style={{ color: "#8A6A3D" }} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="truncate whitespace-nowrap text-[13px] font-semibold"
                  style={{ color: "#1F2933" }}
                  title={ex.name}
                >
                  {ex.name}
                </p>
                <p className="truncate text-[11px]" style={{ color: "#6B7280" }}>
                  {[ex.short_description, ex.prescription_text].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span
                className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold"
                style={{ background: "#F3E8D2", color: "#8A6A3D" }}
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <button
                type="button"
                onClick={() => startProtocol(i)}
                className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold shadow-sm active:scale-95"
                style={{ background: "#8A6A3D", color: "#FFFFFF", height: 28, minWidth: 62 }}
                aria-label={`Praticar ${ex.name}`}
              >
                <Play className="h-3 w-3" /> Praticar
              </button>
            </li>
          ))
        )}
      </ul>

      {feedback && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm" style={{ background: "#E8F5E9", color: "#1B5E20" }}>
          <CheckCircle2 className="h-4 w-4" /> {feedback}
        </div>
      )}
    </div>
  );
}

function Guide({ data, onSkip, loading }: { data: any; onSkip: () => void; loading: boolean }) {
  const pages = data?.pages ?? [];
  const s = data?.settings;
  const [idx, setIdx] = useState(0);
  const total = pages.length;
  const current = pages[idx];
  const isLast = idx === total - 1;
  const pct = total > 0 ? ((idx + 1) / total) * 100 : 0;

  // Track per-image natural ratio to avoid forcing every page into 3/4.
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const ratio = current?.image_signed_url ? ratios[current.image_signed_url] : undefined;

  // Track which urls have finished loading (for skeleton + button enabling)
  const loadedRef = useRef<Set<string>>(new Set());
  const [, forceRerender] = useState(0);
  const currentLoaded = current?.image_signed_url ? loadedRef.current.has(current.image_signed_url) : false;

  // Preload neighbors aggressively when idx changes
  useEffect(() => {
    const neighbors = [pages[idx + 1]?.image_signed_url, pages[idx - 1]?.image_signed_url].filter(Boolean) as string[];
    for (const u of neighbors) {
      if (loadedRef.current.has(u)) continue;
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        loadedRef.current.add(u);
      };
      img.src = u;
    }
  }, [idx, pages]);

  const containerStyle = useMemo<React.CSSProperties>(() => {
    // Use intrinsic ratio when known; otherwise fall back to a portrait default.
    const ar = ratio && ratio > 0 ? ratio : 3 / 4;
    return { aspectRatio: `${ar}`, background: "#F8F1E6" };
  }, [ratio]);

  if (loading && total === 0) {
    return (
      <div className="space-y-3">
        <div className="h-3 w-1/3 animate-pulse rounded" style={{ background: "#F3E8D2" }} />
        <div className="h-1.5 w-full animate-pulse rounded-full" style={{ background: "#F3E8D2" }} />
        <div className="w-full animate-pulse rounded-2xl" style={{ aspectRatio: "3/4", background: "#F3E8D2" }} />
      </div>
    );
  }

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
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "#C9A24A" }} />
      </div>

      <div className="overflow-hidden rounded-2xl bg-white" style={{ border: "1px solid #E5D6BD" }}>
        <div className="relative grid w-full place-items-center" style={containerStyle}>
          {current?.image_signed_url ? (
            <>
              {!currentLoaded && (
                <div className="absolute inset-0 animate-pulse" style={{ background: "#F3E8D2" }} />
              )}
              <img
                key={current.image_signed_url}
                src={current.image_signed_url}
                alt={current.alt_text || current.title}
                decoding="async"
                fetchPriority="high"
                className="relative h-full w-full object-contain"
                style={{ maxWidth: "100%", height: "auto" }}
                onLoad={(e) => {
                  const el = e.currentTarget;
                  const url = current.image_signed_url as string;
                  loadedRef.current.add(url);
                  if (el.naturalWidth && el.naturalHeight) {
                    const ar = el.naturalWidth / el.naturalHeight;
                    setRatios((r) => (r[url] === ar ? r : { ...r, [url]: ar }));
                  }
                  forceRerender((n) => n + 1);
                }}
              />
            </>
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
            style={{ width: i === idx ? 18 : 8, background: i === idx ? "#C9A24A" : "#E5D6BD" }}
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
