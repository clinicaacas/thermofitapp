import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronLeft,
  Apple,
  FileText,
  Download,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  Archive,
  Copy,
  Library,
} from "lucide-react";
import {
  getNutritionPlansForClient,
  getNutritionPlan,
  createNutritionPlan,
  updateNutritionPlan,
  publishNutritionPlan,
  archiveNutritionPlan,
  duplicateNutritionPlanAsDraft,
  uploadNutritionMainPdf,
  removeNutritionMainPdf,
  listNutritionLibrary,
  attachLibraryMaterialToPlan,
  attachExclusiveMaterialToPlan,
  removeNutritionPlanMaterial,
  updateNutritionPlanMaterial,
  fetchNutritionMaterial,
} from "@/lib/thermofit-nutrition.functions";

export const Route = createFileRoute("/nutricao/cliente/$clientId")({
  head: () => ({ meta: [{ title: "Nutrição da cliente — ThermoFit" }] }),
  component: Page,
});

const STATUS_BG: Record<string, string> = {
  sem_plano: "bg-slate-100 text-slate-600",
  rascunho: "bg-amber-100 text-amber-800",
  publicado: "bg-emerald-100 text-emerald-800",
  arquivado: "bg-zinc-200 text-zinc-700",
};

function classifyEditorError(error: unknown): "not-found" | "permission" | "technical" {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("Cliente não encontrada")) return "not-found";
  if (
    message.includes("fora do seu tenant") ||
    message.includes("sem permissão") ||
    message.includes("sem acesso ativo")
  ) {
    return "permission";
  }
  return "technical";
}

