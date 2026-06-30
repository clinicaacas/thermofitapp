import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Apple, Search, FileText, Archive, RefreshCw, Plus, ExternalLink, Download, Loader2 } from "lucide-react";
import {
  listNutritionClientsOverview,
  listNutritionLibrary,
  createNutritionLibraryMaterial,
  updateNutritionLibraryMaterial,
  archiveNutritionLibraryMaterial,
  uploadNutritionLibraryPdf,
  fetchNutritionMaterial,
} from "@/lib/thermofit-nutrition.functions";

export const Route = createFileRoute("/nutricao/")({
  head: () => ({ meta: [{ title: "Nutrição — ThermoFit" }] }),
  component: Page,
});

const STATUS_LABEL: Record<string, string> = {
  sem_plano: "Sem plano",
  rascunho: "Rascunho",
  publicado: "Publicado",
  arquivado: "Arquivado",
};
const STATUS_BG: Record<string, string> = {
  sem_plano: "bg-slate-100 text-slate-600",
  rascunho: "bg-amber-100 text-amber-800",
  publicado: "bg-emerald-100 text-emerald-800",
  arquivado: "bg-zinc-200 text-zinc-700",
};

function Page() {
  return (
    <AppShell>
      <div className="mb-4 flex items-center gap-2">
        <Apple className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Nutrição</h1>
      </div>
      <Tabs defaultValue="planos">
        <TabsList>
          <TabsTrigger value="planos">Planos das clientes</TabsTrigger>
          <TabsTrigger value="biblioteca">Biblioteca de materiais</TabsTrigger>
        </TabsList>
        <TabsContent value="planos" className="mt-4">
          <ClientsTab />
        </TabsContent>
        <TabsContent value="biblioteca" className="mt-4">
          <LibraryTab />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function ClientsTab() {
  const fetch = useServerFn(listNutritionClientsOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["nutrition-clients-overview"],
    queryFn: () => fetch(),
    staleTime: 0,
  });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("todos");

  const rows = useMemo(() => {
    const all = (data?.rows ?? []) as any[];
    return all.filter((r) => {
      if (status !== "todos" && r.planStatus !== status) return false;
      if (q && !r.clientName.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [data, q, status]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="todos">Todos os status</option>
          <option value="sem_plano">Sem plano</option>
          <option value="rascunho">Rascunho</option>
          <option value="publicado">Publicado</option>
          <option value="arquivado">Arquivado</option>
        </select>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-muted-foreground">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nenhuma cliente encontrada com esses filtros.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Cliente</th>
                <th className="px-3 py-2 text-left">Plano atual</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Atualização</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.clientId} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.clientName}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.plan?.title ?? <span className="italic">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BG[r.planStatus]}`}>
                      {STATUS_LABEL[r.planStatus]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {r.plan?.updatedAt ? new Date(r.plan.updatedAt).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link to="/nutricao/cliente/$clientId" params={{ clientId: r.clientId }}>
                        {r.plan ? "Gerenciar" : "Criar plano"}
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LibraryTab() {
  const qc = useQueryClient();
  const fetch = useServerFn(listNutritionLibrary);
  const create = useServerFn(createNutritionLibraryMaterial);
  const update = useServerFn(updateNutritionLibraryMaterial);
  const archive = useServerFn(archiveNutritionLibraryMaterial);
  const upload = useServerFn(uploadNutritionLibraryPdf);

  const [status, setStatus] = useState<"ativo" | "arquivado" | "todos">("ativo");
  const { data, isLoading } = useQuery({
    queryKey: ["nutrition-library", status],
    queryFn: () => fetch({ data: { status } }),
    staleTime: 0,
  });

  const [editing, setEditing] = useState<any | null>(null);
  const [viewer, setViewer] = useState<{ path: string; title: string } | null>(null);
  const [form, setForm] = useState({ title: "", category: "receitas", description: "" });

  const createMut = useMutation({
    mutationFn: () => create({ data: form }),
    onSuccess: () => {
      setForm({ title: "", category: "receitas", description: "" });
      qc.invalidateQueries({ queryKey: ["nutrition-library"] });
    },
  });

  const archiveMut = useMutation({
    mutationFn: (vars: { id: string; status: "ativo" | "arquivado" }) =>
      archive({ data: { materialId: vars.id, status: vars.status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nutrition-library"] }),
  });

  async function handleUpload(materialId: string, file: File) {
    const buf = await file.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    await upload({
      data: { materialId, base64: b64, fileName: file.name, mimeType: file.type || "application/pdf" },
    });
    qc.invalidateQueries({ queryKey: ["nutrition-library"] });
  }

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="ativo">Ativos</option>
            <option value="arquivado">Arquivados</option>
            <option value="todos">Todos</option>
          </select>
        </div>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (data?.items ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            Nenhum material nesta lista.
          </div>
        ) : (
          <ul className="space-y-2">
            {(data?.items ?? []).map((m: any) => (
              <li key={m.id} className="rounded-lg border p-3">
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-md bg-emerald-50 text-emerald-700">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{m.title}</p>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {m.category}
                    </p>
                    {m.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{m.description}</p>
                    )}
                    {!m.storagePath && (
                      <p className="mt-1 text-[11px] text-amber-700">Sem PDF anexado.</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 text-xs">
                    {m.storagePath && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setViewer({ path: m.storagePath, title: m.title })}
                      >
                        <Eye className="h-3.5 w-3.5" /> Visualizar
                      </Button>
                    )}
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted">
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUpload(m.id, f);
                          e.currentTarget.value = "";
                        }}
                      />
                      {m.storagePath ? "Substituir PDF" : "Enviar PDF"}
                    </label>
                    {m.status === "ativo" ? (
                      <button
                        onClick={() => archiveMut.mutate({ id: m.id, status: "arquivado" })}
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                      >
                        <Archive className="h-3 w-3" /> Arquivar
                      </button>
                    ) : (
                      <button
                        onClick={() => archiveMut.mutate({ id: m.id, status: "ativo" })}
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                      >
                        <RefreshCw className="h-3 w-3" /> Restaurar
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <aside className="rounded-lg border p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Plus className="h-4 w-4" /> Novo material
        </p>
        <div className="space-y-2">
          <div>
            <Label className="text-xs">Título</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
            />
          </div>
          <div>
            <Label className="text-xs">Categoria</Label>
            <select
              value={form.category}
              onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="receitas">Receitas</option>
              <option value="guia-de-compras">Guia de compras</option>
              <option value="substituicoes">Substituições</option>
              <option value="educacao-alimentar">Educação alimentar</option>
              <option value="pre-procedimento">Pré-procedimento</option>
              <option value="pos-procedimento">Pós-procedimento</option>
              <option value="hidratacao">Hidratação</option>
              <option value="outros">Outros</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">Descrição curta</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
            />
          </div>
          <Button
            className="w-full"
            disabled={!form.title.trim() || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            Criar material
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Após criar, envie o PDF no card correspondente da lista.
          </p>
        </div>
      </aside>

      <NutritionPlanPdfViewer
        open={!!viewer}
        path={viewer?.path ?? null}
        title={viewer?.title ?? ""}
        onClose={() => setViewer(null)}
      />
    </div>
  );
}
