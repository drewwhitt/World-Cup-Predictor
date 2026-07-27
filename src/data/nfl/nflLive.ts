/**
 * nflLive.ts
 * Mirrors veridexLive.ts's role for the World Cup: the one place that
 * turns raw NFL data files into what the views actually render.
 *
 * There's no live-results pipeline yet (manual entry, like the World
 * Cup's admin panel, is the planned next step) — so `stored` defaults to
 * empty and every game reports as unplayed. Once results start coming
 * in, buildNflMatchCenter/buildNflPeriodStatuses already accept a
 * results map and will report real progress without changes here.
 */
import baseline from "./baseline-2026.json";
import scheduleRaw from "./schedule-2026.json";
import { NFL_TEAMS, NFL_TEAM_BY_CODE, type NFLTeam } from "./teams";
import type { Period, PeriodMatchStatus } from "../../lib/periods";

export interface NflGame {
  id: string;
  type: string; // REG | WC | DIV | CON | SB
  week: number;
  date: string;
  time: string;
  home: string;
  away: string;
  neutral: boolean;
  div: boolean;
}

export type StoredNflResults = Record<string, { homeScore: number; awayScore: number }>;

export interface NflTeamRating extends NFLTeam {
  elo: number;
  rating: number;
}

export interface NflMatchEntry extends NflGame {
  periodId: string;
  periodLabel: string;
  homeName: string;
  awayName: string;
  played: boolean;
  homeScore?: number;
  awayScore?: number;
}

const PLAYOFF_LABELS: Record<string, string> = {
  WC: "Wild Card",
  DIV: "Divisional Round",
  CON: "Conference Championship",
  SB: "Super Bowl",
};

export const NFL_SCHEDULE: NflGame[] = scheduleRaw as NflGame[];

function periodIdForGame(game: Pick<NflGame, "week" | "type">): string {
  return game.type === "REG" ? `week-${game.week}` : game.type.toLowerCase();
}

function periodLabelForGame(game: Pick<NflGame, "week" | "type">): string {
  return game.type === "REG" ? `Week ${game.week}` : (PLAYOFF_LABELS[game.type] ?? game.type);
}

export const NFL_PERIODS: Period[] = (() => {
  const seen = new Map<string, Period>();
  for (const game of NFL_SCHEDULE) {
    const id = periodIdForGame(game);
    if (!seen.has(id)) {
      seen.set(id, { id, label: periodLabelForGame(game), order: game.week });
    }
  }
  return [...seen.values()].sort((a, b) => a.order - b.order);
})();

/** Same shape of curve as the World Cup's ratingFromElo — a 0-100 display rating, not a probability. */
function ratingFromElo(elo: number): number {
  return Number(Math.max(55, Math.min(96, (elo - 1300) / 8)).toFixed(1));
}

export function fullTeamName(code: string): string {
  const t = NFL_TEAM_BY_CODE[code];
  return t ? `${t.city} ${t.name}` : code;
}

export function buildNflTeams(): NflTeamRating[] {
  const eloByCode = new Map(baseline.elos.map((r) => [r.code, r.elo]));
  return NFL_TEAMS
    .map((t) => {
      const elo = eloByCode.get(t.code) ?? 1505;
      return { ...t, elo, rating: ratingFromElo(elo) };
    })
    .sort((a, b) => b.elo - a.elo);
}

export function buildNflMatchCenter(stored: StoredNflResults = {}): NflMatchEntry[] {
  return NFL_SCHEDULE.map((game) => {
    const result = stored[game.id];
    return {
      ...game,
      periodId: periodIdForGame(game),
      periodLabel: periodLabelForGame(game),
      homeName: fullTeamName(game.home),
      awayName: fullTeamName(game.away),
      played: Boolean(result),
      homeScore: result?.homeScore,
      awayScore: result?.awayScore,
    };
  });
}

export function buildNflPeriodStatuses(entries: NflMatchEntry[]): PeriodMatchStatus[] {
  const byPeriod = new Map<string, NflMatchEntry[]>();
  for (const entry of entries) {
    const list = byPeriod.get(entry.periodId) ?? [];
    list.push(entry);
    byPeriod.set(entry.periodId, list);
  }
  return [...byPeriod.entries()].map(([periodId, list]) => ({
    periodId,
    isComplete: list.every((e) => e.played),
    hasStarted: list.some((e) => e.played),
  }));
}