function EditorErrorState({
  kind,
  onRetry,
}: {
  kind: "not-found" | "permission" | "technical";
  onRetry?: () => void;
}) {
  const copy = {
    "not-found": "Cliente não encontrada.",
    permission: "Você não possui permissão para gerenciar o plano nutricional desta cliente.",
    technical: "Não foi possível carregar o plano nutricional agora. Tente novamente.",
  }[kind];

  return (
    <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
      <p>{copy}</p>
      {kind === "technical" && onRetry ? (
        <Button className="mt-4" variant="outline" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}

async function fileToBase64(file: File) {
  const buf = await file.arrayBuffer();
  // chunked to avoid stack overflow on large files
  let s = "";
  const u8 = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    s += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return btoa(s);
}

function Page() {
  const { clientId } = Route.useParams();
  const qc = useQueryClient();
  const getPlans = useServerFn(getNutritionPlansForClient);
  const getPlanFn = useServerFn(getNutritionPlan);

  const {
    data: list,
    isLoading,
    isError: isListError,
    error: listError,
    refetch: refetchList,
  } = useQuery({
    queryKey: ["nutrition-plans", clientId],
    queryFn: () => getPlans({ data: { clientId } }),
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (isListError && import.meta.env.DEV) {
      console.warn("Nutrition editor failed to load client plans", listError);
    }
  }, [isListError, listError]);

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  useEffect(() => {
    if (!list?.plans) return;
    if (selectedPlanId && list.plans.some((p: any) => p.id === selectedPlanId)) return;
    const published = list.plans.find((p: any) => p.status === "publicado");
    const draft = list.plans.find((p: any) => p.status === "rascunho");
    setSelectedPlanId((published ?? draft ?? list.plans[0])?.id ?? null);
  }, [list, selectedPlanId]);

  const {
    data: planData,
    isError: isPlanError,
    error: planError,
    refetch: refetchPlan,
  } = useQuery({
    queryKey: ["nutrition-plan", selectedPlanId],
    queryFn: () => getPlanFn({ data: { planId: selectedPlanId! } }),
    enabled: !!selectedPlanId,
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (isPlanError && import.meta.env.DEV) {
      console.warn("Nutrition editor failed to load selected plan", planError);
    }
  }, [isPlanError, planError]);

  const createMut = useMutation({
    mutationFn: useServerFn(createNutritionPlan),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["nutrition-plans", clientId] });
      setSelectedPlanId(res?.plan?.id ?? null);
    },
  });

  return (
    <AppShell>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <Button asChild variant="ghost" size="sm">
          <Link to="/nutricao">
            <ChevronLeft className="h-4 w-4" /> Voltar
          </Link>
        </Button>
        <span className="text-muted-foreground">·</span>
        <span className="inline-flex items-center gap-1.5">
          <Apple className="h-4 w-4" />
          <span className="font-semibold">{list?.client?.name ?? "Cliente"}</span>
        </span>
      </div>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : isListError ? (
        <EditorErrorState kind={classifyEditorError(listError)} onRetry={() => refetchList()} />
      ) : (
        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          <aside className="space-y-2">
            <Button
              className="w-full"
              onClick={() =>
                createMut.mutate({ data: { clientId, title: "Plano nutricional", generalGuidance: "" } })
              }
            >
              <Plus className="h-4 w-4" /> Novo plano
            </Button>
            <p className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              Histórico
            </p>
            {(!list?.plans || list.plans.length === 0) && (
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BG.sem_plano}`}>
                Sem plano
              </span>
            )}
            <p className="text-xs text-muted-foreground">
              Jornada ativa: {list?.client?.activeJourneyId ? "Configurada" : "Sem jornada ativa"}
            </p>
            <ul className="space-y-1">
              {(list?.plans ?? []).map((p: any) => (
                <li key={p.id}>
                  <button
                    onClick={() => setSelectedPlanId(p.id)}
                    className={[
                      "w-full rounded-md border px-3 py-2 text-left text-xs",
                      selectedPlanId === p.id ? "border-foreground" : "border-transparent hover:border-input",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{p.title}</span>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${STATUS_BG[p.status]}`}>
                        {p.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {new Date(p.updatedAt).toLocaleString("pt-BR")}
                    </p>
                  </button>
                </li>
              ))}
              {(!list?.plans || list.plans.length === 0) && (
                <p className="text-xs text-muted-foreground">Nenhum plano ainda.</p>
              )}
            </ul>
          </aside>

          {isPlanError ? (
            <EditorErrorState kind={classifyEditorError(planError)} onRetry={() => refetchPlan()} />
          ) : planData ? (
            <PlanEditor
              clientId={clientId}
              planId={planData.plan.id}
              plan={planData.plan}
              materials={planData.materials}
              onMutate={() => {
                qc.invalidateQueries({ queryKey: ["nutrition-plan", planData.plan.id] });
                qc.invalidateQueries({ queryKey: ["nutrition-plans", clientId] });
              }}
            />
          ) : (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              Crie um plano para começar.
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

function PlanEditor({
  clientId,
  planId,
  plan,
  materials,
  onMutate,
}: {
  clientId: string;
  planId: string;
  plan: any;
  materials: any[];
  onMutate: () => void;
}) {
  const update = useServerFn(updateNutritionPlan);
  const publish = useServerFn(publishNutritionPlan);
  const archive = useServerFn(archiveNutritionPlan);
  const duplicate = useServerFn(duplicateNutritionPlanAsDraft);
  const upload = useServerFn(uploadNutritionMainPdf);
  const removePdf = useServerFn(removeNutritionMainPdf);
  const attachLib = useServerFn(attachLibraryMaterialToPlan);
  const attachExcl = useServerFn(attachExclusiveMaterialToPlan);
  const removeMat = useServerFn(removeNutritionPlanMaterial);
  const updateMat = useServerFn(updateNutritionPlanMaterial);
  const listLib = useServerFn(listNutritionLibrary);

  const [title, setTitle] = useState(plan.title);
  const [guidance, setGuidance] = useState(plan.generalGuidance ?? "");
  useEffect(() => {
    setTitle(plan.title);
    setGuidance(plan.generalGuidance ?? "");
  }, [plan.id]);

  const [busy, setBusy] = useState<string | null>(null);
  const [showLib, setShowLib] = useState(false);
  const fetchPdf = useServerFn(fetchNutritionMaterial);

  async function downloadPdf(path: string, fallbackName: string) {
    try {
      const res: any = await fetchPdf({ data: { path } });
      const bin = atob(res.base64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const blob = new Blob([arr], { type: res.contentType || "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = res.filename || fallbackName;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      alert(e?.message || "Falha ao baixar PDF.");
    }
  }

  const { data: libData } = useQuery({
    queryKey: ["nutrition-library", "ativo"],
    queryFn: () => listLib({ data: { status: "ativo" } }),
    enabled: showLib,
  });

  async function save() {
    setBusy("save");
    try {
      await update({ data: { planId, title, generalGuidance: guidance } });
      onMutate();
    } finally {
      setBusy(null);
    }
  }

  async function handleMainUpload(file: File) {
    setBusy("upload");
    try {
      const b64 = await fileToBase64(file);
      await upload({
        data: { planId, base64: b64, fileName: file.name, mimeType: file.type || "application/pdf" },
      });
      onMutate();
    } finally {
      setBusy(null);
    }
  }

  async function handleExclusiveUpload(file: File) {
    setBusy("excl");
    try {
      const b64 = await fileToBase64(file);
      await attachExcl({
        data: {
          planId,
          base64: b64,
          fileName: file.name,
          mimeType: file.type || "application/pdf",
          displayTitle: file.name.replace(/\.pdf$/i, ""),
        },
      });
      onMutate();
    } finally {
      setBusy(null);
    }
  }

  const isReadOnly = plan.status === "arquivado";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BG[plan.status]}`}>
          {plan.status}
        </span>
        <div className="flex flex-wrap gap-2">
          {plan.status === "rascunho" && (
            <Button
              size="sm"
              onClick={async () => {
                setBusy("publish");
                try {
                  await publish({ data: { planId } });
                  onMutate();
                } catch (e: any) {
                  alert(e?.message);
                } finally {
                  setBusy(null);
                }
              }}
            >
              <CheckCircle2 className="h-4 w-4" /> Publicar
            </Button>
          )}
          {plan.status !== "arquivado" && (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                if (!confirm("Arquivar este plano?")) return;
                setBusy("archive");
                try {
                  await archive({ data: { planId } });
                  onMutate();
                } finally {
                  setBusy(null);
                }
              }}
            >
              <Archive className="h-4 w-4" /> Arquivar
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              setBusy("dup");
              try {
                await duplicate({ data: { planId } });
                onMutate();
              } finally {
                setBusy(null);
              }
            }}
          >
            <Copy className="h-4 w-4" /> Duplicar como rascunho
          </Button>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <div>
          <Label className="text-xs">Título do plano</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={isReadOnly} />
        </div>
        <div>
          <Label className="text-xs">Orientação geral</Label>
          <Textarea
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
            rows={5}
            disabled={isReadOnly}
          />
        </div>
        <Button onClick={save} disabled={busy === "save" || isReadOnly}>
          {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar rascunho
        </Button>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <p className="text-sm font-semibold">PDF principal do plano</p>
        {plan.mainPdfPath ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setViewer({ path: plan.mainPdfPath, title: plan.title })}
            >
              <Eye className="h-4 w-4" /> Visualizar
            </Button>
            {!isReadOnly && (
              <>
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleMainUpload(f);
                      e.currentTarget.value = "";
                    }}
                  />
                  Substituir PDF
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm("Remover PDF principal?")) return;
                    await removePdf({ data: { planId } });
                    onMutate();
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Remover
                </Button>
              </>
            )}
          </div>
        ) : (
          !isReadOnly && (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-4 py-3 text-sm hover:bg-muted">
              <FileText className="h-4 w-4" />
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleMainUpload(f);
                  e.currentTarget.value = "";
                }}
              />
              Enviar PDF principal (até 15MB)
            </label>
          )
        )}
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Materiais do plano</p>
          {!isReadOnly && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowLib((v) => !v)}>
                <Library className="h-4 w-4" /> Biblioteca
              </Button>
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleExclusiveUpload(f);
                    e.currentTarget.value = "";
                  }}
                />
                <Plus className="h-4 w-4" /> PDF exclusivo
              </label>
            </div>
          )}
        </div>

        {showLib && (
          <div className="rounded-md border bg-muted/30 p-2">
            <p className="mb-1 text-xs font-medium">Selecione um material da biblioteca:</p>
            <ul className="max-h-48 space-y-1 overflow-auto">
              {(libData?.items ?? []).map((m: any) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between rounded border bg-background px-2 py-1.5 text-xs"
                >
                  <div>
                    <p className="font-medium">{m.title}</p>
                    <p className="text-[10px] uppercase text-muted-foreground">{m.category}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await attachLib({ data: { planId, libraryMaterialId: m.id } });
                      onMutate();
                      setShowLib(false);
                    }}
                  >
                    Vincular
                  </Button>
                </li>
              ))}
              {(!libData?.items || libData.items.length === 0) && (
                <p className="text-xs text-muted-foreground">
                  Nenhum material ativo. Cadastre um na aba Biblioteca.
                </p>
              )}
            </ul>
          </div>
        )}

        {materials.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum material vinculado.</p>
        ) : (
          <ul className="space-y-2">
            {materials.map((m: any) => {
              const path = m.origin === "exclusivo" ? m.storagePath : m.library?.storagePath;
              const title =
                m.displayTitle ||
                m.library?.title ||
                (m.origin === "exclusivo" ? "Material personalizado" : "Material");
              return (
                <li key={m.id} className="rounded-md border p-2 text-sm">
                  <div className="flex items-start gap-2">
                    <div className="grid h-8 w-8 place-items-center rounded bg-emerald-50 text-emerald-700">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{title}</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {m.origin === "exclusivo" ? "Material exclusivo" : `Biblioteca · ${m.library?.category ?? ""}`}
                      </p>
                      {!isReadOnly && (
                        <input
                          defaultValue={m.displayTitle ?? ""}
                          placeholder="Título exibido para a cliente"
                          className="mt-1 w-full rounded border bg-transparent px-2 py-1 text-xs"
                          onBlur={(e) => {
                            if ((e.target.value || null) !== (m.displayTitle ?? null)) {
                              updateMat({
                                data: { planMaterialId: m.id, displayTitle: e.target.value || null },
                              }).then(onMutate);
                            }
                          }}
                        />
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {path && (
                        <Button size="sm" variant="outline" onClick={() => setViewer({ path, title })}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {!isReadOnly && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            if (!confirm("Remover material deste plano?")) return;
                            await removeMat({ data: { planMaterialId: m.id } });
                            onMutate();
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <NutritionPlanPdfViewer
        open={!!viewer}
        path={viewer?.path ?? null}
        title={viewer?.title ?? plan.title}
        onClose={() => setViewer(null)}
      />
    </div>
  );
}
