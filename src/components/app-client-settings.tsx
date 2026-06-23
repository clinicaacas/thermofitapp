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
            <div key={m.key} className="flex items-center justify-between rounded-md border p-3">
              <span className="text-sm">{m.label}</span>
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

      <Card>
        <CardHeader>
          <CardTitle>Botões rápidos — Falar com a equipe</CardTitle>
          <CardDescription>Botões que aparecem na tela de mensagens. Marque "alerta" para gerar alerta de alta prioridade.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {topics.map((t, idx) => (
            <div key={idx} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_2fr_auto_auto]">
              <Input
                placeholder="chave"
                value={t.key}
                onChange={(e) =>
                  setTopics((p) => p.map((x, i) => (i === idx ? { ...x, key: e.target.value } : x)))
                }
              />
              <Input
                placeholder="Texto do botão"
                value={t.label}
                onChange={(e) =>
                  setTopics((p) => p.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))
                }
              />
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={t.creates_alert}
                  onCheckedChange={(v) =>
                    setTopics((p) => p.map((x, i) => (i === idx ? { ...x, creates_alert: !!v } : x)))
                  }
                />
                Gera alerta
              </label>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTopics((p) => p.filter((_, i) => i !== idx))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setTopics((p) => [...p, { key: `botao_${p.length + 1}`, label: "", creates_alert: false }])
            }
          >
            <Plus className="h-4 w-4" /> Adicionar botão
          </Button>
        </CardContent>
      </Card>

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
