import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTenant } from "@/lib/tenant-context";

export const Route = createFileRoute("/setup-admin")({
  head: () => ({ meta: [{ title: "Configuração inicial — ThermoFit Acas" }] }),
  component: SetupAdmin,
});

function SetupAdmin() {
  const { tenant, updateTenant } = useTenant();
  const navigate = useNavigate();
  const hasUsers = tenant.team.length > 0;

  if (hasUsers) {
    return <Navigate to="/login" />;
  }

  const [form, setForm] = useState({
    name: "Dra. Cynara Acas",
    email: "studioacass@gmail.com",
    password: "",
    confirm: "",
    clinicName: "Clínica Acas",
    systemName: "ThermoFit Acas",
    systemSubtitle: "Plano de Voo da Transformação",
  });
  const [error, setError] = useState<string | null>(null);

  if (hasUsers) {
    return (
      <div className="min-h-screen w-full grid place-items-center px-4" style={{ background: "#F3EFE6" }}>
        <div className="max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-[#0B111A]">Configuração inicial indisponível</h1>
          <p className="mt-2 text-sm text-neutral-500">
            O sistema já possui administrador cadastrado.
          </p>
          <button
            onClick={() => navigate({ to: "/login" })}
            className="mt-5 h-10 w-full rounded-md text-sm font-semibold text-white"
            style={{ background: "#2563EB" }}
          >
            Ir para o login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full px-4 py-10 sm:py-12" style={{ background: "#F3EFE6" }}>
      <div className="mx-auto w-full max-w-[560px]">
        <div className="text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center text-white" style={{ background: "#0B111A", borderRadius: 15 }}>
            <span className="text-[20px] font-bold tracking-wide">ACAS</span>
          </div>
          <h1 className="mt-4 text-[24px] font-semibold text-[#0B111A]">Criar primeiro administrador</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Este acesso inicial será usado para configurar o primeiro Super Admin do sistema.
          </p>
        </div>

        <form
          className="mt-8 rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (form.password.length < 6) return setError("A senha deve ter pelo menos 6 caracteres.");
            if (form.password !== form.confirm) return setError("As senhas não coincidem.");

            updateTenant({
              clinicName: form.clinicName,
              systemName: form.systemName,
              systemSubtitle: form.systemSubtitle,
              publicAppUrl: "https://thermofitapp.lovable.app",
              ownerName: form.name,
              contactEmail: form.email,
              planId: "interno",
              status: "ativa",
              team: [
                {
                  id: crypto.randomUUID(),
                  name: form.name,
                  email: form.email,
                  role: "Super Admin",
                  profile: "super_admin",
                  status: "ativo",
                  password: form.password,
                  mustChangePassword: false,
                  tenantId: tenant.id,
                  lastAccess: "",
                },
              ],
            });
            navigate({ to: "/login" });
          }}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2 space-y-1.5">
              <Label className="text-sm">Nome do administrador</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label className="text-sm">E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Senha provisória</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Confirmar senha</Label>
              <Input type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label className="text-sm">Nome da clínica</Label>
              <Input value={form.clinicName} onChange={(e) => setForm({ ...form, clinicName: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Nome do sistema</Label>
              <Input value={form.systemName} onChange={(e) => setForm({ ...form, systemName: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Subtítulo</Label>
              <Input value={form.systemSubtitle} onChange={(e) => setForm({ ...form, systemSubtitle: e.target.value })} required />
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-600">{error}</div>
          )}

          <button
            type="submit"
            className="h-11 w-full rounded-md text-sm font-semibold text-white transition-colors hover:bg-[#1D4FD8]"
            style={{ background: "#2563EB" }}
          >
            Criar Super Admin e ir para o login
          </button>
          <p className="text-center text-xs text-neutral-500">
            Esta tela será desativada automaticamente após a criação do primeiro usuário.
          </p>
        </form>
      </div>
    </div>
  );
}

// silence unused import in some bundlers
void Navigate;
