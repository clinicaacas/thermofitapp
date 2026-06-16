import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Apple, Dumbbell, Mail, Plus, Trash2, Save } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { toast } from "sonner";
import {
  adminGetNutritionPlan,
  adminSaveNutritionPlan,
  adminGetWorkoutPlan,
  adminSaveWorkoutPlan,
  adminListLetters,
  adminSendLetter,
  adminDeleteLetter,
} from "@/lib/thermofit-data.functions";

export const Route = createFileRoute("/clientes/$id/conteudos")({
  head: () => ({ meta: [{ title: "Conteúdos da cliente — ThermoFit" }] }),
  component: Page,
});

type Tab = "nutricao" | "treino" | "cartas";

function Page() {
  const { id } = Route.useParams();
  const [tab, setTab] = useState<Tab>("nutricao");

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-center gap-3">
          <Link to="/clientes/$id" params={{ id }} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-semibold">Conteúdos da cliente</h1>
        </header>

        <nav className="flex gap-2 border-b border-border">
          <TabBtn active={tab === "nutricao"} onClick={() => setTab("nutricao")} icon={<Apple className="h-4 w-4" />}>
            Nutrição
          </TabBtn>
          <TabBtn active={tab === "treino"} onClick={() => setTab("treino")} icon={<Dumbbell className="h-4 w-4" />}>
            Treino
          </TabBtn>
          <TabBtn active={tab === "cartas"} onClick={() => setTab("cartas")} icon={<Mail className="h-4 w-4" />}>
            Cartas
          </TabBtn>
        </nav>

        {tab === "nutricao" && <NutritionTab clientId={id} />}
        {tab === "treino" && <WorkoutTab clientId={id} />}
        {tab === "cartas" && <LettersTab clientId={id} />}
      </div>
    </AppShell>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm ${
        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

// ============ NUTRIÇÃO ============

type Meal = { name?: string; time?: string; items?: string; calories?: number };

function NutritionTab({ clientId }: { clientId: string }) {
  const get = useServerFn(adminGetNutritionPlan);
  const save = useServerFn(adminSaveNutritionPlan);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-nutrition", clientId],
    queryFn: () => get({ data: { clientId } }),
  });

  const [title, setTitle] = useState("Plano alimentar");
  const [cal, setCal] = useState<string>("");
  const [water, setWater] = useState<string>("");
  const [restrictions, setRestrictions] = useState("");
  const [notes, setNotes] = useState("");
  const [meals, setMeals] = useState<Meal[]>([]);

  useEffect(() => {
    const p = data?.plan;
    if (p) {
      setTitle(p.title ?? "Plano alimentar");
      setCal(p.weekly_calories ? String(p.weekly_calories) : "");
      setWater(p.water_ml ? String(p.water_ml) : "");
      setRestrictions(p.restrictions ?? "");
      setNotes(p.notes ?? "");
      setMeals(Array.isArray(p.meals) ? p.meals : []);
    }
  }, [data]);

  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          clientId,
          title,
          weeklyCalories: cal ? parseInt(cal, 10) : null,
          waterMl: water ? parseInt(water, 10) : null,
          restrictions: restrictions || null,
          notes: notes || null,
          meals,
        },
      }),
    onSuccess: () => {
      toast.success("Plano salvo!");
      qc.invalidateQueries({ queryKey: ["admin-nutrition", clientId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar."),
  });

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-5">
      <Field label="Título">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Calorias / dia">
          <input value={cal} onChange={(e) => setCal(e.target.value)} type="number" className={input} />
        </Field>
        <Field label="Água (ml) / dia">
          <input value={water} onChange={(e) => setWater(e.target.value)} type="number" className={input} />
        </Field>
      </div>
      <Field label="Restrições">
        <textarea value={restrictions} onChange={(e) => setRestrictions(e.target.value)} rows={2} className={input} />
      </Field>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">Refeições</p>
          <button
            type="button"
            onClick={() => setMeals([...meals, { name: "", time: "", items: "" }])}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
          >
            <Plus className="h-3 w-3" /> Adicionar
          </button>
        </div>
        <div className="space-y-2">
          {meals.map((m, idx) => (
            <div key={idx} className="rounded-md border p-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <input
                  placeholder="Nome (ex: Café da manhã)"
                  value={m.name ?? ""}
                  onChange={(e) => updateMeal(setMeals, meals, idx, { name: e.target.value })}
                  className={input}
                />
                <input
                  placeholder="Horário"
                  value={m.time ?? ""}
                  onChange={(e) => updateMeal(setMeals, meals, idx, { time: e.target.value })}
                  className={input}
                />
                <input
                  type="number"
                  placeholder="Calorias"
                  value={m.calories ?? ""}
                  onChange={(e) =>
                    updateMeal(setMeals, meals, idx, {
                      calories: e.target.value ? parseInt(e.target.value, 10) : undefined,
                    })
                  }
                  className={input}
                />
              </div>
              <textarea
                placeholder="Itens"
                value={m.items ?? ""}
                onChange={(e) => updateMeal(setMeals, meals, idx, { items: e.target.value })}
                rows={2}
                className={`mt-2 ${input}`}
              />
              <button
                type="button"
                onClick={() => setMeals(meals.filter((_, i) => i !== idx))}
                className="mt-2 inline-flex items-center gap-1 text-xs text-red-600"
              >
                <Trash2 className="h-3 w-3" /> Remover
              </button>
            </div>
          ))}
        </div>
      </div>

      <Field label="Observações">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={input} />
      </Field>

      <button
        type="button"
        onClick={() => mut.mutate()}
        disabled={mut.isPending}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        <Save className="h-4 w-4" /> {mut.isPending ? "Salvando…" : "Salvar plano"}
      </button>
    </section>
  );
}

