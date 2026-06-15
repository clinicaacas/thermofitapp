import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Flame } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";

export const Route = createFileRoute("/trocar-senha")({
  head: () => ({ meta: [{ title: "Alterar senha — ThermoFit" }] }),
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const { user, changePassword } = useAuth();
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) navigate({ to: "/login" });
  }, [user, navigate]);

  return (
    <div className="grid min-h-screen w-full place-items-center bg-muted/30 px-4">
      <div className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-sm">
        <div className="flex flex-col items-center gap-3 pb-5 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-foreground text-background">
            <Flame className="h-6 w-6" />
          </div>
          <div>
            <div className="text-base font-semibold">{tenant.systemName}</div>
            <div className="text-xs text-muted-foreground">Defina sua nova senha de acesso</div>
          </div>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (p1.length < 6) return setError("A senha deve ter pelo menos 6 caracteres.");
            if (p1 !== p2) return setError("As senhas não coincidem.");
            changePassword(p1);
            navigate({ to: "/dashboard" });
          }}
        >
          <div className="space-y-1.5">
            <Label className="text-xs">Nova senha</Label>
            <Input type="password" required value={p1} onChange={(e) => setP1(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Confirmar nova senha</Label>
            <Input type="password" required value={p2} onChange={(e) => setP2(e.target.value)} />
          </div>
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </div>
          )}
          <Button type="submit" className="w-full">Salvar nova senha</Button>
        </form>
      </div>
    </div>
  );
}
