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

export interface NflStandingRow {
  code: string;
  name: string;
  wins: number;
  losses: number;
  ties: number;
  pct: number;
}

export interface NflDivisionStandings {
  conference: NFLTeam["conference"];
  division: NFLTeam["division"];
  rows: NflStandingRow[];
}

/**
 * Real division standings from actual regular-season results only —
 * playoff-type games (WC/DIV/CON/SB) don't count toward W-L record.
 * There's no live NFL results pipeline yet (see module note above), so
 * every team reads 0-0-0 today; this fills in correctly, division
 * groupings and all, the moment real scores start coming in.
 */
export function buildNflStandings(stored: StoredNflResults = {}): NflDivisionStandings[] {
  const record = new Map<string, { wins: number; losses: number; ties: number }>();
  for (const t of NFL_TEAMS) record.set(t.code, { wins: 0, losses: 0, ties: 0 });

  for (const game of NFL_SCHEDULE) {
    if (game.type !== "REG") continue;
    const result = stored[game.id];
    if (!result) continue;
    const home = record.get(game.home);
    const away = record.get(game.away);
    if (!home || !away) continue;
    if (result.homeScore > result.awayScore) { home.wins++; away.losses++; }
    else if (result.awayScore > result.homeScore) { away.wins++; home.losses++; }
    else { home.ties++; away.ties++; }
  }

  const groups = new Map<string, NflDivisionStandings>();
  for (const t of NFL_TEAMS) {
    const key = `${t.conference}-${t.division}`;
    if (!groups.has(key)) groups.set(key, { conference: t.conference, division: t.division, rows: [] });
    const r = record.get(t.code)!;
    const decided = r.wins + r.losses + r.ties;
    groups.get(key)!.rows.push({
      code: t.code,
      name: fullTeamName(t.code),
      wins: r.wins,
      losses: r.losses,
      ties: r.ties,
      pct: decided > 0 ? Number(((r.wins + r.ties * 0.5) / decided).toFixed(3)) : 0,
    });
  }

  for (const g of groups.values()) {
    g.rows.sort((a, b) => b.pct - a.pct || b.wins - a.wins);
  }

  // AFC East, North, South, West, then NFC East, North, South, West.
  const order: Array<[NFLTeam["conference"], NFLTeam["division"]]> = [
    ["AFC", "East"], ["AFC", "North"], ["AFC", "South"], ["AFC", "West"],
    ["NFC", "East"], ["NFC", "North"], ["NFC", "South"], ["NFC", "West"],
  ];
  return order.map(([conference, division]) => groups.get(`${conference}-${division}`)!);
}