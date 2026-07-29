/**
 * replacementLevel.ts
 * Value-Based Drafting (VORP flavor): every player's worth is measured
 * against a replacement-level baseline at their own position, not against
 * raw points — otherwise QBs dominate every ranking purely because the
 * position scores the most points, regardless of how replaceable a given
 * QB season actually is. See MODEL_HISTORY.md for the real backtest that
 * motivated this (2021–2024 derived nflverse data): raw-points rankings
 * put 4-6 QBs in every season's top 12, which a real redraft board never
 * would.
 *
 * Replacement rank is a function of league size and roster shape — not a
 * fixed constant — because a 2-QB league or a 3RB/3WR/0-FLEX league needs
 * a meaningfully different bar than a standard 12-team roster. Validated
 * against real historical data for 8/10/12/14-team standard rosters, a
 * 2-QB league, and a 3RB/3WR/0-FLEX league (see MODEL_HISTORY.md).
 */
import type { PlayerSeasonStat, PlayerVBD, Position, RosterConfig } from "./types";

/**
 * Default share of each team's FLEX slot(s) that historically go to each
 * eligible position. RB/WR dominate FLEX usage in practice; TE rarely
 * gets started there. This is a starting assumption, not something
 * dynamically fit per-league yet — worth revisiting once enough live
 * league data exists to check it empirically rather than assume it.
 */
const DEFAULT_FLEX_SHARE: Partial<Record<Position, number>> = {
  RB: 0.60,
  WR: 0.35,
  TE: 0.05,
};

/**
 * Small cushion beyond the last "pure" starter slot — replacement level
 * isn't the very last starter, it's the caliber of player a manager can
 * actually get off waivers, which is a little worse than that.
 */
const BUFFER: Record<Position, number> = { QB: 2, RB: 3, WR: 3, TE: 2 };

/**
 * The rank (1 = best at that position) that defines replacement level for
 * a given position, league size, and roster shape.
 */
export function replacementRank(position: Position, teams: number, roster: RosterConfig): number {
  const dedicated = (roster[position] ?? 0) * teams;

  let flexContribution = 0;
  if (roster.FLEX > 0 && roster.flexEligible.includes(position)) {
    const eligibleShares = roster.flexEligible.map((p) => DEFAULT_FLEX_SHARE[p] ?? 0);
    const totalShare = eligibleShares.reduce((a, b) => a + b, 0) || 1;
    const normalizedShare = (DEFAULT_FLEX_SHARE[position] ?? 0) / totalShare;
    flexContribution = roster.FLEX * teams * normalizedShare;
  }

  return Math.round(dedicated + flexContribution + BUFFER[position]);
}

/**
 * Replacement-level point total per position: the points scored by the
 * player at that position's replacementRank, sorted best-to-worst by
 * points. Falls back to the worst available player at that position if
 * the pool is smaller than the replacement rank (thin position pool, or
 * a very deep league), rather than throwing or returning 0.
 */
export function computeReplacementLevel(
  players: PlayerSeasonStat[],
  teams: number,
  roster: RosterConfig,
): Record<Position, number> {
  const byPosition: Record<Position, PlayerSeasonStat[]> = { QB: [], RB: [], WR: [], TE: [] };
  for (const p of players) byPosition[p.position].push(p);
  for (const pos of Object.keys(byPosition) as Position[]) {
    byPosition[pos].sort((a, b) => b.points - a.points);
  }

  const result = {} as Record<Position, number>;
  for (const pos of ["QB", "RB", "WR", "TE"] as Position[]) {
    const rank = replacementRank(pos, teams, roster);
    const pool = byPosition[pos];
    if (pool.length === 0) {
      result[pos] = 0;
    } else if (pool.length >= rank) {
      result[pos] = pool[rank - 1].points;
    } else {
      result[pos] = pool[pool.length - 1].points;
    }
  }
  return result;
}

/** Attaches `vbd` (points above replacement) to every player, given a precomputed replacement level per position. */
export function computeVBD(
  players: PlayerSeasonStat[],
  replacementLevel: Record<Position, number>,
): PlayerVBD[] {
  return players.map((p) => ({ ...p, vbd: p.points - replacementLevel[p.position] }));
}

/**
 * Where a hypothetical point total would rank, in Value terms, among an
 * already-VBD-scored player pool — used for "if this player scored X,
 * where would that season have ranked" (the Fantasy tab's expanded-row
 * range display).
 */
export function impliedValueRank(
  points: number,
  position: Position,
  replacementLevel: Record<Position, number>,
  allPlayers: PlayerVBD[],
): number {
  const impliedVbd = points - replacementLevel[position];
  let rank = 1;
  for (const p of allPlayers) {
    if (p.vbd > impliedVbd) rank++;
  }
  return rank;
}