function updateMeal<T extends Record<string, unknown>>(
  setter: (v: T[]) => void,
  list: T[],
  idx: number,
  patch: Partial<T>,
) {
  setter(list.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
}

// ============ TREINO ============

type Exercise = { name?: string; sets?: number | string; reps?: string; rest?: string; notes?: string };
type Session = { name?: string; day?: string; focus?: string; exercises?: Exercise[] };

function WorkoutTab({ clientId }: { clientId: string }) {
  const get = useServerFn(adminGetWorkoutPlan);
  const save = useServerFn(adminSaveWorkoutPlan);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-workout", clientId],
    queryFn: () => get({ data: { clientId } }),
  });

  const [title, setTitle] = useState("Plano de treino");
  const [freq, setFreq] = useState<string>("");
  const [dur, setDur] = useState<string>("");
  const [focus, setFocus] = useState("");
  const [notes, setNotes] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    const p = data?.plan;
    if (p) {
      setTitle(p.title ?? "Plano de treino");
      setFreq(p.frequency_per_week ? String(p.frequency_per_week) : "");
      setDur(p.duration_minutes ? String(p.duration_minutes) : "");
      setFocus(p.focus ?? "");
      setNotes(p.notes ?? "");
      setSessions(Array.isArray(p.sessions) ? p.sessions : []);
    }
  }, [data]);

  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          clientId,
          title,
          frequencyPerWeek: freq ? parseInt(freq, 10) : null,
          durationMinutes: dur ? parseInt(dur, 10) : null,
          focus: focus || null,
          notes: notes || null,
          sessions,
        },
      }),
    onSuccess: () => {
      toast.success("Plano salvo!");
      qc.invalidateQueries({ queryKey: ["admin-workout", clientId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar."),
  });

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-5">
      <Field label="Título">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Frequência (x/semana)">
          <input value={freq} onChange={(e) => setFreq(e.target.value)} type="number" className={input} />
        </Field>
        <Field label="Duração (min)">
          <input value={dur} onChange={(e) => setDur(e.target.value)} type="number" className={input} />
        </Field>
        <Field label="Foco">
          <input value={focus} onChange={(e) => setFocus(e.target.value)} className={input} />
        </Field>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">Sessões</p>
          <button
            type="button"
            onClick={() => setSessions([...sessions, { name: "", day: "", exercises: [] }])}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
          >
            <Plus className="h-3 w-3" /> Adicionar sessão
          </button>
        </div>
        <div className="space-y-3">
          {sessions.map((s, sIdx) => (
            <div key={sIdx} className="rounded-md border p-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <input
                  placeholder="Nome (ex: Treino A)"
                  value={s.name ?? ""}
                  onChange={(e) => updateMeal(setSessions, sessions, sIdx, { name: e.target.value })}
                  className={input}
                />
                <input
                  placeholder="Dia"
                  value={s.day ?? ""}
                  onChange={(e) => updateMeal(setSessions, sessions, sIdx, { day: e.target.value })}
                  className={input}
                />
                <input
                  placeholder="Foco"
                  value={s.focus ?? ""}
                  onChange={(e) => updateMeal(setSessions, sessions, sIdx, { focus: e.target.value })}
                  className={input}
                />
              </div>

              <div className="mt-3 space-y-2">
                {(s.exercises ?? []).map((ex, exIdx) => (
                  <div key={exIdx} className="grid gap-2 rounded bg-muted/50 p-2 sm:grid-cols-5">
                    <input
                      placeholder="Exercício"
                      value={ex.name ?? ""}
                      onChange={(e) =>
                        updateSessionExercise(setSessions, sessions, sIdx, exIdx, { name: e.target.value })
                      }
                      className={input}
                    />
                    <input
                      placeholder="Séries"
                      value={ex.sets ?? ""}
                      onChange={(e) =>
                        updateSessionExercise(setSessions, sessions, sIdx, exIdx, { sets: e.target.value })
                      }
                      className={input}
                    />
                    <input
                      placeholder="Reps"
                      value={ex.reps ?? ""}
                      onChange={(e) =>
                        updateSessionExercise(setSessions, sessions, sIdx, exIdx, { reps: e.target.value })
                      }
                      className={input}
                    />
                    <input
                      placeholder="Descanso"
                      value={ex.rest ?? ""}
                      onChange={(e) =>
                        updateSessionExercise(setSessions, sessions, sIdx, exIdx, { rest: e.target.value })
                      }
                      className={input}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateMeal(setSessions, sessions, sIdx, {
                          exercises: (s.exercises ?? []).filter((_, i) => i !== exIdx),
                        })
                      }
                      className="inline-flex items-center justify-center gap-1 rounded-md border px-2 text-xs text-red-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    updateMeal(setSessions, sessions, sIdx, {
                      exercises: [...(s.exercises ?? []), { name: "" }],
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
                >
                  <Plus className="h-3 w-3" /> Exercício
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSessions(sessions.filter((_, i) => i !== sIdx))}
                className="mt-2 inline-flex items-center gap-1 text-xs text-red-600"
              >
                <Trash2 className="h-3 w-3" /> Remover sessão
              </button>
            </div>
          ))}
        </div>
      </div>

      <Field label="Observações">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={input} />
      </Field>

      <button
        type="button"
        onClick={() => mut.mutate()}
        disabled={mut.isPending}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        <Save className="h-4 w-4" /> {mut.isPending ? "Salvando…" : "Salvar plano"}
      </button>
    </section>
  );
}

function updateSessionExercise(
  setter: (v: Session[]) => void,
  list: Session[],
  sIdx: number,
  exIdx: number,
  patch: Partial<Exercise>,
) {
  setter(
    list.map((s, i) =>
      i === sIdx
        ? { ...s, exercises: (s.exercises ?? []).map((ex, j) => (j === exIdx ? { ...ex, ...patch } : ex)) }
        : s,
    ),
  );
}

// ============ CARTAS ============

function LettersTab({ clientId }: { clientId: string }) {
  const list = useServerFn(adminListLetters);
  const send = useServerFn(adminSendLetter);
  const del = useServerFn(adminDeleteLetter);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-letters", clientId],
    queryFn: () => list({ data: { clientId } }),
  });

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const sendMut = useMutation({
    mutationFn: () => send({ data: { clientId, title, body } }),
    onSuccess: () => {
      toast.success("Carta enviada!");
      setTitle("");
      setBody("");
      qc.invalidateQueries({ queryKey: ["admin-letters", clientId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao enviar."),
  });

  const delMut = useMutation({
    mutationFn: (letterId: string) => del({ data: { clientId, letterId } }),
    onSuccess: () => {
      toast.success("Carta removida.");
      qc.invalidateQueries({ queryKey: ["admin-letters", clientId] });
    },
  });

  const letters = data?.letters ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Escrever nova carta</h2>
        <Field label="Título">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
        </Field>
        <Field label="Mensagem">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} className={input} />
        </Field>
        <button
          type="button"
          onClick={() => sendMut.mutate()}
          disabled={sendMut.isPending || !title.trim() || !body.trim()}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          <Mail className="h-4 w-4" /> {sendMut.isPending ? "Enviando…" : "Enviar carta"}
        </button>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold">Cartas enviadas</h2>
        {letters.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma carta ainda.</p>
        ) : (
          <ul className="space-y-2">
            {letters.map((l: any) => (
              <li key={l.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{l.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(l.sent_at).toLocaleString("pt-BR")} ·{" "}
                      {l.read_at ? "lida" : "não lida"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => delMut.mutate(l.id)}
                    className="text-red-600"
                    aria-label="Remover"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-2 line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">
                  {l.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ============ shared ============

const input =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
