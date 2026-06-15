import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listClients } from "@/lib/thermofit-data.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCw, Smartphone } from "lucide-react";

const SCREENS = [
  { path: "/app", label: "Início" },
  { path: "/app/videos", label: "Vídeos" },
  { path: "/app/agua", label: "Hidratação" },
  { path: "/app/premios", label: "Prêmios" },
  { path: "/app/falar", label: "Falar com a equipe" },
  { path: "/app/fotos", label: "Fotos" },
  { path: "/app/pulso", label: "Pulso" },
  { path: "/app/passaporte", label: "Passaporte" },
  { path: "/app/privacidade", label: "Privacidade" },
];

export function ClientAppPreviewTab() {
  const fetchClients = useServerFn(listClients);
  const { data, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: () => fetchClients(),
  });
  const clients = data?.clients ?? [];

  const [clientId, setClientId] = useState<string>("");
  const [screen, setScreen] = useState<string>("/app");
  const [reloadKey, setReloadKey] = useState(0);

  const src = useMemo(() => {
    if (!clientId) return "";
    return `${screen}?clientId=${clientId}`;
  }, [clientId, screen]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="h-4 w-4" /> Preview do App da Cliente
        </CardTitle>
        <CardDescription>
          Veja como o app aparece para uma cliente real. As alterações feitas no painel se refletem aqui ao salvar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Cliente</label>
              <Select value={clientId} onValueChange={setClientId} disabled={isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={isLoading ? "Carregando…" : "Selecione uma cliente"} />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Tela</label>
              <Select value={screen} onValueChange={setScreen}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCREENS.map((s) => (
                    <SelectItem key={s.path} value={s.path}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setReloadKey((k) => k + 1)}
              disabled={!clientId}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Recarregar preview
            </Button>

            {clientId && (
              <a
                href={src}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Abrir em nova aba
              </a>
            )}

            {!clientId && clients.length === 0 && !isLoading && (
              <p className="text-xs text-muted-foreground">
                Cadastre uma cliente em <strong>Clientes → Nova cliente</strong> para abrir o preview.
              </p>
            )}
          </div>

          <div className="flex justify-center">
            <div className="relative h-[720px] w-[360px] overflow-hidden rounded-[2.5rem] border-[10px] border-slate-800 bg-slate-800 shadow-xl">
              <div className="absolute left-1/2 top-2 z-10 h-4 w-24 -translate-x-1/2 rounded-full bg-slate-900" />
              {src ? (
                <iframe
                  key={`${src}-${reloadKey}`}
                  src={src}
                  title="Preview do app"
                  className="h-full w-full rounded-[2rem] bg-white"
                />
              ) : (
                <div className="grid h-full w-full place-items-center rounded-[2rem] bg-white p-6 text-center text-sm text-slate-500">
                  Selecione uma cliente para visualizar o app.
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
