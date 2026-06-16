import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ClientAppShell } from "@/components/client-app-shell";
import {
  getCurrentPulse,
  submitPulse,
  listPulseHistory,
} from "@/lib/thermofit-client-app.functions";
import { HeartPulse, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/app/pulso")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

const SCALES: { key: "mood" | "energy" | "hunger" | "sleep"; label: string; emojis: string[] }[] = [
  { key: "mood", label: "Humor", emojis: ["😞", "😕", "😐", "🙂", "😄"] },
  { key: "energy", label: "Energia", emojis: ["🪫", "🔋", "🔋", "⚡", "⚡"] },
  { key: "hunger", label: "Fome", emojis: ["🍽️", "🍽️", "🥗", "🥗", "🍎"] },
  { key: "sleep", label: "Sono", emojis: ["😴", "🥱", "😌", "💤", "🌟"] },
];

function fmtWeek(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function Page() {
  const { clientId } = useSearch({ from: "/app/pulso" });
  const qc = useQueryClient();
  const fetchCurrent = useServerFn(getCurrentPulse);
  const submit = useServerFn(submitPulse);
  const fetchHistory = useServerFn(listPulseHistory);

  const { data: current } = useQuery({
    queryKey: ["client-pulse-current", clientId],
    queryFn: () => fetchCurrent({ data: { clientId } }),
    enabled: !!clientId,
  });
  const { data: historyData } = useQuery({
    queryKey: ["client-pulse-history", clientId],
    queryFn: () => fetchHistory({ data: { clientId } }),
    enabled: !!clientId,
  });

  const [form, setForm] = useState({ mood: 3, energy: 3, hunger: 3, sleep: 3, notes: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (current?.pulse) {
      const p = current.pulse;
      setForm({
        mood: p.mood,
        energy: p.energy,
        hunger: p.hunger,
        sleep: p.sleep,
        notes: p.notes ?? "",
      });
    }
  }, [current?.pulse]);

  const mut = useMutation({
    mutationFn: () =>
      submit({
        data: {
          clientId,
          mood: form.mood,
          energy: form.energy,
          hunger: form.hunger,
          sleep: form.sleep,
          notes: form.notes.trim() || null,
        },
      }),
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: ["client-pulse-current", clientId] });
      qc.invalidateQueries({ queryKey: ["client-pulse-history", clientId] });
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const history = historyData?.history ?? [];
  const weekLabel = current?.weekStart ? fmtWeek(current.weekStart) : "";

  return (
    <ClientAppShell title="Pulso semanal" subtitle="Como você está se sentindo nesta semana?">
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl border border-[#E5D6BD] bg-gradient-to-br from-[#F8F1E6] to-[#F3E8D2] p-4">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-[#8A6A3D] text-white">
            <HeartPulse className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#7A6A52]">
              Semana de {weekLabel}
            </p>
            <p className="text-sm font-medium text-[#3D2E1C]">
              {current?.pulse ? "Você já registrou — pode atualizar quando quiser." : "Faça seu check-in da semana."}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {SCALES.map((s) => (
            <div key={s.key} className="rounded-2xl border border-[#E5D6BD] bg-white p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7A6A52]">
                {s.label}
              </p>
              <div className="flex justify-between gap-2">
                {[1, 2, 3, 4, 5].map((v) => {
                  const active = form[s.key] === v;
                  return (
                    <button
                      key={v}
                      onClick={() => setForm((f) => ({ ...f, [s.key]: v }))}
                      className={`flex h-14 flex-1 flex-col items-center justify-center rounded-xl border text-xl transition ${
                        active
                          ? "border-[#8A6A3D] bg-[#F8F1E6] text-[#3D2E1C]"
                          : "border-[#E5D6BD] bg-white text-[#7A6A52]"
                      }`}
                    >
                      <span>{s.emojis[v - 1]}</span>
                      <span className="mt-0.5 text-[10px]">{v}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-[#E5D6BD] bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7A6A52]">
            Algo a contar? (opcional)
          </p>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            maxLength={500}
            rows={3}
            placeholder="Conta pra equipe como foi sua semana…"
            className="w-full resize-none rounded-lg border border-[#E5D6BD] bg-white p-2 text-sm text-[#3D2E1C] focus:border-[#8A6A3D] focus:outline-none"
          />
          <p className="mt-1 text-right text-[10px] text-[#7A6A52]">{form.notes.length}/500</p>
        </div>

        {saved && (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4" /> Pulso registrado!
          </div>
        )}

        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          className="w-full rounded-full bg-[#8A6A3D] py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {mut.isPending ? "Salvando…" : current?.pulse ? "Atualizar pulso" : "Enviar pulso"}
        </button>

        {history.length > 0 && (
          <div className="rounded-2xl border border-[#E5D6BD] bg-white p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7A6A52]">
              Histórico
            </p>
            <ul className="divide-y divide-[#F3E8D2]">
              {history.map((h: any) => (
                <li key={h.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-medium text-[#3D2E1C]">Semana de {fmtWeek(h.week_start)}</span>
                  <span className="text-xs text-[#7A6A52]">
                    😊 {h.mood} · ⚡ {h.energy} · 🍽️ {h.hunger} · 💤 {h.sleep}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ClientAppShell>
  );
}
