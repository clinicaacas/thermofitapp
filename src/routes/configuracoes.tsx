import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTenant, type PlanId, type ProfileRole } from "@/lib/tenant-context";
import { Trash2, Pencil, Check, X } from "lucide-react";

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
  { value: "lgpd", label: "LGPD" },
  { value: "conta", label: "Conta e Assinatura" },
  { value: "saas", label: "Administração SaaS" },
];

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Page() {
  return (
    <AppShell title="Configurações">
      <div className="mt-6">
        <Tabs defaultValue="geral" className="w-full">
          <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-muted/60 p-1">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="text-xs">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="geral" className="mt-6">
            <GeneralTab />
          </TabsContent>
          <TabsContent value="aparencia" className="mt-6">
            <AppearanceTab />
          </TabsContent>
          <TabsContent value="whitelabel" className="mt-6">
            <WhiteLabelTab />
          </TabsContent>
          <TabsContent value="planos" className="mt-6">
            <PlansTab />
          </TabsContent>
          <TabsContent value="usuarios" className="mt-6">
            <UsersTab />
          </TabsContent>
          <TabsContent value="conta" className="mt-6">
            <AccountTab />
          </TabsContent>
          <TabsContent value="saas" className="mt-6">
            <SaasTab />
          </TabsContent>
          {["permissoes", "formularios", "integracoes", "lgpd"].map((v) => (
            <TabsContent key={v} value={v} className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {TABS.find((t) => t.value === v)?.label}
                  </CardTitle>
                  <CardDescription>Em breve.</CardDescription>
                </CardHeader>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AppShell>
  );
}

function GeneralTab() {
  const { tenant, updateTenant } = useTenant();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Informações da Clínica</CardTitle>
        <CardDescription>
          Esses dados aparecem no topo do menu lateral.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Nome da clínica">
          <Input
            value={tenant.clinicName}
            onChange={(e) => updateTenant({ clinicName: e.target.value })}
          />
        </Field>
        <Field label="Nome exibido no sistema">
          <Input
            value={tenant.systemName}
            onChange={(e) => updateTenant({ systemName: e.target.value })}
          />
        </Field>
        <Field label="Subtítulo do sistema">
          <Input
            value={tenant.systemSubtitle}
            onChange={(e) => updateTenant({ systemSubtitle: e.target.value })}
          />
        </Field>
        <Field label="Nome do responsável">
          <Input
            value={tenant.ownerName}
            onChange={(e) => updateTenant({ ownerName: e.target.value })}
          />
        </Field>
        <Field label="E-mail de contato">
          <Input
            type="email"
            value={tenant.contactEmail}
            onChange={(e) => updateTenant({ contactEmail: e.target.value })}
          />
        </Field>
        <Field label="Telefone / WhatsApp">
          <Input
            value={tenant.contactPhone}
            onChange={(e) => updateTenant({ contactPhone: e.target.value })}
          />
        </Field>
        <Field label="Cidade">
          <Input
            value={tenant.city}
            onChange={(e) => updateTenant({ city: e.target.value })}
          />
        </Field>
        <Field label="Estado">
          <Input
            value={tenant.state}
            onChange={(e) => updateTenant({ state: e.target.value })}
          />
        </Field>
        <Field label="Status da clínica">
          <Select
            value={tenant.status}
            onValueChange={(v) =>
              updateTenant({ status: v as typeof tenant.status })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ativa">Ativa</SelectItem>
              <SelectItem value="suspensa">Suspensa</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </CardContent>
    </Card>
  );
}

function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
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
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identidade visual</CardTitle>
          <CardDescription>
            Personalize as cores e logos exibidos na sua clínica.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="URL do logo principal">
            <Input
              placeholder="https://..."
              value={tenant.logoUrl ?? ""}
              onChange={(e) => updateTenant({ logoUrl: e.target.value })}
            />
          </Field>
          <Field label="URL do ícone / favicon">
            <Input
              placeholder="https://..."
              value={tenant.faviconUrl ?? ""}
              onChange={(e) => updateTenant({ faviconUrl: e.target.value })}
            />
          </Field>
          <Field label="Cor primária">
            <ColorInput
              value={tenant.primaryColor}
              onChange={(v) => updateTenant({ primaryColor: v })}
            />
          </Field>
          <Field label="Cor secundária">
            <ColorInput
              value={tenant.secondaryColor}
              onChange={(v) => updateTenant({ secondaryColor: v })}
            />
          </Field>
          <Field label="Cor de destaque">
            <ColorInput
              value={tenant.accentColor}
              onChange={(v) => updateTenant({ accentColor: v })}
            />
          </Field>
          <Field label="Tema padrão">
            <Select
              value={tenant.defaultTheme}
              onValueChange={(v) =>
                updateTenant({ defaultTheme: v as "light" | "dark" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pré-visualização</CardTitle>
          <CardDescription>Exemplo de aplicação das cores.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            className="rounded-md border p-3 text-sm"
            style={{ borderColor: tenant.primaryColor }}
          >
            Cabeçalho da clínica
          </div>
          <div
            className="rounded-md p-3 text-sm text-white"
            style={{ background: tenant.primaryColor }}
          >
            Item ativo do menu
          </div>
          <button
            className="rounded-md px-3 py-2 text-sm font-medium text-white"
            style={{ background: tenant.accentColor }}
          >
            Botão de destaque
          </button>
          <div
            className="rounded-md p-3 text-sm"
            style={{ background: tenant.secondaryColor, color: "#111" }}
          >
            Bloco secundário
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function WhiteLabelTab() {
  const { tenant, updateTenant } = useTenant();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">White Label</CardTitle>
        <CardDescription>
          Configure a marca exibida para os clientes da sua clínica.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <div className="text-sm font-medium">Ativar White Label</div>
            <div className="text-xs text-muted-foreground">
              Substitui a marca ThermoFit pela marca da sua clínica.
            </div>
          </div>
          <Switch
            checked={tenant.whiteLabelEnabled}
            onCheckedChange={(v) => updateTenant({ whiteLabelEnabled: v })}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Nome da marca">
            <Input
              value={tenant.brandName}
              onChange={(e) => updateTenant({ brandName: e.target.value })}
            />
          </Field>
          <Field label="Nome curto da marca">
            <Input
              value={tenant.brandShortName}
              onChange={(e) => updateTenant({ brandShortName: e.target.value })}
            />
          </Field>
          <Field label="URL do logo da marca">
            <Input
              placeholder="https://..."
              value={tenant.brandLogoUrl ?? ""}
              onChange={(e) => updateTenant({ brandLogoUrl: e.target.value })}
            />
          </Field>
          <Field label="Texto do rodapé / assinatura">
            <Input
              value={tenant.footerText}
              onChange={(e) => updateTenant({ footerText: e.target.value })}
            />
          </Field>
          <Field label="Cor principal da marca">
            <ColorInput
              value={tenant.brandPrimary}
              onChange={(v) => updateTenant({ brandPrimary: v })}
            />
          </Field>
          <Field label="Cor secundária da marca">
            <ColorInput
              value={tenant.brandSecondary}
              onChange={(v) => updateTenant({ brandSecondary: v })}
            />
          </Field>
          <Field label="Subdomínio da clínica (em breve)">
            <Input
              placeholder="clinicaacas"
              value={tenant.subdomain}
              onChange={(e) => updateTenant({ subdomain: e.target.value })}
            />
          </Field>
          <Field label="Domínio personalizado (em breve)">
            <Input
              placeholder="app.clinicaacas.com.br"
              value={tenant.customDomain}
              onChange={(e) => updateTenant({ customDomain: e.target.value })}
            />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          Exemplo: {tenant.subdomain || "clinicaacas"}.thermofit.app
        </p>
      </CardContent>
    </Card>
  );
}

function PlansTab() {
  const { plans, updatePlan, tenant, updateTenant } = useTenant();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => {
          const isCurrent = tenant.planId === p.id;
          return (
            <Card key={p.id} className={isCurrent ? "ring-1 ring-primary" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    <CardDescription>{p.description}</CardDescription>
                  </div>
                  <Switch
                    checked={p.active}
                    onCheckedChange={(v) => updatePlan(p.id, { active: v })}
                  />
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
  const [editing, setEditing] = useState(false);
  const [userLimit, setUserLimit] = useState(String(plan.userLimit));
  const [clientLimit, setClientLimit] = useState(String(plan.clientLimit));

  if (!editing) {
    return (
      <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
        <Pencil className="h-3 w-3" /> Editar
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-md border p-2">
      <Field label="Usuários (-1 = personalizado)">
        <Input value={userLimit} onChange={(e) => setUserLimit(e.target.value)} />
      </Field>
      <Field label="Clientes ativos (-1 = personalizado)">
        <Input
          value={clientLimit}
          onChange={(e) => setClientLimit(e.target.value)}
        />
      </Field>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            updatePlan(planId, {
              userLimit: Number(userLimit) || 0,
              clientLimit: Number(clientLimit) || 0,
            });
            setEditing(false);
          }}
        >
          Salvar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function UsersTab() {
  const { tenant, currentPlan, addUser, updateUser, removeUser } = useTenant();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "",
    profile: "equipe" as ProfileRole,
  });
  const [error, setError] = useState<string | null>(null);
  const limit = currentPlan?.userLimit ?? 0;
  const atLimit = limit !== -1 && tenant.team.length >= limit;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adicionar usuário</CardTitle>
          <CardDescription>
            {limit === -1
              ? "Plano com usuários personalizados."
              : `Plano atual: ${tenant.team.length} de ${limit} usuários.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Nome">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="E-mail">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="Telefone">
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label="Cargo">
              <Input
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              />
            </Field>
            <Field label="Perfil de acesso">
              <Select
                value={form.profile}
                onValueChange={(v) =>
                  setForm({ ...form, profile: v as ProfileRole })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dono">Dono da Clínica</SelectItem>
                  <SelectItem value="admin">Admin da Clínica</SelectItem>
                  <SelectItem value="equipe">Equipe</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </div>
          )}
          <Button
            size="sm"
            disabled={!form.name || !form.email}
            onClick={() => {
              setError(null);
              const r = addUser({ ...form, status: "ativo" });
              if (!r.ok) {
                setError(r.reason ?? "Não foi possível adicionar.");
                return;
              }
              setForm({
                name: "",
                email: "",
                phone: "",
                role: "",
                profile: "equipe",
              });
            }}
          >
            Adicionar usuário
          </Button>
          {atLimit && (
            <p className="text-xs text-muted-foreground">
              Seu plano atual permite até {limit} usuários. Para adicionar mais
              pessoas, atualize seu plano.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Equipe</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {tenant.team.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{u.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {u.email} · {u.role || "—"} · {profileLabel(u.profile)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={u.status}
                  onValueChange={(v) =>
                    updateUser(u.id, { status: v as "ativo" | "inativo" })
                  }
                >
                  <SelectTrigger className="h-8 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
                {u.profile !== "super_admin" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeUser(u.id)}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function profileLabel(p: ProfileRole) {
  return {
    super_admin: "Super Admin SaaS",
    dono: "Dono da Clínica",
    admin: "Admin da Clínica",
    equipe: "Equipe",
  }[p];
}

function AccountTab() {
  const { tenant, currentPlan } = useTenant();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Conta e Assinatura</CardTitle>
        <CardDescription>Resumo da sua clínica.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Info label="Plano atual" value={currentPlan?.name ?? "—"} />
          <Info label="Status" value={tenant.status} />
          <Info
            label="Renovação"
            value={tenant.renewalDate || "—"}
          />
          <Info
            label="Limite de usuários"
            value={
              currentPlan?.userLimit === -1
                ? "Personalizado"
                : String(currentPlan?.userLimit ?? 0)
            }
          />
          <Info
            label="Usuários cadastrados"
            value={String(tenant.team.length)}
          />
          <Info
            label="Limite de clientes ativos"
            value={
              currentPlan?.clientLimit === -1
                ? "Personalizado"
                : String(currentPlan?.clientLimit ?? 0)
            }
          />
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium capitalize">{value}</div>
    </div>
  );
}

function SaasTab() {
  const { tenant, currentPlan } = useTenant();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Administração SaaS</CardTitle>
        <CardDescription>
          Visão global das clínicas cadastradas. Disponível para Super Admin
          SaaS.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <div>
            <div className="text-sm font-medium">{tenant.clinicName}</div>
            <div className="text-xs text-muted-foreground">
              {currentPlan?.name} · {tenant.team.length} usuário(s) · {tenant.status}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline">
              Editar
            </Button>
            <Button size="sm" variant="ghost">
              Suspender
            </Button>
          </div>
        </div>
        <Button size="sm" variant="outline" disabled>
          Criar nova clínica (em breve)
        </Button>
      </CardContent>
    </Card>
  );
}
