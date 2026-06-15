import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Flame } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar — ThermoFit" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { signIn, user } = useAuth();
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      navigate({ to: user.mustChangePassword ? "/trocar-senha" : "/dashboard" });
    }
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
            <div className="text-xs text-muted-foreground">{tenant.systemSubtitle}</div>
          </div>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const r = signIn(email, password);
            if (!r.ok) setError(r.reason ?? "Falha ao entrar.");
          }}
        >
          <div className="space-y-1.5">
            <Label className="text-xs">E-mail</Label>
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Senha</Label>
            <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full">Entrar</Button>

          <div className="text-center">
            <Link to="/esqueci-senha" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
              Esqueci minha senha
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
