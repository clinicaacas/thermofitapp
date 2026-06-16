import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dumbbell, Calendar, Clock, Target } from "lucide-react";
import { ClientAppShell } from "@/components/client-app-shell";
import { getClientWorkoutPlan } from "@/lib/thermofit-client-app.functions";

export const Route = createFileRoute("/app/treino")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

type Exercise = {
  name?: string;
  sets?: number | string;
  reps?: string;
  rest?: string;
  notes?: string;
};

type Session = {
  name?: string;
  day?: string;
  focus?: string;
  exercises?: Exercise[];
};

function Page() {
  const { clientId } = useSearch({ from: "/app/treino" });
  const fetchPlan = useServerFn(getClientWorkoutPlan);
  const { data, isLoading } = useQuery({
    queryKey: ["client-workout", clientId],
    queryFn: () => fetchPlan({ data: { clientId } }),
    enabled: !!clientId,
  });

  const plan = data?.plan;
  const sessions = (plan?.sessions ?? []) as Session[];

  return (
    <ClientAppShell title="Treino" subtitle="Seu plano de treino personalizado">
      {isLoading ? (
        <p className="text-sm" style={{ color: "#6B7280" }}>Carregando…</p>
      ) : !plan ? (
        <section
          className="rounded-2xl bg-white p-6 text-center"
          style={{ border: "1px solid #E5E0D8" }}
        >
          <div
            className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl"
            style={{ background: "#F3E8D2" }}
          >
            <Dumbbell className="h-6 w-6" style={{ color: "#8A6A3D" }} />
          </div>
          <p className="text-sm font-semibold" style={{ color: "#1F2933" }}>
            Plano em preparação
          </p>
          <p className="mt-1 text-xs" style={{ color: "#6B7280" }}>
            Sua treinadora ainda não publicou um plano. Em breve aparecerá aqui.
          </p>
        </section>
      ) : (
        <>
          <section
            className="rounded-2xl bg-white p-4"
            style={{ border: "1px solid #E5E0D8" }}
          >
            <div className="flex items-start gap-3">
              <div
                className="grid h-10 w-10 place-items-center rounded-xl"
                style={{ background: "#F3E8D2" }}
              >
                <Dumbbell className="h-4 w-4" style={{ color: "#8A6A3D" }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold tracking-wider" style={{ color: "#8A6A3D" }}>
                  PLANO ATUAL
                </p>
                <p className="text-base font-semibold" style={{ color: "#1F2933" }}>
                  {plan.title}
                </p>
                {plan.focus && (
                  <p className="text-xs" style={{ color: "#6B7280" }}>
                    Foco: {plan.focus}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Metric
                icon={<Calendar className="h-3.5 w-3.5" style={{ color: "#8A6A3D" }} />}
                label="Frequência"
                value={plan.frequency_per_week ? `${plan.frequency_per_week}x / semana` : "—"}
              />
              <Metric
                icon={<Clock className="h-3.5 w-3.5" style={{ color: "#8A6A3D" }} />}
                label="Duração"
                value={plan.duration_minutes ? `${plan.duration_minutes} min` : "—"}
              />
            </div>
          </section>

          <p className="mt-5 text-[10px] font-semibold tracking-wider" style={{ color: "#6B7280" }}>
            SESSÕES
          </p>
          <section className="mt-2 space-y-2">
            {sessions.length === 0 ? (
              <p className="rounded-2xl bg-white p-4 text-xs" style={{ border: "1px solid #E5E0D8", color: "#6B7280" }}>
                Nenhuma sessão cadastrada ainda.
              </p>
            ) : (
              sessions.map((session, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl bg-white p-3"
                  style={{ border: "1px solid #E5E0D8" }}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold" style={{ color: "#1F2933" }}>
                      {session.name || `Sessão ${idx + 1}`}
                    </p>
                    {session.day && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ background: "#F3E8D2", color: "#8A6A3D" }}
                      >
                        {session.day}
                      </span>
                    )}
                  </div>
                  {session.focus && (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[11px]" style={{ color: "#6B7280" }}>
                      <Target className="h-3 w-3" />
                      {session.focus}
                    </p>
                  )}
                  {Array.isArray(session.exercises) && session.exercises.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {session.exercises.map((ex, exIdx) => (
                        <li
                          key={exIdx}
                          className="rounded-lg p-2"
                          style={{ background: "#FAF5EC" }}
                        >
                          <p className="text-xs font-semibold" style={{ color: "#1F2933" }}>
                            {ex.name || `Exercício ${exIdx + 1}`}
                          </p>
                          <p className="mt-0.5 text-[11px]" style={{ color: "#6B7280" }}>
                            {[
                              ex.sets ? `${ex.sets} séries` : null,
                              ex.reps ? `${ex.reps} reps` : null,
                              ex.rest ? `descanso ${ex.rest}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          {ex.notes && (
                            <p className="mt-0.5 text-[11px] italic" style={{ color: "#8A6A3D" }}>
                              {ex.notes}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            )}
          </section>

          {plan.notes && (
            <section
              className="mt-3 rounded-2xl bg-white p-4"
              style={{ border: "1px solid #E5E0D8" }}
            >
              <p className="text-[10px] font-semibold tracking-wider" style={{ color: "#8A6A3D" }}>
                OBSERVAÇÕES
              </p>
              <p className="mt-1 whitespace-pre-line text-xs" style={{ color: "#4B5563" }}>
                {plan.notes}
              </p>
            </section>
          )}
        </>
      )}
    </ClientAppShell>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl p-3" style={{ background: "#FAF5EC" }}>
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="text-[10px] font-semibold tracking-wider" style={{ color: "#6B7280" }}>
          {label}
        </p>
      </div>
      <p className="mt-1 text-sm font-bold" style={{ color: "#1F2933" }}>
        {value}
      </p>
    </div>
  );
}
