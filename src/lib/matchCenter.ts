import { GROUP_MATCHES, KNOCKOUT_MATCHES } from "../data";
import { resolveKnockoutMatch, KNOCKOUT_STRUCTURE } from "./bracketTree";
import { TEAM_BY_CODE } from "./teams";
import type { Period, PeriodMatchStatus } from "./periods";
import type { StoredResults, TeamCode } from "./types";

export interface MatchCenterEntry {
  id: string;
  periodId: string;
  isKnockout: boolean;
  date: string;
  homeCode: TeamCode | null; // null = not yet determined (future knockout round, feeder match undecided)
  awayCode: TeamCode | null;
  homeName: string;
  awayName: string;
  played: boolean;
  homeGoals?: number;
  awayGoals?: number;
  penaltyWinner?: "home" | "away";
}

// Hyphenated in KNOCKOUT_MATCHES/fixtures.ts vs unhyphenated in bracketTree.ts —
// two different pre-existing conventions in this codebase, mapped explicitly here.
const ROUND_TO_PERIOD: Record<string, string> = {
  "Round of 32": "r32",
  "Round of 16": "r16",
  "Quarter-final": "qf",
  "Semi-final": "sf",
  Final: "final",
};

function dateRangeFor(dates: string[]): { startDate?: string; endDate?: string } {
  if (dates.length === 0) return {};
  const sorted = [...dates].sort();
  return { startDate: sorted[0], endDate: sorted[sorted.length - 1] };
}

export function getWorldCupPeriods(): Period[] {
  const periods: Period[] = [];
  for (const md of [1, 2, 3]) {
    const dates = GROUP_MATCHES.filter((m) => m.matchday === md).map((m) => m.date);
    periods.push({ id: `md${md}`, label: `Matchday ${md}`, order: md, ...dateRangeFor(dates) });
  }
  const roundOrder = [
    { id: "r32", label: "Round of 32", order: 4, round: "Round of 32" },
    { id: "r16", label: "Round of 16", order: 5, round: "Round of 16" },
    { id: "qf", label: "Quarterfinals", order: 6, round: "Quarter-final" },
    { id: "sf", label: "Semifinals", order: 7, round: "Semi-final" },
    { id: "final", label: "Final", order: 8, round: "Final" },
  ];
  for (const r of roundOrder) {
    const dates = KNOCKOUT_MATCHES.filter((m) => m.round === r.round).map((m) => m.date);
    periods.push({ id: r.id, label: r.label, order: r.order, ...dateRangeFor(dates) });
  }
  return periods;
}

export function buildMatchCenterEntries(stored: StoredResults): MatchCenterEntry[] {
  const entries: MatchCenterEntry[] = [];

  for (const m of GROUP_MATCHES) {
    const result = stored.matches[m.id];
    entries.push({
      id: m.id,
      periodId: `md${m.matchday}`,
      isKnockout: false,
      date: m.date,
      homeCode: m.home,
      awayCode: m.away,
      homeName: TEAM_BY_CODE[m.home]?.name ?? m.home,
      awayName: TEAM_BY_CODE[m.away]?.name ?? m.away,
      played: !!result,
      homeGoals: result?.homeGoals,
      awayGoals: result?.awayGoals,
    });
  }

  for (const m of KNOCKOUT_MATCHES) {
    const periodId = ROUND_TO_PERIOD[m.round];
    if (!periodId || !(m.id in KNOCKOUT_STRUCTURE)) continue;
    const result = stored.knockoutMatches?.[m.id];
    const { home, away } = resolveKnockoutMatch(m.id, stored);
    entries.push({
      id: m.id,
      periodId,
      isKnockout: true,
      date: m.date,
      homeCode: home,
      awayCode: away,
      homeName: home ? TEAM_BY_CODE[home]?.name ?? home : "TBD",
      awayName: away ? TEAM_BY_CODE[away]?.name ?? away : "TBD",
      played: !!result,
      homeGoals: result?.homeGoals,
      awayGoals: result?.awayGoals,
      penaltyWinner: result?.penaltyWinner,
    });
  }

  return entries;
}

export function getPeriodStatuses(entries: MatchCenterEntry[], periods: Period[]): PeriodMatchStatus[] {
  return periods.map((period) => {
    const inPeriod = entries.filter((e) => e.periodId === period.id);
    const playedCount = inPeriod.filter((e) => e.played).length;
    return {
      periodId: period.id,
      hasStarted: playedCount > 0,
      isComplete: inPeriod.length > 0 && playedCount === inPeriod.length,
    };
  });
}