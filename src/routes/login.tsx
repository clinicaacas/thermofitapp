import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar — ThermoFit Acas" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { signIn, user } = useAuth();
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
    <div className="min-h-screen w-full px-4 py-10 sm:py-16" style={{ background: "#F3EFE6" }}>
      <div className="mx-auto flex w-full max-w-[520px] flex-col items-center">
        {/* Logo */}
        <div
          className="grid h-16 w-16 place-items-center text-white"
          style={{ background: "#0B111A", borderRadius: 15 }}
        >
          <span className="text-[20px] font-bold tracking-wide">ACAS</span>
        </div>

        {/* Titles */}
        <h1 className="mt-[18px] text-[26px] font-semibold tracking-tight text-[#0B111A]">
          ThermoFit Acas
        </h1>
        <p className="mt-1 text-[14px] text-neutral-500">
          Plano de Voo da Transformação
        </p>

        {/* Card */}
        <div
          className="mt-[34px] w-full rounded-2xl border border-neutral-200 bg-white p-8 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)]"
        >
          <div>
            <h2 className="text-[20px] font-semibold text-[#0B111A]">
              Entrar na sua conta
            </h2>
            <p className="mt-1 text-[14px] text-neutral-500">
              Acesse sua jornada ThermoFit
            </p>
          </div>

          <form
            className="mt-6 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              const r = await signIn(email, password);
              if (!r.ok) setError(r.reason ?? "Falha ao entrar.");
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-[#0B111A]">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-md border-neutral-200 bg-white"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium text-[#0B111A]">
                  Senha
                </Label>
                <Link
                  to="/esqueci-senha"
                  className="text-[13px] text-[#2563EB] hover:underline"
                >
                  Esqueci minha senha
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-md border-neutral-200 bg-white"
              />
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="h-12 w-full rounded-md text-[15px] font-semibold text-white transition-colors hover:bg-[#1D4FD8]"
              style={{ background: "#2563EB" }}
            >
              Entrar
            </button>
          </form>

          <div className="mt-6 text-center text-[12px] text-neutral-500">
            Clínica Acas — Sistema ThermoFit
          </div>
        </div>
      </div>
    </div>
  );
}
