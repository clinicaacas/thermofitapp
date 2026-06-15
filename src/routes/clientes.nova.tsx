import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/thermofit-data.functions";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/clientes/nova")({
  head: () => ({ meta: [{ title: "Nova cliente — ThermoFit" }] }),
  component: Page,
});

const PLAN_OPTIONS = [
  "ThermoFit Essencial",
  "ThermoFit Profissional",
  "ThermoFit Premium",
];

function Page() {
  const create = useServerFn(createClient);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    birthDate: "",
    startDate: new Date().toISOString().slice(0, 10),
    plan: PLAN_OPTIONS[0],
    goal: "",
    complaint: "",
    clinicalNotes: "",
    hydrationGoalMl: 2000,
    terms: false,
    privacy: false,
    dataProcessing: false,
    photosInternal: false,
    photosMarketing: false,
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const r = await create({
        data: {
          name: form.name,
          email: form.email,
          phone: form.phone,
          birthDate: form.birthDate,
          startDate: form.startDate,
          plan: form.plan,
          goal: form.goal,
          complaint: form.complaint,
          clinicalNotes: form.clinicalNotes,
          hydrationGoalMl: Number(form.hydrationGoalMl) || 0,
          status: "ativa",
          consents: {
            terms: form.terms,
            privacy: form.privacy,
            dataProcessing: form.dataProcessing,
            photosInternal: form.photosInternal,
            photosMarketing: form.photosMarketing,
          },
        },
      });
      await qc.invalidateQueries({ queryKey: ["clients"] });
      navigate({ to: "/clientes/$id", params: { id: r.client.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center gap-3">
          <Link to="/clientes" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Nova cliente</h1>
            <p className="text-sm text-muted-foreground">Cadastrar uma nova cliente no ThermoFit</p>
          </div>
        </header>

        <form onSubmit={onSubmit} className="space-y-6">
          <Section title="Dados pessoais">
            <Field label="Nome completo *">
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email">
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </Field>
              <Field label="Telefone">
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Data de nascimento">
                <Input type="date" value={form.birthDate} onChange={(e) => set("birthDate", e.target.value)} />
              </Field>
              <Field label="Data de início *">
                <Input type="date" required value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
              </Field>
            </div>
          </Section>

          <Section title="Plano e objetivos">
            <Field label="Plano ThermoFit">
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.plan}
                onChange={(e) => set("plan", e.target.value)}
              >
                {PLAN_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </Field>
            <Field label="Objetivo declarado pela cliente">
              <textarea
                className="min-h-[70px] w-full rounded-md border border-input bg-background p-3 text-sm"
                value={form.goal}
                onChange={(e) => set("goal", e.target.value)}
              />
            </Field>
            <Field label="Queixa principal">
              <textarea
                className="min-h-[70px] w-full rounded-md border border-input bg-background p-3 text-sm"
                value={form.complaint}
                onChange={(e) => set("complaint", e.target.value)}
              />
            </Field>
            <Field label="Observações clínicas internas">
              <textarea
                className="min-h-[90px] w-full rounded-md border border-input bg-background p-3 text-sm"
                value={form.clinicalNotes}
                onChange={(e) => set("clinicalNotes", e.target.value)}
              />
            </Field>
          </Section>

          <Section title="Meta de hidratação">
            <Field label="Meta diária (ml)">
              <Input
                type="number"
                min={0}
                value={form.hydrationGoalMl}
                onChange={(e) => set("hydrationGoalMl", Number(e.target.value))}
              />
            </Field>
          </Section>

          <Section title="LGPD — Consentimentos">
            <Check label="Aceito os Termos de uso" v={form.terms} onChange={(v) => set("terms", v)} />
            <Check label="Aceito a Política de privacidade" v={form.privacy} onChange={(v) => set("privacy", v)} />
            <Check label="Autorizo o tratamento de dados pessoais e de saúde" v={form.dataProcessing} onChange={(v) => set("dataProcessing", v)} />
            <Check label="Autorizo o uso de fotos para acompanhamento interno" v={form.photosInternal} onChange={(v) => set("photosInternal", v)} />
            <Check label="Autorizo o uso de fotos para divulgação/marketing" v={form.photosMarketing} onChange={(v) => set("photosMarketing", v)} />
          </Section>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Link
              to="/clientes"
              className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Salvando…" : "Iniciar Plano de Voo"}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Check({ label, v, onChange }: { label: string; v: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input
        type="checkbox"
        checked={v}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4"
      />
      <span>{label}</span>
    </label>
  );
}
