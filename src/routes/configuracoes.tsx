import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTenant, type PlanId, type ProfileRole, type TeamUser, type UserStatus } from "@/lib/tenant-context";
import { generateTempPassword } from "@/lib/auth-context";
import {
  Pencil,
  Trash2,
  Check,
  X,
  MessageCircle,
  Calendar,
  CreditCard,
  Mail,
  Webhook,
  Upload,
  Copy,
  KeyRound,
  Ban,
  UserX,
  MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — ThermoFit" }] }),
  component: Page,
});

const TABS = [
  { value: "geral", label: "Geral" },
  { value: "aparencia", label: "Aparência" },
  { value: "whitelabel", label: "White Label" },
  { value: "planos", label: "Planos" },
  { value: "usuarios", label: "Usuários e Equipe" },
  { value: "permissoes", label: "Permissões" },
  { value: "formularios", label: "Formulários" },
  { value: "integracoes", label: "Integrações" },
  { value: "conta", label: "Conta e Assinatura" },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function useSavedFlag() {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 1800);
    return () => clearTimeout(t);
  }, [saved]);
  return [saved, () => setSaved(true)] as const;
}

function Page() {
  return (
    <AppShell>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie a clínica, identidade visual, usuários, planos e preferências do sistema.
        </p>
      </div>

      <div className="mt-6">
        <Tabs defaultValue="geral" className="w-full">
          <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-muted/60 p-1">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="text-xs">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="geral" className="mt-6"><GeneralTab /></TabsContent>
          <TabsContent value="aparencia" className="mt-6"><AppearanceTab /></TabsContent>
          <TabsContent value="whitelabel" className="mt-6"><WhiteLabelTab /></TabsContent>
          <TabsContent value="planos" className="mt-6"><PlansTab /></TabsContent>
          <TabsContent value="usuarios" className="mt-6"><UsersTab /></TabsContent>
          <TabsContent value="permissoes" className="mt-6"><PermissionsTab /></TabsContent>
          <TabsContent value="formularios" className="mt-6"><FormsTab /></TabsContent>
          <TabsContent value="integracoes" className="mt-6"><IntegrationsTab /></TabsContent>
          <TabsContent value="conta" className="mt-6"><AccountTab /></TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

/* ------------------- GERAL ------------------- */
function GeneralTab() {
  const { tenant, updateTenant } = useTenant();
  const [saved, markSaved] = useSavedFlag();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Informações da Clínica</CardTitle>
        <CardDescription>Esses dados aparecem no topo do menu lateral.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Nome da clínica">
          <Input value={tenant.clinicName} onChange={(e) => updateTenant({ clinicName: e.target.value })} />
        </Field>
        <Field label="Nome exibido no sistema">
          <Input value={tenant.systemName} onChange={(e) => updateTenant({ systemName: e.target.value })} />
        </Field>
        <Field label="Subtítulo do sistema">
          <Input value={tenant.systemSubtitle} onChange={(e) => updateTenant({ systemSubtitle: e.target.value })} />
        </Field>
        <Field label="Nome do responsável">
          <Input value={tenant.ownerName} onChange={(e) => updateTenant({ ownerName: e.target.value })} />
        </Field>
        <Field label="E-mail de contato">
          <Input type="email" value={tenant.contactEmail} onChange={(e) => updateTenant({ contactEmail: e.target.value })} />
        </Field>
        <Field label="WhatsApp">
          <Input value={tenant.contactPhone} onChange={(e) => updateTenant({ contactPhone: e.target.value })} />
        </Field>
        <Field label="Cidade">
          <Input value={tenant.city} onChange={(e) => updateTenant({ city: e.target.value })} />
        </Field>
        <Field label="Estado">
          <Input value={tenant.state} onChange={(e) => updateTenant({ state: e.target.value })} />
        </Field>
        <Field label="Status da clínica">
          <Select value={tenant.status} onValueChange={(v) => updateTenant({ status: v as typeof tenant.status })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ativa">Ativa</SelectItem>
              <SelectItem value="suspensa">Suspensa</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="md:col-span-2 space-y-1.5">
          <Field label="URL pública do sistema">
            <Input
              placeholder="https://thermofitapp.lovable.app"
              value={tenant.publicAppUrl}
              onChange={(e) => updateTenant({ publicAppUrl: e.target.value })}
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Use aqui a URL pública publicada do sistema. Não use link de preview, editor ou projeto do Lovable.
          </p>
        </div>
        <div className="md:col-span-2 flex items-center gap-3 pt-2">
          <Button onClick={markSaved}>Salvar alterações</Button>
          {saved && <span className="text-xs text-muted-foreground">Alterações salvas.</span>}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------- APARÊNCIA ------------------- */
function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent"
      />
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function AppearanceTab() {
  const { tenant, updateTenant } = useTenant();
  const [saved, markSaved] = useSavedFlag();
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identidade Visual</CardTitle>
          <CardDescription>Personalize logo, cores e tema padrão.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Logo principal">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" type="button">
                <Upload className="h-3 w-3" /> Enviar logo
              </Button>
              <Input
                placeholder="ou cole uma URL"
                value={tenant.logoUrl ?? ""}
                onChange={(e) => updateTenant({ logoUrl: e.target.value })}
              />
            </div>
          </Field>
          <Field label="Ícone pequeno (favicon)">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" type="button">
                <Upload className="h-3 w-3" /> Enviar ícone
              </Button>
              <Input
                placeholder="ou cole uma URL"
                value={tenant.faviconUrl ?? ""}
                onChange={(e) => updateTenant({ faviconUrl: e.target.value })}
              />
            </div>
          </Field>
          <Field label="Cor primária">
            <ColorInput value={tenant.primaryColor} onChange={(v) => updateTenant({ primaryColor: v })} />
          </Field>
          <Field label="Cor secundária">
            <ColorInput value={tenant.secondaryColor} onChange={(v) => updateTenant({ secondaryColor: v })} />
          </Field>
          <Field label="Cor de destaque">
            <ColorInput value={tenant.accentColor} onChange={(v) => updateTenant({ accentColor: v })} />
          </Field>
          <Field label="Tema padrão">
            <Select value={tenant.defaultTheme} onValueChange={(v) => updateTenant({ defaultTheme: v as "light" | "dark" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={markSaved}>Salvar aparência</Button>
            {saved && <span className="text-xs text-muted-foreground">Aparência salva.</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pré-visualização</CardTitle>
          <CardDescription>Como a marca aparecerá no sistema.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border p-3">
            <div className="flex items-center gap-3">
              <div
                className="grid h-9 w-9 place-items-center rounded-md text-xs font-semibold text-white"
                style={{ background: tenant.primaryColor }}
              >
                {tenant.brandShortName?.slice(0, 2).toUpperCase() || "TF"}
              </div>
              <div>
                <div className="text-sm font-semibold">{tenant.systemName}</div>
                <div className="text-xs text-muted-foreground">{tenant.systemSubtitle}</div>
              </div>
            </div>
          </div>
          <div
            className="rounded-md p-3 text-sm font-medium text-white"
            style={{ background: tenant.primaryColor }}
          >
            Item ativo do menu
          </div>
          <button
            className="rounded-md px-3 py-2 text-sm font-medium text-white"
            style={{ background: tenant.primaryColor }}
          >
            Botão principal
          </button>
          <div className="rounded-md border p-4">
            <div className="text-xs text-muted-foreground">Card</div>
            <div className="mt-1 text-sm font-medium">Exemplo de card</div>
            <div className="mt-2 inline-block rounded-md px-2 py-0.5 text-xs" style={{ background: tenant.accentColor, color: "#111" }}>
              destaque
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------- WHITE LABEL ------------------- */
function WhiteLabelTab() {
  const { tenant, updateTenant } = useTenant();
  const [saved, markSaved] = useSavedFlag();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Configuração White Label</CardTitle>
        <CardDescription>Configure a marca exibida para os clientes da sua clínica.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <div className="text-sm font-medium">Ativar White Label</div>
            <div className="text-xs text-muted-foreground">Exibe a marca da sua clínica no lugar de ThermoFit.</div>
          </div>
          <Switch checked={tenant.whiteLabelEnabled} onCheckedChange={(v) => updateTenant({ whiteLabelEnabled: v })} />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Nome da marca">
            <Input value={tenant.brandName} onChange={(e) => updateTenant({ brandName: e.target.value })} />
          </Field>
          <Field label="Nome curto da marca">
            <Input value={tenant.brandShortName} onChange={(e) => updateTenant({ brandShortName: e.target.value })} />
          </Field>
          <Field label="Logo da marca (URL)">
            <Input placeholder="https://..." value={tenant.brandLogoUrl ?? ""} onChange={(e) => updateTenant({ brandLogoUrl: e.target.value })} />
          </Field>
          <Field label="Texto de assinatura / rodapé">
            <Input value={tenant.footerText} onChange={(e) => updateTenant({ footerText: e.target.value })} />
          </Field>
          <Field label="Cor principal da marca">
            <ColorInput value={tenant.brandPrimary} onChange={(v) => updateTenant({ brandPrimary: v })} />
          </Field>
          <Field label="Cor secundária da marca">
            <ColorInput value={tenant.brandSecondary} onChange={(v) => updateTenant({ brandSecondary: v })} />
          </Field>
          <Field label="Subdomínio da clínica">
            <Input value={tenant.subdomain} onChange={(e) => updateTenant({ subdomain: e.target.value })} />
          </Field>
          <Field label="Domínio personalizado">
            <Input placeholder="app.clinicaacas.com.br" value={tenant.customDomain} onChange={(e) => updateTenant({ customDomain: e.target.value })} />
          </Field>
        </div>

        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          O domínio personalizado será preparado para uma etapa futura. Nesta versão, os campos
          ficam disponíveis apenas para configuração.
        </p>

        <div className="flex items-center gap-3">
          <Button onClick={markSaved}>Salvar White Label</Button>
          {saved && <span className="text-xs text-muted-foreground">Salvo.</span>}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------- PLANOS ------------------- */
function PlansTab() {
  const { plans, updatePlan, tenant, updateTenant } = useTenant();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Planos White Label</h2>
        <p className="text-sm text-muted-foreground">Gerencie os planos disponíveis no SaaS.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans
          .filter((p) => p.id !== "interno")
          .map((p) => {
            const isCurrent = tenant.planId === p.id;
            return (
              <Card key={p.id} className={isCurrent ? "ring-1 ring-primary" : ""}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{p.name}</CardTitle>
                      <CardDescription>{p.description}</CardDescription>
                    </div>
                    <Switch checked={p.active} onCheckedChange={(v) => updatePlan(p.id, { active: v })} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-xs text-muted-foreground">
                    <div>
                      Usuários:{" "}
                      <span className="text-foreground font-medium">
                        {p.userLimit === -1 ? "Personalizado" : p.userLimit}
                      </span>
                    </div>
                    <div>
                      Clientes ativos:{" "}
                      <span className="text-foreground font-medium">
                        {p.clientLimit === -1 ? "Personalizado" : p.clientLimit}
                      </span>
                    </div>
                  </div>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-1.5">
                        <Check className="mt-0.5 h-3 w-3 text-primary" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant={isCurrent ? "secondary" : "default"}
                      onClick={() => updateTenant({ planId: p.id })}
                      disabled={isCurrent}
                      className="flex-1"
                    >
                      {isCurrent ? "Plano atual" : "Selecionar"}
                    </Button>
                    <EditPlanButton planId={p.id} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
      </div>
    </div>
  );
}

function EditPlanButton({ planId }: { planId: PlanId }) {
  const { plans, updatePlan } = useTenant();
  const plan = plans.find((p) => p.id === planId)!;
  const [open, setOpen] = useState(false);
  const [userLimit, setUserLimit] = useState(String(plan.userLimit));
  const [clientLimit, setClientLimit] = useState(String(plan.clientLimit));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Pencil className="h-3 w-3" /> Editar plano
      </Button>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar {plan.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Limite de usuários (-1 = personalizado)">
            <Input value={userLimit} onChange={(e) => setUserLimit(e.target.value)} />
          </Field>
          <Field label="Limite de clientes (-1 = personalizado)">
            <Input value={clientLimit} onChange={(e) => setClientLimit(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={() => {
              updatePlan(planId, {
                userLimit: Number(userLimit) || 0,
                clientLimit: Number(clientLimit) || 0,
              });
              setOpen(false);
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------- USUÁRIOS ------------------- */
function profileLabel(p: ProfileRole) {
  return {
    super_admin: "Super Admin SaaS",
    dono: "Dono da Clínica",
    admin: "Admin da Clínica",
    equipe: "Equipe",
  }[p];
}

function statusLabel(s: UserStatus) {
  return { ativo: "Ativo", inativo: "Inativo", bloqueado: "Bloqueado", convite_pendente: "Convite pendente" }[s];
}
function statusClass(s: UserStatus) {
  if (s === "ativo") return "bg-primary/10 text-primary";
  if (s === "bloqueado") return "bg-destructive/10 text-destructive";
  if (s === "convite_pendente") return "bg-amber-500/10 text-amber-600";
  return "bg-muted text-muted-foreground";
}

function publicBaseUrl() {
  const env = (import.meta as any).env?.VITE_APP_PUBLIC_URL as string | undefined;
  if (env) return env.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    // Avoid Lovable preview/editor hosts that require Lovable login
    if (host.includes("id-preview--") || host.includes("lovable.app/projects") || host.includes("lovable.dev")) {
      return "https://thermofitapp.lovable.app";
    }
    return window.location.origin;
  }
  return "https://thermofitapp.lovable.app";
}

function accessText(u: TeamUser) {
  const link = `${publicBaseUrl()}/login`;
  return `Olá, seu acesso ao sistema ThermoFit Acas foi criado.\n\nAcesse pelo link abaixo:\n${link}\n\nE-mail: ${u.email}\nSenha provisória: ${u.password}\n\nNo primeiro acesso, altere sua senha para manter sua conta segura.\n\nImportante: este acesso é pessoal e não deve ser compartilhado.`;
}

function UsersTab() {
  const { tenant, currentPlan, addUser, updateUser, removeUser } = useTenant();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<TeamUser | null>(null);
  const [copied, setCopied] = useState(false);
  const emptyForm = {
    name: "", email: "", phone: "", role: "",
    profile: "equipe" as ProfileRole,
    status: "ativo" as UserStatus,
    mustChangePassword: true,
  };
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const isInternal = tenant.planId === "interno";
  const limit = currentPlan?.userLimit ?? 0;
  const unlimited = isInternal || limit === -1;
  const atLimit = !unlimited && tenant.team.length >= limit;

  function copyAccess(u: TeamUser) {
    navigator.clipboard.writeText(accessText(u));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function resetPassword(u: TeamUser) {
    const np = generateTempPassword();
    updateUser(u.id, { password: np, mustChangePassword: true });
    const updated = { ...u, password: np, mustChangePassword: true };
    navigator.clipboard.writeText(accessText(updated));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base">Usuários e Equipe</CardTitle>
          <CardDescription>
            {isInternal
              ? "Usuários ilimitados no plano Interno / Master."
              : limit === -1
                ? "Plano com usuários ilimitados."
                : `${tenant.team.length} de ${limit} usuários no plano.`}
          </CardDescription>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setError(null); setCreated(null); setForm(emptyForm); } }}>
          <Button size="sm" onClick={() => setOpen(true)} disabled={atLimit}>Adicionar usuário</Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{created ? "Dados de acesso" : "Adicionar usuário"}</DialogTitle>
            </DialogHeader>

            {!created ? (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field label="Nome"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                  <Field label="E-mail"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
                  <Field label="Telefone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
                  <Field label="Cargo"><Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></Field>
                  <Field label="Perfil de acesso">
                    <Select value={form.profile} onValueChange={(v) => setForm({ ...form, profile: v as ProfileRole })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="super_admin">Super Admin SaaS</SelectItem>
                        <SelectItem value="dono">Dono da Clínica</SelectItem>
                        <SelectItem value="admin">Admin da Clínica</SelectItem>
                        <SelectItem value="equipe">Equipe</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Clínica vinculada">
                    <Input value={tenant.clinicName} readOnly />
                  </Field>
                  <Field label="Status do usuário">
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as UserStatus })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="inativo">Inativo</SelectItem>
                        <SelectItem value="bloqueado">Bloqueado</SelectItem>
                        <SelectItem value="convite_pendente">Convite pendente</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="md:col-span-2 flex items-center justify-between rounded-md border p-3">
                    <div>
                      <div className="text-sm font-medium">Exigir troca de senha no primeiro acesso</div>
                      <div className="text-xs text-muted-foreground">Será gerada uma senha provisória.</div>
                    </div>
                    <Switch checked={form.mustChangePassword} onCheckedChange={(v) => setForm({ ...form, mustChangePassword: v })} />
                  </div>
                </div>
                {error && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</div>
                )}
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button
                    disabled={!form.name || !form.email}
                    onClick={() => {
                      setError(null);
                      const password = generateTempPassword();
                      const r = addUser({ ...form, password });
                      if (!r.ok || !r.user) { setError(r.reason ?? "Não foi possível adicionar."); return; }
                      setCreated(r.user);
                    }}
                  >
                    Criar usuário
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <div className="space-y-3">
                  <div className="rounded-md border bg-muted/40 p-3 text-xs">
                    <div className="mb-2 text-muted-foreground">Compartilhe estes dados com o usuário:</div>
                    <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed">{accessText(created)}</pre>
                  </div>
                  <Button onClick={() => copyAccess(created)} className="w-full">
                    <Copy className="h-3 w-3" /> {copied ? "Copiado!" : "Copiar dados de acesso"}
                  </Button>
                </div>
                <DialogFooter>
                  <Button onClick={() => setOpen(false)}>Concluir</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-3">
        {atLimit && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            Seu plano atual permite até {limit} usuários. Para adicionar mais pessoas, atualize seu plano.
          </div>
        )}
        {copied && (
          <div className="rounded-md border border-primary/40 bg-primary/10 p-2 text-xs text-primary">
            Dados de acesso copiados para a área de transferência.
          </div>
        )}
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Clínica</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Último acesso</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenant.team.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell className="text-muted-foreground">{profileLabel(u.profile)}</TableCell>
                  <TableCell className="text-muted-foreground">{tenant.clinicName}</TableCell>
                  <TableCell>
                    <span className={"inline-flex rounded-full px-2 py-0.5 text-xs " + statusClass(u.status)}>
                      {statusLabel(u.status)}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.lastAccess || "—"}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => copyAccess(u)}>
                          <Copy className="h-3 w-3" /> Copiar dados de acesso
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => resetPassword(u)}>
                          <KeyRound className="h-3 w-3" /> Redefinir senha
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => resetPassword(u)}>
                          <Pencil className="h-3 w-3" /> Gerar novo acesso
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => updateUser(u.id, { status: u.status === "inativo" ? "ativo" : "inativo" })}>
                          <UserX className="h-3 w-3" /> {u.status === "inativo" ? "Ativar" : "Inativar"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => updateUser(u.id, { status: u.status === "bloqueado" ? "ativo" : "bloqueado" })}>
                          <Ban className="h-3 w-3" /> {u.status === "bloqueado" ? "Desbloquear" : "Bloquear"}
                        </DropdownMenuItem>
                        {u.profile !== "super_admin" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => removeUser(u.id)} className="text-destructive">
                              <Trash2 className="h-3 w-3" /> Remover
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------- PERMISSÕES ------------------- */
const PERM_PROFILES: { key: Exclude<ProfileRole, "super_admin">; label: string }[] = [
  { key: "dono", label: "Dono da Clínica" },
  { key: "admin", label: "Admin da Clínica" },
  { key: "equipe", label: "Equipe" },
];
const PERM_MODULES = [
  "Dashboard", "Clientes", "Alertas", "Mensagens", "Aprovações",
  "Vídeos", "Exercícios", "Prêmios", "Relatórios", "LGPD", "Configurações",
];

function PermissionsTab() {
  const [perms, setPerms] = useState<Record<string, Record<string, boolean>>>(() => {
    const init: Record<string, Record<string, boolean>> = {};
    PERM_PROFILES.forEach((p) => {
      init[p.key] = {};
      PERM_MODULES.forEach((m) => {
        init[p.key][m] = p.key === "dono" || (p.key === "admin" && m !== "Configurações");
      });
    });
    return init;
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Permissões de Acesso</CardTitle>
        <CardDescription>Defina quais módulos cada perfil poderá acessar.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Perfil</TableHead>
                {PERM_MODULES.map((m) => (
                  <TableHead key={m} className="text-center text-xs">{m}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {PERM_PROFILES.map((p) => (
                <TableRow key={p.key}>
                  <TableCell className="font-medium">{p.label}</TableCell>
                  {PERM_MODULES.map((m) => (
                    <TableCell key={m} className="text-center">
                      <Checkbox
                        checked={perms[p.key][m]}
                        onCheckedChange={(v) =>
                          setPerms((prev) => ({
                            ...prev,
                            [p.key]: { ...prev[p.key], [m]: Boolean(v) },
                          }))
                        }
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------- FORMULÁRIOS ------------------- */
function FormsTab() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base">Formulários</CardTitle>
          <CardDescription>
            Centralize aqui os campos e perguntas usados nos formulários do sistema.
          </CardDescription>
        </div>
        <Button size="sm">Criar formulário</Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum formulário criado ainda.
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------- INTEGRAÇÕES ------------------- */
const INTEGRATIONS = [
  { name: "WhatsApp", desc: "Envie mensagens e notificações.", icon: MessageCircle },
  { name: "Google Agenda", desc: "Sincronize compromissos.", icon: Calendar },
  { name: "Pagamentos", desc: "Receba via cartão e Pix.", icon: CreditCard },
  { name: "E-mail", desc: "Disparo de e-mails transacionais.", icon: Mail },
  { name: "Webhooks", desc: "Integre com sistemas externos.", icon: Webhook },
];

function IntegrationsTab() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Integrações</h2>
        <p className="text-sm text-muted-foreground">
          Configure futuras integrações com WhatsApp, agenda, pagamentos, e-mail e automações.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {INTEGRATIONS.map((i) => {
          const Icon = i.icon;
          return (
            <Card key={i.name}>
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-md bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{i.name}</div>
                    <div className="text-xs text-muted-foreground">{i.desc}</div>
                    <div className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      Não conectado
                    </div>
                  </div>
                </div>
                <Button size="sm" variant="outline">Conectar</Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------- CONTA E ASSINATURA ------------------- */
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function AccountTab() {
  const { tenant, currentPlan } = useTenant();
  const isInternal = tenant.planId === "interno";
  const planName = isInternal ? "Interno / Master" : currentPlan?.name ?? "—";
  const userLimit = isInternal
    ? "Ilimitado"
    : currentPlan?.userLimit === -1
      ? "Personalizado"
      : String(currentPlan?.userLimit ?? 0);
  const clientLimit = isInternal
    ? "Ilimitado"
    : currentPlan?.clientLimit === -1
      ? "Personalizado"
      : String(currentPlan?.clientLimit ?? 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Conta e Assinatura</CardTitle>
        <CardDescription>Resumo da assinatura da clínica.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Info label="Plano atual" value={planName} />
          <Info label="Status da assinatura" value={tenant.status === "ativa" ? "Ativa" : tenant.status} />
          <Info label="Data de renovação" value={isInternal ? "Não aplicável" : tenant.renewalDate || "—"} />
          <Info label="Limite de usuários" value={userLimit} />
          <Info label="Usuários cadastrados" value={String(tenant.team.length)} />
          <Info label="Limite de clientes ativos" value={clientLimit} />
          <Info label="Clientes ativos cadastrados" value="0" />
        </div>
        <div className="flex gap-2">
          <Button size="sm">Alterar plano</Button>
          <Button size="sm" variant="outline">
            <X className="h-3 w-3" /> Cancelar assinatura
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
