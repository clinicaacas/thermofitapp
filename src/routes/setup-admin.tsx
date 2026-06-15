import { createFileRoute, redirect } from "@tanstack/react-router";
import { checkInitialSetupStatus } from "@/lib/thermofit-auth.functions";

export const Route = createFileRoute("/setup-admin")({
  head: () => ({ meta: [{ title: "Configuração inicial — ThermoFit Acas" }] }),
  loader: async () => {
    const status = await checkInitialSetupStatus();
    if (status.hasActiveSuperAdmin) {
      throw redirect({ to: "/login" });
    }
    return status;
  },
  component: SetupAdmin,
});

function SetupAdmin() {
  return (
    <div className="min-h-screen w-full px-4 py-10 sm:py-12" style={{ background: "#F3EFE6" }}>
      <div className="mx-auto w-full max-w-[560px]">
        <div className="text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center text-white" style={{ background: "#0B111A", borderRadius: 15 }}>
            <span className="text-[20px] font-bold tracking-wide">ACAS</span>
          </div>
          <h1 className="mt-4 text-[24px] font-semibold text-[#0B111A]">Criar primeiro administrador</h1>
          <p className="mt-1 text-sm text-neutral-500">
            O Super Admin principal será criado automaticamente no banco seguro quando esta rota for verificada.
          </p>
        </div>
        <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-7 text-center text-sm text-neutral-600 shadow-sm">
          Nenhuma configuração manual no front-end é necessária. Acesse pelo login público do sistema.
        </div>
      </div>
    </div>
  );
}
