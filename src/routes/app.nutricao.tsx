import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Apple, Flame, Droplet, AlertCircle, Clock } from "lucide-react";
import { ClientAppShell } from "@/components/client-app-shell";
import { getClientNutritionPlan } from "@/lib/thermofit-client-app.functions";

export const Route = createFileRoute("/app/nutricao")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

type Meal = {
  name?: string;
  time?: string;
  items?: string;
  calories?: number;
};

function Page() {
  const { clientId } = useSearch({ from: "/app/nutricao" });
  const fetchPlan = useServerFn(getClientNutritionPlan);
  const { data, isLoading } = useQuery({
    queryKey: ["client-nutrition", clientId],
    queryFn: () => fetchPlan({ data: { clientId } }),
    enabled: !!clientId,
  });

  const plan = data?.plan;
  const meals = (plan?.meals ?? []) as Meal[];

  return (
    <ClientAppShell title="Nutrição" subtitle="Seu plano alimentar personalizado">
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
            <Apple className="h-6 w-6" style={{ color: "#8A6A3D" }} />
          </div>
          <p className="text-sm font-semibold" style={{ color: "#1F2933" }}>
            Plano em preparação
          </p>
          <p className="mt-1 text-xs" style={{ color: "#6B7280" }}>
            Sua nutricionista ainda não publicou um plano. Em breve aparecerá aqui.
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
                <Apple className="h-4 w-4" style={{ color: "#8A6A3D" }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold tracking-wider" style={{ color: "#8A6A3D" }}>
                  PLANO ATUAL
                </p>
                <p className="text-base font-semibold" style={{ color: "#1F2933" }}>
                  {plan.title}
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Metric
                icon={<Flame className="h-3.5 w-3.5" style={{ color: "#D97706" }} />}
                label="Calorias / dia"
                value={plan.weekly_calories ? `${plan.weekly_calories} kcal` : "—"}
                bg="#FEF3C7"
              />
              <Metric
                icon={<Droplet className="h-3.5 w-3.5" style={{ color: "#2F80ED" }} />}
                label="Água / dia"
                value={plan.water_ml ? `${(plan.water_ml / 1000).toFixed(1).replace(".", ",")}L` : "—"}
                bg="#DCEEFF"
              />
            </div>
          </section>

          {plan.restrictions && (
            <section
              className="mt-3 rounded-2xl p-4"
              style={{ background: "#FEF3C7", border: "1px solid #FCD34D" }}
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" style={{ color: "#92400E" }} />
                <div>
                  <p className="text-xs font-semibold" style={{ color: "#92400E" }}>
                    Restrições
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: "#78350F" }}>
                    {plan.restrictions}
                  </p>
                </div>
              </div>
            </section>
          )}

          <p className="mt-5 text-[10px] font-semibold tracking-wider" style={{ color: "#6B7280" }}>
            REFEIÇÕES DO DIA
          </p>
          <section className="mt-2 space-y-2">
            {meals.length === 0 ? (
              <p className="rounded-2xl bg-white p-4 text-xs" style={{ border: "1px solid #E5E0D8", color: "#6B7280" }}>
                Nenhuma refeição cadastrada ainda.
              </p>
            ) : (
              meals.map((meal, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl bg-white p-3"
                  style={{ border: "1px solid #E5E0D8" }}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold" style={{ color: "#1F2933" }}>
                      {meal.name || `Refeição ${idx + 1}`}
                    </p>
                    {meal.time && (
                      <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "#8A6A3D" }}>
                        <Clock className="h-3 w-3" />
                        {meal.time}
                      </span>
                    )}
                  </div>
                  {meal.items && (
                    <p className="mt-1 whitespace-pre-line text-xs" style={{ color: "#4B5563" }}>
                      {meal.items}
                    </p>
                  )}
                  {meal.calories ? (
                    <p className="mt-1 text-[11px]" style={{ color: "#6B7280" }}>
                      {meal.calories} kcal
                    </p>
                  ) : null}
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
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  bg: string;
}) {
  return (
    <div className="rounded-xl p-3" style={{ background: bg }}>
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
