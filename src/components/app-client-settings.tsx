import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";
import {
  getAppSettings,
  saveAppSettings,
  saveAppModules,
  saveQuickTopics,
} from "@/lib/thermofit-app-settings.functions";
import { listSupportTopicsAdmin, saveSupportTopics } from "@/lib/thermofit-support.functions";
import { AdminVacuumSettings } from "@/components/admin-vacuum-settings";

export function AppClientSettingsTab() {
  const fetchAll = useServerFn(getAppSettings);
  const saveS = useServerFn(saveAppSettings);
  const saveM = useServerFn(saveAppModules);
  const saveT = useServerFn(saveQuickTopics);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => fetchAll(),
  });

  const [form, setForm] = useState({
    app_name: "",
    app_subtitle: "",
    welcome_text: "",
    primary_color: "#5b6cff",
    accent_color: "#7c83ff",
  });
  const [modules, setModules] = useState<{ key: string; label: string; enabled: boolean }[]>([]);
  const [topics, setTopics] = useState<{ key: string; label: string; creates_alert: boolean }[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setForm({
      app_name: data.settings.app_name ?? "",
      app_subtitle: data.settings.app_subtitle ?? "",
      welcome_text: data.settings.welcome_text ?? "",
      primary_color: data.settings.primary_color ?? "#5b6cff",
      accent_color: data.settings.accent_color ?? "#7c83ff",
    });
    setModules(data.modules);
    setTopics(data.quickTopics);
  }, [data]);

  const saveAll = useMutation({
    mutationFn: async () => {
      await saveS({ data: form });
      await saveM({ data: { modules: modules.map((m) => ({ key: m.key, label: m.label, enabled: m.enabled })) } });
      await saveT({ data: { topics } });
    },
    onSuccess: () => {
      setStatus("Configurações salvas.");
      qc.invalidateQueries({ queryKey: ["app-settings"] });
    },
    onError: (e: any) => setStatus(e?.message ?? "Falha ao salvar."),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Identidade do app</CardTitle>
          <CardDescription>Nome, subtítulo, cores e mensagem de boas-vindas vistas pela cliente.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Nome do app</Label>
            <Input value={form.app_name} onChange={(e) => setForm((f) => ({ ...f, app_name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Subtítulo</Label>
            <Input value={form.app_subtitle} onChange={(e) => setForm((f) => ({ ...f, app_subtitle: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Cor primária</Label>
            <Input type="color" value={form.primary_color} onChange={(e) => setForm((f) => ({ ...f, primary_color: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Cor de destaque</Label>
            <Input type="color" value={form.accent_color} onChange={(e) => setForm((f) => ({ ...f, accent_color: e.target.value }))} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Boas-vindas</Label>
            <Textarea rows={3} value={form.welcome_text} onChange={(e) => setForm((f) => ({ ...f, welcome_text: e.target.value }))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Módulos do app</CardTitle>
          <CardDescription>Ative ou desative o que aparece para a cliente.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {modules.map((m, idx) => (
            <div key={m.key} className="flex items-center gap-3 rounded-md border p-3">
              <Input
                value={m.label}
                onChange={(e) =>
                  setModules((prev) => prev.map((p, i) => (i === idx ? { ...p, label: e.target.value } : p)))
                }
                className="h-8 flex-1"
                placeholder={m.key}
              />
              <Switch
                checked={m.enabled}
                onCheckedChange={(v) =>
                  setModules((prev) => prev.map((p, i) => (i === idx ? { ...p, enabled: v } : p)))
                }
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <SupportTopicsCard />

      <AdminVacuumSettings />



      <div className="flex items-center justify-end gap-3">
        {status && <span className="text-xs text-muted-foreground">{status}</span>}
        <Button onClick={() => saveAll.mutate()} disabled={saveAll.isPending}>
          {saveAll.isPending ? "Salvando…" : "Salvar configurações"}
        </Button>
      </div>
    </div>
  );
}

function SupportTopicsCard() {
  const fetchTopics = useServerFn(listSupportTopicsAdmin);
  const saveFn = useServerFn(saveSupportTopics);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["support-topics-admin"],
    queryFn: () => fetchTopics(),
  });
  const [topics, setTopics] = useState<
    { id?: string; title: string; active: boolean; sort_order: number }[]
  >([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setTopics(
      data.topics.map((t: any) => ({
        id: t.id,
        title: t.title,
        active: t.active,
        sort_order: t.sort_order,
      })),
    );
    setDeletedIds([]);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = topics.map((t, i) => ({ ...t, sort_order: i }));
      return saveFn({ data: { topics: payload, deletedIds } });
    },
    onSuccess: () => {
      setStatus("Assuntos do suporte salvos.");
      qc.invalidateQueries({ queryKey: ["support-topics-admin"] });
      qc.invalidateQueries({ queryKey: ["support-topics-client"] });
    },
    onError: (e: any) => setStatus(e?.message ?? "Falha ao salvar."),
  });

  function move(i: number, dir: -1 | 1) {
    setTopics((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Suporte — Assuntos rápidos</CardTitle>
        <CardDescription>
          Assuntos que aparecem como opção quando a cliente abre uma solicitação de suporte no app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {topics.map((t, idx) => (
          <div key={idx} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[2fr_auto_auto_auto_auto]">
            <Input
              placeholder="Título do assunto"
              value={t.title}
              onChange={(e) =>
                setTopics((p) => p.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)))
              }
            />
            <label className="flex items-center gap-2 text-xs">
              <Switch
                checked={t.active}
                onCheckedChange={(v) =>
                  setTopics((p) => p.map((x, i) => (i === idx ? { ...x, active: v } : x)))
                }
              />
              Ativo
            </label>
            <Button variant="ghost" size="icon" onClick={() => move(idx, -1)} title="Subir">
              ↑
            </Button>
            <Button variant="ghost" size="icon" onClick={() => move(idx, 1)} title="Descer">
              ↓
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setTopics((p) => p.filter((_, i) => i !== idx));
                if (t.id) setDeletedIds((d) => [...d, t.id!]);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setTopics((p) => [...p, { title: "", active: true, sort_order: p.length }])
            }
          >
            <Plus className="h-4 w-4" /> Adicionar assunto
          </Button>
          <div className="flex items-center gap-3">
            {status && <span className="text-xs text-muted-foreground">{status}</span>}
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Salvando…" : "Salvar assuntos"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
