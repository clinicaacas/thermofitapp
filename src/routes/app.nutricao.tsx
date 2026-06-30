import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Apple, FileText, Download, Loader2, AlertCircle } from "lucide-react";
import { ClientAppShell } from "@/components/client-app-shell";
import { useClientIdentity } from "@/hooks/use-client-identity";
import { supabase } from "@/integrations/supabase/client";
import {
  getClientNutritionPlanForApp,
  fetchNutritionMaterial,
} from "@/lib/thermofit-nutrition.functions";
import { NutritionPlanPdfViewer } from "@/components/nutrition-plan-pdf-viewer";

export const Route = createFileRoute("/app/nutricao")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

type PlanMaterial = {
  id: string;
  origin: "exclusivo" | "biblioteca";
  storagePath: string | null;
  displayTitle: string | null;
  note: string | null;
  library: {
    id: string;
    title: string;
    category: string;
    description: string;
    storagePath: string | null;
  } | null;
};

function fmtDate(iso?: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return "";
  }
}

function Page() {
  const { clientId } = useSearch({ from: "/app/nutricao" });
  const identity = useClientIdentity(clientId);
  const fetchPlan = useServerFn(getClientNutritionPlanForApp);
  const fetchMaterial = useServerFn(fetchNutritionMaterial);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: [
      "client-nutrition",
      identity?.tenantId ?? null,
      clientId,
      identity?.journeyId ?? null,
    ],
    queryFn: () => fetchPlan({ data: { clientId } }),
    enabled: !!clientId && !!identity,
    staleTime: 0,
  });

  // Realtime invalidation
  useEffect(() => {
    if (!clientId) return;
    const ch = supabase
      .channel(`nut:${clientId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "nutrition_plans", filter: `client_id=eq.${clientId}` },
        () => qc.invalidateQueries({ queryKey: ["client-nutrition"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "nutrition_plan_materials" },
        () => qc.invalidateQueries({ queryKey: ["client-nutrition"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [clientId, qc]);

  const [viewer, setViewer] = useState<{ path: string; title: string } | null>(null);

  async function downloadPath(path: string, fallbackName: string) {
    const res = await fetchMaterial({ data: { path } });
    const bin = atob(res.base64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const blob = new Blob([arr], { type: res.contentType || "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = res.filename || fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const plan = data?.plan;
  const materials = (data?.materials ?? []) as PlanMaterial[];

  return (
    <ClientAppShell title="Nutrição" subtitle="Seu plano alimentar personalizado">
      {isLoading ? (
        <div className="grid place-items-center py-10 text-[#6B7280]">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !plan ? (
        <section
          className="rounded-2xl bg-white p-6 text-center"
          style={{ border: "1px solid #E5E0D8" }}
        >
          <div
            className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl"
            style={{ background: "#F3E8D2" }}
          >
            <Apple className="h-6 w-6" style={{ color: "#8A6A3D" }} />
          </div>
          <p className="text-sm font-semibold" style={{ color: "#1F2933" }}>
            Seu plano alimentar está sendo preparado.
          </p>
          <p className="mt-1 text-xs" style={{ color: "#6B7280" }}>
            Assim que sua nutricionista publicar as orientações, elas aparecerão aqui.
          </p>
        </section>
      ) : (
        <>
          <section
            className="rounded-2xl bg-white p-4"
            style={{ border: "1px solid #E5E0D8" }}
          >
            <div className="flex items-start gap-3">
              <div
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                style={{ background: "#F3E8D2" }}
              >
                <Apple className="h-4 w-4" style={{ color: "#8A6A3D" }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold tracking-wider" style={{ color: "#8A6A3D" }}>
                  PLANO PUBLICADO
                </p>
                <p className="text-base font-semibold" style={{ color: "#1F2933" }}>
                  {plan.title}
                </p>
                <p className="mt-0.5 text-[11px]" style={{ color: "#6B7280" }}>
                  Última atualização: {fmtDate(plan.updatedAt)}
                </p>
              </div>
            </div>
            {plan.generalGuidance && (
              <p
                className="mt-3 whitespace-pre-line text-xs"
                style={{ color: "#4B5563" }}
              >
                {plan.generalGuidance}
              </p>
            )}
            {plan.mainPdfPath && (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() =>
                    setViewer({ path: plan.mainPdfPath!, title: plan.title })
                  }
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#1F2933] px-3 py-2 text-xs font-semibold text-white"
                >
                  <FileText className="h-3.5 w-3.5" /> Ver plano
                </button>
                <button
                  onClick={() => downloadPath(plan.mainPdfPath!, "plano-alimentar.pdf")}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#E5E0D8] bg-white px-3 py-2 text-xs font-semibold"
                  style={{ color: "#1F2933" }}
                >
                  <Download className="h-3.5 w-3.5" /> Baixar PDF
                </button>
              </div>
            )}
          </section>

          <p className="mt-5 text-[10px] font-semibold tracking-wider" style={{ color: "#6B7280" }}>
            MATERIAIS DE APOIO
          </p>
          <section className="mt-2 space-y-2">
            {materials.length === 0 ? (
              <p
                className="rounded-2xl bg-white p-4 text-xs"
                style={{ border: "1px solid #E5E0D8", color: "#6B7280" }}
              >
                Nenhum material adicional por enquanto.
              </p>
            ) : (
              materials.map((m) => {
                const title =
                  m.displayTitle ||
                  m.library?.title ||
                  (m.origin === "exclusivo" ? "Material personalizado" : "Material");
                const path = m.origin === "exclusivo" ? m.storagePath : m.library?.storagePath;
                const category = m.library?.category;
                const description = m.library?.description;
                return (
                  <div
                    key={m.id}
                    className="rounded-2xl bg-white p-3"
                    style={{ border: "1px solid #E5E0D8" }}
                  >
                    <p className="text-sm font-semibold" style={{ color: "#1F2933" }}>
                      {title}
                    </p>
                    {category && (
                      <p className="mt-0.5 text-[10px] uppercase tracking-wider" style={{ color: "#8A6A3D" }}>
                        {category}
                      </p>
                    )}
                    {description && (
                      <p className="mt-1 text-xs" style={{ color: "#4B5563" }}>
                        {description}
                      </p>
                    )}
                    {m.note && (
                      <p className="mt-1 text-[11px] italic" style={{ color: "#6B7280" }}>
                        {m.note}
                      </p>
                    )}
                    {path ? (
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => setViewer({ path, title })}
                          className="inline-flex items-center gap-1.5 rounded-md bg-[#1F2933] px-2.5 py-1.5 text-[11px] font-semibold text-white"
                        >
                          <FileText className="h-3 w-3" /> Ver material
                        </button>
                        <button
                          onClick={() => downloadPath(path, `${title}.pdf`)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[#E5E0D8] bg-white px-2.5 py-1.5 text-[11px] font-semibold"
                          style={{ color: "#1F2933" }}
                        >
                          <Download className="h-3 w-3" /> Baixar
                        </button>
                      </div>
                    ) : (
                      <p className="mt-2 inline-flex items-center gap-1 text-[11px]" style={{ color: "#6B7280" }}>
                        <AlertCircle className="h-3 w-3" /> PDF ainda não disponível.
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </section>
        </>
      )}

      <NutritionPlanPdfViewer
        open={!!viewer}
        path={viewer?.path ?? null}
        title={viewer?.title ?? "Plano alimentar"}
        onClose={() => setViewer(null)}
      />
    </ClientAppShell>
  );
}
