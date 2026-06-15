import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Redefinir senha — ThermoFit Acas" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  return (
    <div className="grid min-h-screen w-full place-items-center bg-muted/30 px-4">
      <div className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-sm">
        <div className="pb-5 text-center">
          <h1 className="text-lg font-semibold">Redefinir senha</h1>
          <p className="mt-1 text-xs text-muted-foreground">Crie uma nova senha para acessar o ThermoFit Acas.</p>
        </div>
        {success ? (
          <div className="space-y-4">
            <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              Sua senha foi redefinida. Faça login novamente.
            </p>
            <Link to="/login" className="block text-center text-xs text-muted-foreground hover:text-foreground hover:underline">
              Ir para o login
            </Link>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              if (password.length < 6) return setError("A senha deve ter pelo menos 6 caracteres.");
              if (password !== confirm) return setError("As senhas não coincidem.");
              const { error: updateError } = await supabase.auth.updateUser({ password });
              if (updateError) return setError("Link inválido ou expirado. Solicite uma nova recuperação de senha.");
              await supabase.auth.signOut();
              setSuccess(true);
              setTimeout(() => navigate({ to: "/login" }), 1200);
            }}
          >
            <div className="space-y-1.5">
              <Label className="text-xs">Nova senha</Label>
              <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Confirmar nova senha</Label>
              <Input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</div>}
            <Button type="submit" className="w-full">Salvar nova senha</Button>
          </form>
        )}
      </div>
    </div>
  );
}