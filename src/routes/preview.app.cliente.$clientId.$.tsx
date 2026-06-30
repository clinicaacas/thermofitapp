import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPreviewClientIdentity } from "@/lib/thermofit-preview.functions";

/**
 * Rota administrativa segura do Preview do App da Cliente.
 *
 * URL: /preview/app/cliente/$clientId/$splat
 *   onde $splat = sub-caminho dentro de /app (ex.: "missoes", "videos", "").
 *
 * Responsabilidades:
 *  - Exigir sessão administrativa válida (super_admin/dono/admin/equipe).
 *  - Validar acesso à cliente via `getPreviewClientIdentity` (server-side).
 *  - Bloquear cliente final, cliente de outro tenant e URL tampering.
 *  - NÃO montar Dashboard, Configurações, Usuários ou qualquer módulo Admin.
 *  - NÃO disparar `getTenantBasics`/`getTenantTeam` (gate em TenantProvider
 *    desabilita o snapshot em /app e /preview/app).
 *  - Após validação, redirecionar dentro do iframe para a view real do App
 *    (`/app/<screen>?clientId=X`). Iframe HTML do painel admin é apenas
 *    contêiner temporário — limitação real e documentada.
 *
 * Loading: skeleton imediato com moldura, nunca tela branca.
 * Erro: mensagem controlada + botão "Tentar novamente". Sem stack/IDs.
 */
export const Route = createFileRoute("/preview/app/cliente/$clientId/$")({
  head: () => ({
    meta: [
      { title: "Preview do App — ThermoFit" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: PreviewGate,
});

function PreviewGate() {
  const { clientId, _splat } = Route.useParams();
  const fetchIdentity = useServerFn(getPreviewClientIdentity);
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "redirecting" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    fetchIdentity({ data: { clientId } })
      .then((identity) => {
        if (cancelled) return;
        const screen = (_splat ?? "").replace(/^\/+|\/+$/g, "");
        const target = screen ? `/app/${screen}` : "/app";
        setStatus("redirecting");
        // Navega DENTRO do iframe para a view real do App.
        // Identidade já foi autorizada server-side.
        navigate({
          to: target as any,
          search: {
            clientId: identity.clientId,
            previewClientId: identity.clientId,
          } as any,
          replace: true,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, _splat, attempt, fetchIdentity, navigate]);

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6 text-center">
        <div className="max-w-xs space-y-3">
          <p className="text-sm text-slate-700">
            Não foi possível carregar esta visualização agora.
          </p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  // Skeleton imediato — nunca branco.
  return (
    <div className="min-h-screen w-full animate-pulse bg-white">
      <div className="space-y-3 p-4">
        <div className="h-6 w-2/3 rounded bg-slate-200" />
        <div className="h-24 w-full rounded-xl bg-slate-100" />
        <div className="h-24 w-full rounded-xl bg-slate-100" />
        <div className="h-24 w-full rounded-xl bg-slate-100" />
      </div>
    </div>
  );
}
