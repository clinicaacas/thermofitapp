// Convenção oficial de dias da jornada.
// `journeyDayIndex` = dias transcorridos desde o início (0 no primeiro dia).
// `journeyDayNumber` = número humano do dia (1 no primeiro dia) — é o valor que casa
// diretamente com `videos.release_day` (1-indexado). release_day = 0 é conteúdo inicial.

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
