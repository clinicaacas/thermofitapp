import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { lgpdOverview } from "@/lib/thermofit-reports.functions";
import { Shield, FileText, Check, X } from "lucide-react";

export const Route = createFileRoute("/lgpd")({
  head: () => ({ meta: [{ title: "LGPD — ThermoFit" }] }),
  component: Page,
});

function Page() {
  const fetchOverview = useServerFn(lgpdOverview);
  const { data, isLoading } = useQuery({ queryKey: ["lgpd"], queryFn: () => fetchOverview() });

  const consents = data?.consents ?? [];
  const logs = data?.logs ?? [];

  return (
    <AppShell>
      <div className="space-y-8">
        <header>
          <h1 className="text-2xl font-semibold text-foreground">LGPD</h1>
          <p className="text-sm text-muted-foreground">
            Consentimentos das clientes e trilha de auditoria.
          </p>
        </header>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Shield className="h-4 w-4" /> Consentimentos ({consents.length})
          </h2>
          {consents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Nenhum consentimento registrado.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Termos</th>
                    <th className="px-3 py-2 font-medium">Privacidade</th>
                    <th className="px-3 py-2 font-medium">Dados</th>
                    <th className="px-3 py-2 font-medium">Fotos int.</th>
                    <th className="px-3 py-2 font-medium">Fotos mkt.</th>
                  </tr>
                </thead>
                <tbody>
                  {consents.map((c: any) => (
                    <tr key={c.id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium text-foreground">{c.clientName}</td>
                      <Bool ok={c.terms} />
                      <Bool ok={c.privacy} />
                      <Bool ok={c.dataProcessing} />
                      <Bool ok={c.photosInternal} />
                      <Bool ok={c.photosMarketing} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileText className="h-4 w-4" /> Trilha de auditoria ({logs.length})
          </h2>
          {logs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Nenhum evento registrado.
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((l: any) => (
                <div key={l.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10px]">{l.action}</span>
                    <span className="text-muted-foreground">{l.entity}</span>
                  </div>
                  <span className="shrink-0 text-muted-foreground">
                    {new Date(l.createdAt).toLocaleString("pt-BR")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Bool({ ok }: { ok: boolean }) {
  return (
    <td className="px-3 py-2">
      {ok ? (
        <Check className="h-4 w-4 text-emerald-600" />
      ) : (
        <X className="h-4 w-4 text-muted-foreground" />
      )}
    </td>
  );
}
