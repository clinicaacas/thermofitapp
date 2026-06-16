import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { ClientAppShell } from "@/components/client-app-shell";
import {
  logVacuumSession,
  listVacuumSessions,
} from "@/lib/thermofit-client-app.functions";
import { Activity, Play, Pause, RotateCcw, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/app/vacuum")({
  validateSearch: (s: Record<string, unknown>) => ({ clientId: (s.clientId as string) || "" }),
  component: Page,
});

type Phase = { key: "inhale" | "exhale" | "hold" | "rest"; label: string; seconds: number };

const ROUND_OPTIONS = [5, 8, 10];
const HOLD_OPTIONS = [10, 15, 20];

function buildSequence(holdSec: number): Phase[] {
  return [
    { key: "inhale", label: "Inspire pelo nariz", seconds: 4 },
    { key: "exhale", label: "Solte todo o ar", seconds: 4 },
    { key: "hold", label: "Contraia o abdômen", seconds: holdSec },
    { key: "rest", label: "Respire e relaxe", seconds: 6 },
  ];
}

function Page() {
  const { clientId } = useSearch({ from: "/app/vacuum" });
  const qc = useQueryClient();
  const log = useServerFn(logVacuumSession);
  const fetchSessions = useServerFn(listVacuumSessions);

  const [tab, setTab] = useState<"praticar" | "guia">("praticar");
  const { data } = useQuery({
    queryKey: ["client-vacuum", clientId],
    queryFn: () => fetchSessions({ data: { clientId } }),
    enabled: !!clientId,
  });

  const logMut = useMutation({
    mutationFn: (vars: { rounds: number; totalSeconds: number }) =>
      log({ data: { clientId, rounds: vars.rounds, totalSeconds: vars.totalSeconds } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-vacuum", clientId] }),
  });

  return (
    <ClientAppShell title="Cintura Ativa" subtitle="Core de dentro pra fora">
      <div className="space-y-4">
        <div className="flex rounded-full border border-[#E5D6BD] bg-white p-1">
          {(["praticar", "guia"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-full py-2 text-sm font-medium capitalize transition ${
                tab === t ? "bg-[#8A6A3D] text-white" : "text-[#5C4528]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "praticar" ? (
          <Practice
            onFinish={(rounds, secs) => logMut.mutate({ rounds, totalSeconds: secs })}
            justSaved={logMut.isSuccess}
            resetSaved={() => logMut.reset()}
          />
        ) : (
          <Guide />
        )}

        <div className="rounded-2xl border border-[#E5D6BD] bg-white p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7A6A52]">
            Suas sessões
          </p>
          <div className="mb-3 grid grid-cols-2 gap-2 text-center">
            <Stat label="Sessões" value={String(data?.sessions?.length ?? 0)} />
            <Stat
              label="Rounds totais"
              value={String(data?.totalRounds ?? 0)}
            />
          </div>
          {(data?.sessions?.length ?? 0) === 0 ? (
            <p className="text-sm text-[#7A6A52]">Nenhuma sessão registrada ainda.</p>
          ) : (
            <ul className="divide-y divide-[#F3E8D2]">
              {data!.sessions.map((s: any) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-[#3D2E1C]">
                    {s.rounds} rounds · {Math.round(s.total_seconds / 60)} min
                  </span>
                  <span className="text-xs text-[#7A6A52]">
                    {new Date(s.performed_at).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ClientAppShell>
  );
}

function Practice({
  onFinish,
  justSaved,
  resetSaved,
}: {
  onFinish: (rounds: number, totalSeconds: number) => void;
  justSaved: boolean;
  resetSaved: () => void;
}) {
  const [rounds, setRounds] = useState(8);
  const [holdSec, setHoldSec] = useState(15);
  const [running, setRunning] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [roundIdx, setRoundIdx] = useState(0);
  const [tick, setTick] = useState(0);
  const [done, setDone] = useState(false);
  const startRef = useRef<number | null>(null);

  const sequence = buildSequence(holdSec);
  const phase = sequence[phaseIdx];

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    if (tick < phase.seconds) return;
    setTick(0);
    if (phaseIdx < sequence.length - 1) {
      setPhaseIdx((i) => i + 1);
    } else if (roundIdx < rounds - 1) {
      setRoundIdx((r) => r + 1);
      setPhaseIdx(0);
    } else {
      setRunning(false);
      setDone(true);
      const elapsed = startRef.current
        ? Math.round((Date.now() - startRef.current) / 1000)
        : 0;
      onFinish(rounds, elapsed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  function start() {
    setDone(false);
    resetSaved();
    setPhaseIdx(0);
    setRoundIdx(0);
    setTick(0);
    startRef.current = Date.now();
    setRunning(true);
  }
  function stop() {
    setRunning(false);
  }
  function reset() {
    setRunning(false);
    setDone(false);
    setPhaseIdx(0);
    setRoundIdx(0);
    setTick(0);
    resetSaved();
  }

  const totalPhase = phase.seconds;
  const left = Math.max(0, totalPhase - tick);
  const pct = totalPhase ? (tick / totalPhase) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-[#E5D6BD] bg-white p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#7A6A52]">
            Rounds
          </p>
          <div className="flex gap-2">
            {ROUND_OPTIONS.map((r) => (
              <button
                key={r}
                disabled={running}
                onClick={() => setRounds(r)}
                className={`flex-1 rounded-full py-1.5 text-xs font-semibold transition ${
                  rounds === r
                    ? "bg-[#8A6A3D] text-white"
                    : "border border-[#E5D6BD] bg-white text-[#5C4528]"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-[#E5D6BD] bg-white p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#7A6A52]">
            Contração (s)
          </p>
          <div className="flex gap-2">
            {HOLD_OPTIONS.map((h) => (
              <button
                key={h}
                disabled={running}
                onClick={() => setHoldSec(h)}
                className={`flex-1 rounded-full py-1.5 text-xs font-semibold transition ${
                  holdSec === h
                    ? "bg-[#8A6A3D] text-white"
                    : "border border-[#E5D6BD] bg-white text-[#5C4528]"
                }`}
              >
                {h}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-[#E5D6BD] bg-gradient-to-br from-[#F8F1E6] to-[#F3E8D2] p-6 text-center">
        <div className="relative mx-auto h-48 w-48">
          <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
            <circle cx="50" cy="50" r="46" fill="none" stroke="#E5D6BD" strokeWidth="4" />
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="#8A6A3D"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 46}
              strokeDashoffset={2 * Math.PI * 46 * (1 - pct / 100)}
              className="transition-all duration-1000 ease-linear"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <Activity className="h-6 w-6 text-[#8A6A3D]" />
            <p className="mt-1 text-4xl font-bold text-[#3D2E1C]">{left}</p>
            <p className="text-[10px] uppercase tracking-wide text-[#7A6A52]">segundos</p>
          </div>
        </div>
        <p className="mt-4 text-base font-semibold text-[#3D2E1C]">{phase.label}</p>
        <p className="text-xs text-[#7A6A52]">
          Round {roundIdx + 1} de {rounds}
        </p>
      </div>

      {done && justSaved && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4" /> Sessão registrada!
        </div>
      )}

      <div className="flex gap-2">
        {!running ? (
          <button
            onClick={start}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-[#8A6A3D] py-3 text-sm font-semibold text-white"
          >
            <Play className="h-4 w-4" /> {done ? "Praticar de novo" : "Começar"}
          </button>
        ) : (
          <button
            onClick={stop}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-[#8A6A3D] py-3 text-sm font-semibold text-[#5C4528]"
          >
            <Pause className="h-4 w-4" /> Pausar
          </button>
        )}
        <button
          onClick={reset}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-[#E5D6BD] bg-white px-4 py-3 text-sm font-semibold text-[#5C4528]"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Guide() {
  const steps = [
    "Em pé ou em quatro apoios, coluna alinhada e ombros relaxados.",
    "Inspire profundamente pelo nariz, expandindo a barriga.",
    "Solte todo o ar pela boca, esvaziando totalmente os pulmões.",
    "Em apneia (sem ar), puxe o umbigo em direção à coluna e segure.",
    "Mantenha a contração pelo tempo escolhido — sem prender com força.",
    "Solte, respire normalmente e descanse antes do próximo round.",
  ];
  return (
    <div className="rounded-2xl border border-[#E5D6BD] bg-white p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#7A6A52]">
        Como praticar
      </p>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-sm text-[#3D2E1C]">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#8A6A3D] text-xs font-bold text-white">
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 rounded-lg bg-[#F8F1E6] p-3 text-xs text-[#5C4528]">
        Dica: pratique em jejum, ou no mínimo 2h após comer. Comece com 5 rounds de 10s e
        evolua aos poucos.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#F8F1E6] p-2">
      <p className="text-lg font-bold text-[#3D2E1C]">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-[#7A6A52]">{label}</p>
    </div>
  );
}
