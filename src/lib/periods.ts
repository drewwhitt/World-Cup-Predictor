/**
 * A "period" is the shared abstraction behind both the round filter and
 * the default "what's happening now" view — a World Cup Matchday or
 * Round, an NFL Week or playoff round, a Premier League Matchweek. Each
 * sport supplies its own ordered list; the Match Center's UI and the
 * "which period is current" logic are the same regardless of sport.
 */
export interface Period {
  id: string;
  label: string;
  order: number;
  /** Real date range for display purposes only — NOT used to decide the current period (see getCurrentPeriodId). */
  startDate?: string;
  endDate?: string;
}

export interface PeriodMatchStatus {
  periodId: string;
  /** True once every match assigned to this period has a real result recorded. */
  isComplete: boolean;
  /** True if at least one match in this period has a result recorded. */
  hasStarted: boolean;
}

/**
 * The current period is the first one (in order) that isn't fully
 * decided yet — completion-based, not calendar-based. This matches how
 * an admin-driven, enter-results-after-the-fact workflow actually
 * behaves: a period doesn't roll over just because a calendar date
 * passed, it rolls over once its last match is actually recorded. If a
 * result comes in a little late, the app doesn't prematurely jump ahead
 * — and if every period is complete (tournament over), the last one
 * (e.g. the Final) stays "current."
 */
export function getCurrentPeriodId(periods: Period[], statuses: PeriodMatchStatus[]): string {
  const byId = new Map(statuses.map((s) => [s.periodId, s]));
  const sorted = [...periods].sort((a, b) => a.order - b.order);
  for (const period of sorted) {
    const status = byId.get(period.id);
    if (!status || !status.isComplete) return period.id;
  }
  return sorted[sorted.length - 1]?.id ?? "";
}