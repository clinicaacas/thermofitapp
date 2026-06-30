import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dumbbell, FileText, Download, Sparkles, Video } from "lucide-react";
import { ClientAppShell } from "@/components/client-app-shell";
import { getClientWorkoutPlan } from "@/lib/thermofit-client-app.functions";
import { fetchWorkoutMaterial } from "@/lib/thermofit-workout-plans.functions";
import { useClientIdentity, useVideoCacheGuard } from "@/hooks/use-client-identity";

export const Route = createFileRoute("/app/treino")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

function formatDate(iso?: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return "";
  }
}

function Page() {
  const { clientId } = useSearch({ from: "/app/treino" });
  const identity = useClientIdentity(clientId);
  useVideoCacheGuard(identity);

  const fetchPlan = useServerFn(getClientWorkoutPlan);
  const { data, isLoading } = useQuery({
    queryKey: [
      "client-workout-plan",
      identity?.tenantId ?? null,
      identity?.clientId ?? clientId,
      identity?.journeyId ?? null,
    ],
    queryFn: () => fetchPlan({ data: { clientId } }),
    enabled: !!clientId && !!identity,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const plan = data?.plan;
  const fetchBytes = useServerFn(fetchWorkoutMaterial);
  const [viewer, setViewer] = useState<{ path: string; title: string } | null>(null);

  function openViewer(path: string, title: string) {
    setViewer({ path, title });
  }

  async function downloadMaterial(path: string) {
    try {
      const res: any = await fetchBytes({ data: { path } });
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: res.contentType || "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename || "material.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      alert(e?.message || "Não foi possível baixar o material.");
    }
  }


  return (
    <>
    <ClientAppShell title="Treino" subtitle="Seu plano personalizado">
      {isLoading || !identity ? (
        <p className="text-sm" style={{ color: "#6B7280" }}>Carregando…</p>
      ) : !plan ? (
        <EmptyState />
      ) : (
        <>
          <section className="rounded-2xl bg-white p-4" style={{ border: "1px solid #E5E0D8" }}>
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "#F3E8D2" }}>
                <Dumbbell className="h-4 w-4" style={{ color: "#8A6A3D" }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold tracking-wider" style={{ color: "#8A6A3D" }}>
                  PLANO PUBLICADO
                </p>
                <p className="text-base font-semibold" style={{ color: "#1F2933" }}>
                  {plan.title}
                </p>
                {plan.publishedAt && (
                  <p className="text-[11px]" style={{ color: "#6B7280" }}>
                    Atualizado em {formatDate(plan.updatedAt ?? plan.publishedAt)}
                  </p>
                )}
              </div>
            </div>
            {plan.description && (
              <p className="mt-3 whitespace-pre-line text-xs leading-relaxed" style={{ color: "#4B5563" }}>
                {plan.description}
              </p>
            )}
            {plan.pdfPath && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => openViewer(plan.pdfPath!, plan.title)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
                  style={{ background: "#8A6A3D", color: "#FFFFFF" }}
                >
                  <Eye className="h-3.5 w-3.5" /> Ver plano
                </button>
                <button
                  onClick={() => downloadMaterial(plan.pdfPath!)}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs"
                  style={{ borderColor: "#E5E0D8", color: "#8A6A3D" }}
                >
                  <Download className="h-3.5 w-3.5" /> Baixar PDF
                </button>
              </div>
            )}
          </section>

          {plan.exercises.length > 0 && (
            <>
              <p className="mt-5 text-[10px] font-semibold tracking-wider" style={{ color: "#6B7280" }}>
                EXERCÍCIOS
              </p>
              <section className="mt-2 space-y-2">
                {plan.exercises.map((ex) => {
                  const sets = ex.sets ?? ex.defaultSets;
                  const reps = (ex.reps && ex.reps.length > 0 ? ex.reps : ex.defaultReps) ?? null;
                  return (
                    <article
                      key={ex.id}
                      className="rounded-2xl bg-white p-3"
                      style={{ border: "1px solid #E5E0D8" }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold" style={{ color: "#1F2933" }}>
                            {ex.title}
                          </p>
                          <p className="text-[11px]" style={{ color: "#6B7280" }}>
                            {[ex.muscleGroup, ex.equipment].filter(Boolean).join(" · ") || "—"}
                          </p>
                        </div>
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold"
                          style={
                            ex.customized
                              ? { background: "#ECFDF5", color: "#047857" }
                              : { background: "#F3E8D2", color: "#8A6A3D" }
                          }
                        >
                          {ex.customized ? (
                            <span className="inline-flex items-center gap-1">
                              <Sparkles className="h-2.5 w-2.5" /> Personalizado para você
                            </span>
                          ) : (
                            "Configuração da Biblioteca"
                          )}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px]" style={{ color: "#4B5563" }}>
                        {[sets ? `${sets} séries` : null, reps ? `${reps} reps` : null]
                          .filter(Boolean)
                          .join(" · ") || "Sem prescrição definida"}
                      </p>
                      {ex.notes && (
                        <p className="mt-1 text-[11px] italic" style={{ color: "#8A6A3D" }}>
                          {ex.notes}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {ex.videoUrl && (
                          <a
                            href={ex.videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]"
                            style={{ borderColor: "#E5E0D8", color: "#8A6A3D" }}
                          >
                            <Video className="h-3 w-3" /> Vídeo
                          </a>
                        )}
                        {ex.pdfPath ? (
                          <button
                            onClick={() => openViewer(ex.pdfPath!, ex.title)}
                            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]"
                            style={{ borderColor: "#A7F3D0", background: "#ECFDF5", color: "#047857" }}
                          >
                            <FileText className="h-3 w-3" /> Material personalizado
                          </button>
                        ) : ex.baseExercisePdfPath ? (
                          <button
                            onClick={() => openViewer(ex.baseExercisePdfPath!, ex.title)}
                            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]"
                            style={{ borderColor: "#E5E0D8", color: "#8A6A3D" }}
                          >
                            <FileText className="h-3 w-3" /> Material do exercício
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </section>
            </>
          )}
        </>
      )}
    </ClientAppShell>
      <WorkoutPlanPdfViewer
        open={!!viewer}
        path={viewer?.path ?? null}
        title={viewer?.title ?? "Material"}
        onClose={() => setViewer(null)}
      />
    </>
  );
}

function EmptyState() {
  return (
    <section
      className="rounded-2xl bg-white p-6 text-center"
      style={{ border: "1px solid #E5E0D8" }}
    >
      <div
        className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl"
        style={{ background: "#F3E8D2" }}
      >
        <Dumbbell className="h-6 w-6" style={{ color: "#8A6A3D" }} />
      </div>
      <p className="text-sm font-semibold" style={{ color: "#1F2933" }}>
        Seu plano de treino está sendo preparado.
      </p>
      <p className="mt-1 text-xs" style={{ color: "#6B7280" }}>
        Assim que sua equipe publicar as orientações, elas aparecerão aqui.
      </p>
    </section>
  );
}
