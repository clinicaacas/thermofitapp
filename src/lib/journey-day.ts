// Convenção oficial de dias da jornada (mantida compatível com o cálculo atual:
// `release_day = 0` corresponde ao primeiro dia da jornada).
// Apenas a exibição humana soma +1 (Dia 1, Dia 2 …).

import { getClientJourneyDay } from "./journey";

export const PROGRAM_DURATION_DAYS = 84;

export type JourneyStatusComputed = "active" | "completed" | "archived" | "none";

export function resolveJourneyDay(input: {
  startDate?: string | null;
  status?: string | null;
}) {
  const journeyDayIndex = getClientJourneyDay(input.startDate);
  const journeyDayNumber = journeyDayIndex + 1; // exibição humana
  let computed: JourneyStatusComputed = "none";
  if (input.status === "archived") computed = "archived";
  else if (input.status === "completed") computed = "completed";
  else if (input.status === "active") {
    computed = journeyDayIndex >= PROGRAM_DURATION_DAYS ? "completed" : "active";
  }
  return {
    journeyDayIndex,
    journeyDayNumber,
    programDurationDays: PROGRAM_DURATION_DAYS,
    journeyStatus: computed,
  };
}
