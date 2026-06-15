import { createFileRoute } from "@tanstack/react-router";
import { ClientAppShell } from "@/components/client-app-shell";

export const Route = createFileRoute("/app/privacidade")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

function Page() {
  return (
    <ClientAppShell title="Privacidade & LGPD">
      <div className="space-y-3 text-sm text-slate-700">
        <p>Seus dados pessoais e de saúde são tratados conforme a LGPD.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Você pode solicitar a portabilidade dos seus dados a qualquer momento.</li>
          <li>Pode revogar consentimentos de uso de fotos pelo botão abaixo.</li>
          <li>Pode pedir a exclusão do seu cadastro.</li>
        </ul>
        <button className="mt-4 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium">
          Gerenciar consentimentos
        </button>
        <button className="w-full rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          Solicitar exclusão de dados
        </button>
      </div>
    </ClientAppShell>
  );
}
