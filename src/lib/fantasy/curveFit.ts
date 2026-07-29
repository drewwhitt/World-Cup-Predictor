/**
 * curveFit.ts
 * Turns real historical (consensus ADP, actual season points) pairs into
 * a per-player projected distribution: "a player drafted around this
 * rank, at this position, historically scored about X points with Y
 * spread." This is the prior every current player's projection starts
 * from, before the adjustment layer in this file nudges it for known
 * risk factors, and before simulate.ts draws from it.
 *
 * Uses k-nearest-neighbor by rank distance rather than a smooth
 * parametric regression — with only 4 seasons of real data (~100-176
 * players/season), a fitted curve with real coefficients would be
 * fitting noise as much as signal. Nearest-neighbor is simpler, doesn't
 * pretend to more precision than the data supports, and naturally
 * adapts to how sparse the data is at different ranks (fewer results
 * at the extremes just means the neighbors span a wider rank range).
 */
import type { AdpVsActualEntry, Position } from "./types";

export interface FittedDistribution {
  mean: number;
  sd: number;
  /** How many real historical data points this fit was based on — surfaced so callers/tests can sanity-check thin fits (e.g. very few historical players near this rank/position). */
  sampleSize: number;
}

const DEFAULT_K = 15;

/**
 * Fits a (mean, sd) for a hypothetical player at `position` drafted
 * around `consensusRank`, using the K real historical players (pooled
 * across however many seasons the caller passes in) closest to that
 * rank at that position.
 */
export function fitPointsDistribution(
  position: Position,
  consensusRank: number,
  pool: AdpVsActualEntry[],
  k: number = DEFAULT_K,
): FittedDistribution {
  const candidates = pool.filter((p) => p.position === position);
  if (candidates.length === 0) {
    return { mean: 0, sd: 0, sampleSize: 0 };
  }

  const sorted = [...candidates].sort(
    (a, b) => Math.abs(a.consensusRank - consensusRank) - Math.abs(b.consensusRank - consensusRank),
  );
  const neighbors = sorted.slice(0, Math.min(k, sorted.length));

  const points = neighbors.map((n) => n.actualPoints);
  const mean = points.reduce((a, b) => a + b, 0) / points.length;
  const variance = points.reduce((a, b) => a + (b - mean) ** 2, 0) / points.length;

  return { mean, sd: Math.sqrt(variance), sampleSize: neighbors.length };
}

/**
 * Known risk factors that widen (or shift) a player's projected
 * distribution beyond what their draft-rank neighbors alone would
 * suggest. Each is a simple, named, conservative multiplier — not a fit
 * to any real data (there isn't enough of it yet to fit these
 * separately), so the values here are a deliberately modest starting
 * point pending real feedback once the app is live. See MODEL_HISTORY.md
 * before changing these — prefer the smallest justified adjustment.
 */
export interface PlayerRiskFactors {
  /** Games missed last season, if known. */
  gamesMissedLastSeason?: number;
  /** New team, new primary QB/scheme, or a significant depth-chart change. */
  situationChange?: boolean;
  /** Rookie, or fewer than 2 NFL seasons of track record. */
  limitedHistory?: boolean;
}

const INJURY_SD_MULT_PER_MISSED_GAME = 0.03; // widen sd 3% per game missed last season, capped below
const MAX_INJURY_SD_MULT = 0.30;
const SITUATION_CHANGE_SD_MULT = 0.12;
const LIMITED_HISTORY_SD_MULT = 0.15;

/**
 * Applies the risk-factor adjustments to a fitted distribution. Only
 * widens variance (never shifts mean) — there isn't a defensible basis
 * yet for asserting these factors predict a *direction* of over/under
 * performance, only that they predict *less certainty* about the
 * outcome, which a Monte Carlo naturally represents as a wider spread.
 */
export function applyRiskAdjustments(base: FittedDistribution, risk: PlayerRiskFactors = {}): FittedDistribution {
  let sdMultiplier = 1;
  if (risk.gamesMissedLastSeason) {
    sdMultiplier += Math.min(risk.gamesMissedLastSeason * INJURY_SD_MULT_PER_MISSED_GAME, MAX_INJURY_SD_MULT);
  }
  if (risk.situationChange) sdMultiplier += SITUATION_CHANGE_SD_MULT;
  if (risk.limitedHistory) sdMultiplier += LIMITED_HISTORY_SD_MULT;

  return { ...base, sd: base.sd * sdMultiplier };
}