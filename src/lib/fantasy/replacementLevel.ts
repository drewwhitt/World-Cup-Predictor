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
 * Computes a STABLE replacement-level baseline from each player's
 * pHealthy-weighted expected points (mixture.pHealthy * healthy.mean +
 * (1-pHealthy) * shortened.mean) — a smooth, deterministic number per
 * position, not re-derived per simulated draw.
 *
 * This exists because the naive approach (re-running computeReplacementLevel
 * on each draw's raw simulated points) has a real, confirmed bug: it
 * systematically depresses replacement level for positions where
 * near-replacement-tier players have low pHealthy, because independent
 * per-player injury coin-flips can cluster — in any given draw, an
 * unusually large share of a shallow-pHealthy position's replacement-tier
 * pool can simultaneously land in their "shortened" mode together, pulling
 * that draw's Nth-order-statistic down further than any single real season
 * ever shows. Confirmed on real data: simulated RB replacement level came
 * out to 72, while the real historical RB34 value never dropped below 132
 * across five actual seasons (2020-2024) — and a genuine out-of-sample
 * test (fit 2020-2023, blind to 2024) produced an 11/11 RB sweep of the
 * simulated Value Rank top-11, more extreme than the real 2024 outcome
 * (9 RB / 1 WR / 1 QB), which is itself the most RB-heavy year on record.
 * Root cause: RB's replacement-tier pHealthy (0.42) sits well below WR's
 * (0.57) — RBs are more genuinely injury-prone at replacement depth, and
 * that real effect was getting amplified by the per-draw order statistic
 * rather than reflected proportionately. See MODEL_HISTORY.md.
 *
 * Trade-off: this gives up the "replacement level itself is uncertain,
 * varies draw to draw" feature in favor of a stable baseline — each
 * player's OWN points still come from their real per-draw mixture sample
 * (so individual boom/bust risk is unaffected), only the subtracted
 * baseline is now fixed rather than also being a noisy per-draw sample.
 */
export function computeMixtureReplacementLevel(
  players: Array<{ position: Position; pHealthy: number; healthyMean: number; shortenedMean: number }>,
  teams: number,
  roster: RosterConfig,
): Record<Position, number> {
  const blended: PlayerSeasonStat[] = players.map((p, i) => ({
    name: `_replacement_baseline_input_${i}`,
    position: p.position,
    points: p.pHealthy * p.healthyMean + (1 - p.pHealthy) * p.shortenedMean,
  }));
  return computeReplacementLevel(blended, teams, roster);
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