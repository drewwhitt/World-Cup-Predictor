import type { TeamCode } from "./types";

/**
 * elo.ts — v9-aligned Elo engine
 *
 * Parameters below are the scipy-optimized values from backtesting against
 * 2010-2022 World Cup results (256 matches), targeting minimum Brier score.
 * See model notes: v9 achieved 0.1877 Brier vs 0.1897 for naive Elo.
 *
 * Key upgrades over the original v1 implementation:
 *  - K factor: 40 (was 32) — World Cup matches are highly informative
 *  - Home advantage: 100 Elo pts, HOST NATION ONLY (was flat 65 on every
 *    "home" team in the fixture, which is wrong for neutral-venue games)
 *  - Margin-of-victory: log-scale formula with autocorrelation correction
 *    (was a flat 3-tier multiplier: 1.0/1.25/1.4)
 */

const DRAW_PROB_SCALE = 0.28;
const DRAW_MIN = 0.08;
const DRAW_MAX = 0.32;

export const K_FACTOR = 40;
export const HOST_ADVANTAGE = 100; // applied ONLY when isHostMatch is true

export function expectedScore(eloA: number, eloB: number, homeAdv = 0): number {
  return 1 / (1 + 10 ** ((eloB - eloA - homeAdv) / 400));
}

export function matchOutcomeProbabilities(
  homeElo: number,
  awayElo: number,
  homeAdvantage: number,
): { homeWin: number; draw: number; awayWin: number } {
  const homeExpected = expectedScore(homeElo, awayElo, homeAdvantage);
  const drawBase = DRAW_PROB_SCALE * (1 - Math.abs(homeExpected - 0.5) * 1.6);
  const draw = Math.max(DRAW_MIN, Math.min(DRAW_MAX, drawBase));
  const remaining = 1 - draw;
  return {
    homeWin: remaining * homeExpected,
    draw,
    awayWin: remaining * (1 - homeExpected),
  };
}

/**
 * Margin-of-victory multiplier — 538-style log scale with autocorrelation
 * correction. Prevents a single blowout from dominating Elo movement while
 * still rewarding genuinely dominant performances more than squeakers.
 *
 * Draws are a special case: margin is 0 by definition, and log(0+1)=0
 * would make the ENTIRE update zero for every draw, regardless of the Elo
 * gap between the two teams — silently erasing the (homeScore-expectedHome)
 * signal in updateElo, which is what actually captures whether a draw was
 * a big upset (huge underdog holds a favorite) or fully expected (two
 * evenly-matched teams). A draw isn't "no information" — it's simply not
 * a blowout, so it gets the smallest non-degenerate value on the curve
 * (the same one a 1-goal decisive result gets) rather than a hard zero.
 */
function movMultiplier(margin: number, eloDiff: number): number {
  const effectiveMargin = margin === 0 ? 1 : Math.abs(margin);
  const autocorrCorrection = Math.abs(eloDiff) * 0.001 + 2.2;
  return (Math.log(effectiveMargin + 1) * 1.5) / autocorrCorrection;
}

export function updateElo(
  homeElo: number,
  awayElo: number,
  homeGoals: number,
  awayGoals: number,
  kFactor: number,
  homeAdvantage: number,
): { home: number; away: number } {
  const expectedHome = expectedScore(homeElo, awayElo, homeAdvantage);
  let homeScore: number;
  if (homeGoals > awayGoals) {
    homeScore = 1;
  } else if (homeGoals < awayGoals) {
    homeScore = 0;
  } else {
    homeScore = 0.5;
  }

  const margin = homeGoals - awayGoals;
  const eloDiff = homeElo - awayElo + homeAdvantage;
  const multiplier = movMultiplier(margin, eloDiff);

  const delta = kFactor * multiplier * (homeScore - expectedHome);
  return {
    home: homeElo + delta,
    away: awayElo - delta,
  };
}

export function sampleMatchOutcome(
  homeElo: number,
  awayElo: number,
  homeAdvantage: number,
  rng: () => number,
): { homeGoals: number; awayGoals: number } {
  const probs = matchOutcomeProbabilities(homeElo, awayElo, homeAdvantage);
  const roll = rng();
  if (roll < probs.homeWin) {
    const goals = rng() < 0.55 ? 1 : rng() < 0.8 ? 2 : 3;
    const concede = rng() < 0.65 ? 0 : 1;
    return { homeGoals: goals, awayGoals: concede };
  }
  if (roll < probs.homeWin + probs.draw) {
    const goals = rng() < 0.7 ? 1 : 2;
    return { homeGoals: goals, awayGoals: goals };
  }
  const goals = rng() < 0.55 ? 1 : rng() < 0.8 ? 2 : 3;
  const concede = rng() < 0.65 ? 0 : 1;
  return { homeGoals: concede, awayGoals: goals };
}

/**
 * Converts three-outcome match probabilities (win/draw/loss) into
 * knockout advancement probabilities. Draws go to extra time then
 * penalties — modelled as a 50/50 coin flip between the two teams,
 * applied to the model's draw probability.
 *
 * P(advance) = P(win in 90) + P(draw) × 0.5
 *
 * This is the correct question for knockout rounds: not "who wins in 90
 * minutes" but "who advances to the next round." The underlying model
 * probabilities are unchanged — this is purely a post-processing step.
 */
export function toAdvancementProbabilities(
  homeElo: number,
  awayElo: number,
  homeAdvantage = 0,
): { home: number; away: number } {
  const { homeWin, draw, awayWin } = matchOutcomeProbabilities(homeElo, awayElo, homeAdvantage);
  return {
    home: homeWin + draw * 0.5,
    away: awayWin + draw * 0.5,
  };
}

export function sampleKnockoutWinner(
  home: TeamCode,
  away: TeamCode,
  elos: Record<TeamCode, number>,
  rng: () => number,
): TeamCode {
  // Knockout matches are at neutral-ish venues for most ties (no host
  // advantage baked in here — host nation host advantage only applies
  // during their own group stage matches per the isHostMatch flag).
  const probs = matchOutcomeProbabilities(elos[home], elos[away], 0);
  const roll = rng();
  if (roll < probs.homeWin) return home;
  if (roll < probs.homeWin + probs.draw) {
    return rng() < expectedScore(elos[home], elos[away], 0) ? home : away;
  }
  return away;
}