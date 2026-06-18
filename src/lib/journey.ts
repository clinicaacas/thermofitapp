// Calcula o dia da jornada da cliente baseado na data de início, em America/Sao_Paulo.
// Dia 0 = mesmo dia que a data de início. Dia 1 = dia seguinte. Etc.

const TZ = "America/Sao_Paulo";

function ymdInSP(d: Date): { y: number; m: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get("year"), m: get("month"), day: get("day") };
}

function toUTCDateOnly(y: number, m: number, day: number): number {
  return Date.UTC(y, m - 1, day);
}

export function getClientJourneyDay(startDate: string | Date | null | undefined): number {
  if (!startDate) return 0;
  const start =
    typeof startDate === "string"
      ? // 'YYYY-MM-DD' ou ISO — interpreta como meia-noite local SP
        new Date(`${startDate.length >= 10 ? startDate.slice(0, 10) : startDate}T12:00:00-03:00`)
      : startDate;
  if (isNaN(start.getTime())) return 0;

  const s = ymdInSP(start);
  const t = ymdInSP(new Date());
  const startMs = toUTCDateOnly(s.y, s.m, s.day);
  const todayMs = toUTCDateOnly(t.y, t.m, t.day);
  const diff = Math.floor((todayMs - startMs) / (24 * 60 * 60 * 1000));
  return Math.max(0, diff);
}
