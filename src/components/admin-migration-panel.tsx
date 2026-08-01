import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Eye, EyeOff, Copy, Check, ShieldAlert, Key, Download, Loader2,
  Code2, Database, AlertTriangle, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMigrationSnapshot, type MigrationTable } from "@/lib/thermofit-migration.functions";

const serverFnFiles = import.meta.glob("/src/lib/*.functions.ts");
const routeFiles = import.meta.glob("/src/routes/**/*.tsx");

function mask(value: string) {
  if (!value) return "—";
  if (value.length <= 24) return `${value.slice(0, 4)}•••••`;
  return `${value.slice(0, 12)}•••••${value.slice(-8)}`;
}

function download(name: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={!value}
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {label ? <span className="ml-1.5">{label}</span> : null}
    </Button>
  );
}

function SecretLine({ label, value }: { label: string; value: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
      <span className="w-40 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate text-xs">{shown ? value || "—" : mask(value)}</code>
      <Button type="button" variant="ghost" size="sm" onClick={() => setShown((s) => !s)}>
        {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
      <CopyButton value={value} />
    </div>
  );
}

function Step({
  n, title, icon: Icon, children,
}: { n: number; title: string; icon: typeof Key; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {n}
          </span>
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function classify(t: MigrationTable): "Essencial" | "Histórico" | "Ignorar" {
  if (t.estimated_rows === 0) return "Ignorar";
  if (/(_log|_logs|ledger|responses|completions|messages|events)$/.test(t.table_name)) return "Histórico";
  return "Essencial";
}

export function MigrationPanelTab() {
  const fetchSnapshot = useServerFn(getMigrationSnapshot);
  const [enabled, setEnabled] = useState(false);
  const { data, isFetching, error } = useQuery({
    queryKey: ["migration-snapshot"],
    queryFn: () => fetchSnapshot(),
    enabled,
    staleTime: 0,
  });

  const serverFunctionNames = useMemo(
    () => Object.keys(serverFnFiles).map((p) => p.split("/").pop()!.replace(".ts", "")).sort(),
    [],
  );
  const routeNames = useMemo(
    () => Object.keys(routeFiles).map((p) => p.replace("/src/routes/", "").replace(".tsx", "")).sort(),
    [],
  );

  const copyAll = () => {
    if (!data) return;
    const text = [
      "═══ CREDENCIAIS PÚBLICAS ═══",
      `PROJECT_URL=${data.projectUrl}`,
      `ANON_KEY=${data.anonKey}`,
      "",
      "═══ SECRETS (apenas nomes) ═══",
      ...data.secretNames,
      "",
      "═══ TABELAS ═══",
      ...data.tables.map((t) => `${t.table_name} | linhas~${t.estimated_rows} | colunas ${t.column_count} | RLS ${t.rls_enabled ? "on" : "off"} (${t.policy_count} policies)`),
      "",
      "═══ BUCKETS ═══",
      ...data.storageBuckets.map((b) => `${b.name} | ${b.public ? "público" : "privado"}`),
      "",
      "═══ FUNÇÕES DO BANCO ═══",
      ...data.dbFunctions.map((f) => `${f.name}${f.security_definer ? " (security definer)" : ""}`),
    ].join("\n");
    void navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Painel de Migração</h2>
          <p className="text-sm text-muted-foreground">
            Reúna, na ordem, tudo que precisa para migrar este projeto para outro backend.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setEnabled(true)} disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Revelar Tudo
          </Button>
          <Button variant="outline" onClick={copyAll} disabled={!data}>
            <Copy className="mr-2 h-4 w-4" /> Copiar Tudo
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Este painel é restrito ao super administrador e nunca exibe valores de secrets nem a service
          role key — no Lovable Cloud essa chave não é acessível. Recupere os valores nas origens
          (provedores) ao configurar o destino.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {(error as Error).message}
        </div>
      ) : null}

      <Step n={1} title="Credenciais públicas" icon={ShieldAlert}>
        <SecretLine label="Project URL" value={data?.projectUrl ?? ""} />
        <SecretLine label="Anon / Publishable" value={data?.anonKey ?? ""} />
        <div className="flex flex-wrap gap-2">
          <CopyButton value={data?.projectUrl ?? ""} label="Copiar Project URL" />
          <CopyButton value={data?.anonKey ?? ""} label="Copiar Anon Key" />
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          A service role key do destino você gera no novo projeto; não é copiada daqui.
        </p>
      </Step>

      <Step n={2} title="Código de servidor (server functions e rotas)" icon={Code2}>
        <div className="flex flex-wrap gap-1.5">
          {serverFunctionNames.map((n) => (
            <span key={n} className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px]">{n}</span>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            download(
              "server-functions.md",
              [
                "# Server functions",
                ...serverFunctionNames.map((n) => `- src/lib/${n}.ts`),
                "",
                "# Rotas",
                ...routeNames.map((n) => `- src/routes/${n}.tsx`),
              ].join("\n"),
              "text/markdown",
            )
          }
        >
          <Download className="mr-2 h-4 w-4" /> Baixar inventário de código
        </Button>
      </Step>

      <Step n={3} title="Secrets (nomes)" icon={Key}>
        <div className="flex flex-wrap gap-1.5">
          {(data?.secretNames ?? []).map((n) => (
            <span key={n} className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px]">{n}</span>
          ))}
          {!data ? <span className="text-xs text-muted-foreground">Clique em “Revelar Tudo”.</span> : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!data}
          onClick={() =>
            download(
              "secrets.ts",
              `export const SECRETS = {\n${(data?.secretNames ?? [])
                .map((n) => `  ${n}: "",`)
                .join("\n")}\n} as const;\n\nexport type SecretKey = keyof typeof SECRETS;\n`,
              "text/plain",
            )
          }
        >
          <Download className="mr-2 h-4 w-4" /> Baixar secrets.ts (nomes)
        </Button>
      </Step>

      <Step n={4} title="Conferência do banco" icon={Database}>
        <div className="text-sm text-muted-foreground">
          {data ? `${data.tables.length} tabelas · ${data.dbFunctions.length} funções · ${data.storageBuckets.length} buckets` : "Clique em “Revelar Tudo”."}
        </div>
        {data ? (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="px-3 py-2">Tabela</th>
                  <th className="px-3 py-2">Linhas (~)</th>
                  <th className="px-3 py-2">Colunas</th>
                  <th className="px-3 py-2">RLS</th>
                  <th className="px-3 py-2">Classificação</th>
                </tr>
              </thead>
              <tbody>
                {data.tables.map((t) => (
                  <tr key={t.table_name} className="border-t border-border">
                    <td className="px-3 py-1.5 font-medium">{t.table_name}</td>
                    <td className="px-3 py-1.5">{t.estimated_rows}</td>
                    <td className="px-3 py-1.5">{t.column_count}</td>
                    <td className="px-3 py-1.5">{t.rls_enabled ? `on (${t.policy_count})` : "off"}</td>
                    <td className="px-3 py-1.5">{classify(t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!data}
            onClick={() => download("migracao-schema.json", JSON.stringify(data, null, 2), "application/json")}
          >
            <Download className="mr-2 h-4 w-4" /> Baixar migracao-schema.json
          </Button>
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Senhas de usuários migram como hash bcrypt: continuam válidas, mas se o segredo de JWT do
          destino for diferente, todas as sessões ativas caem e será preciso entrar de novo.
        </p>
      </Step>
    </div>
  );
}
