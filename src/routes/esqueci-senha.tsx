import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Flame } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/lib/tenant-context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/esqueci-senha")({
  head: () => ({ meta: [{ title: "Recuperar senha — ThermoFit" }] }),
  component: ForgotPage,
});

function ForgotPage() {
  const { tenant } = useTenant();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <div className="grid min-h-screen w-full place-items-center bg-muted/30 px-4">
      <div className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-sm">
        <div className="flex flex-col items-center gap-3 pb-5 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-foreground text-background">
            <Flame className="h-6 w-6" />
          </div>
          <div>
            <div className="text-base font-semibold">{tenant.systemName}</div>
            <div className="text-xs text-muted-foreground">Recuperação de senha</div>
          </div>
        </div>

        {sent ? (
          <div className="space-y-4">
            <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              Se este e-mail estiver cadastrado, você receberá instruções para redefinir sua senha.
            </p>
            <Link to="/login" className="block text-center text-xs text-muted-foreground hover:text-foreground hover:underline">
              Voltar ao login
            </Link>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
                redirectTo: "https://thermofitapp.lovable.app/reset-password",
              });
              setSent(true);
            }}
          >
            <div className="space-y-1.5">
              <Label className="text-xs">E-mail</Label>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Button type="submit" className="w-full">Enviar instruções</Button>
            <Link to="/login" className="block text-center text-xs text-muted-foreground hover:text-foreground hover:underline">
              Voltar ao login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
