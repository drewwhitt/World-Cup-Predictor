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
 * parametric regression — with only ~5 seasons of real data (~100-176
 * players/season), a fitted curve with real coefficients would be
 * fitting noise as much as signal. Nearest-neighbor is simpler, doesn't
 * pretend to more precision than the data supports, and naturally
 * adapts to how sparse the data is at different ranks (fewer results
 * at the extremes just means the neighbors span a wider rank range).
 *
 * MIXTURE MODEL: a player's real season outcome isn't one smooth bell
 * curve — it's closer to two different scenarios: plays a real season,
 * or misses meaningful time. Fitting one Normal(mean, sd) to a pool that
 * blends both smears them together into a distribution that doesn't
 * look like either actual outcome — real data check on a TE at ADP ~22
 * showed a blended fit of mean=112/sd=93, while splitting by games
 * played gave mean=181/sd=64 for full seasons (14+ games) and
 * mean=79/sd=42 for shortened ones — two clearly different clusters,
 * not one wide bell curve. fitMixtureDistribution fits both halves
 * separately, plus the real historical fraction of similarly-drafted
 * players who stayed healthy, rather than fitting one smeared-together
 * distribution and calling it a percentile range.
 */
import type { AdpVsActualEntry, Position } from "./types";

export interface FittedDistribution {
  mean: number;
  sd: number;
  /** How many real historical data points this fit was based on — surfaced so callers/tests can sanity-check thin fits (e.g. very few historical players near this rank/position). */
  sampleSize: number;
}

const DEFAULT_K = 15;

/** Games (of 17) at or above which a season counts as "healthy/full" for splitting the mixture — a real games-played number, not a percentage or a guess. */
export const HEALTHY_SEASON_GAMES_THRESHOLD = 14;

/** Neighbor sample size used specifically for estimating the healthy-season probability — larger than DEFAULT_K because a stable percentage needs more data than a mean/sd fit does. */
const AVAILABILITY_SAMPLE_K = 30;

export interface MixtureDistribution {
  /** Probability (0-1) of a healthy/full season, from the real historical fraction of similarly-drafted same-position players who played HEALTHY_SEASON_GAMES_THRESHOLD+ games. */
  pHealthy: number;
  healthy: FittedDistribution;
  shortened: FittedDistribution;
}

function knnFit(candidates: AdpVsActualEntry[], consensusRank: number, k: number): FittedDistribution {
  if (candidates.length === 0) return { mean: 0, sd: 0, sampleSize: 0 };
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
 * Fits a (mean, sd) for a hypothetical player at `position` drafted
 * around `consensusRank`, using the K real historical players (pooled
 * across however many seasons the caller passes in) closest to that
 * rank at that position. Blended across both healthy and shortened
 * seasons — kept for callers that specifically want the single-mode
 * historical fit rather than the mixture (e.g. quick sanity checks).
 */
export function fitPointsDistribution(
  position: Position,
  consensusRank: number,
  pool: AdpVsActualEntry[],
  k: number = DEFAULT_K,
): FittedDistribution {
  return knnFit(pool.filter((p) => p.position === position), consensusRank, k);
}

/**
 * Fits the full two-component mixture: separate healthy/shortened
 * distributions plus a real historically-derived probability of which
 * one applies. This is what simulate.ts actually draws from — sampling
 * from the correct sub-distribution per draw is a materially better
 * approximation of a real season's outcome than one blended Gaussian.
 */
export function fitMixtureDistribution(
  position: Position,
  consensusRank: number,
  pool: AdpVsActualEntry[],
  k: number = DEFAULT_K,
): MixtureDistribution {
  const positionPool = pool.filter((p) => p.position === position);

  const availabilityNeighbors = [...positionPool]
    .sort((a, b) => Math.abs(a.consensusRank - consensusRank) - Math.abs(b.consensusRank - consensusRank))
    .slice(0, Math.min(AVAILABILITY_SAMPLE_K, positionPool.length));
  const pHealthy = availabilityNeighbors.length > 0
    ? availabilityNeighbors.filter((n) => n.games >= HEALTHY_SEASON_GAMES_THRESHOLD).length / availabilityNeighbors.length
    : 0.5; // no data at all — genuinely uninformative, coin flip rather than a fabricated number

  const healthyPool = positionPool.filter((p) => p.games >= HEALTHY_SEASON_GAMES_THRESHOLD);
  const shortenedPool = positionPool.filter((p) => p.games < HEALTHY_SEASON_GAMES_THRESHOLD);

  return {
    pHealthy,
    healthy: knnFit(healthyPool, consensusRank, k),
    shortened: knnFit(shortenedPool, consensusRank, k),
  };
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

/** How much pHealthy drops per game missed last season, capped — recent missed time is real evidence of elevated recurrence risk, not just "more uncertainty" in general, so this adjusts the availability probability directly rather than only widening variance. Deliberately modest; see MODEL_HISTORY.md. */
const PHEALTHY_PENALTY_PER_MISSED_GAME = 0.015;
const MAX_PHEALTHY_PENALTY = 0.20;

/**
 * Applies the risk-factor adjustments to a single fitted distribution.
 * Only widens variance (never shifts mean) — there isn't a defensible
 * basis yet for asserting these factors predict a *direction* of
 * over/under performance, only that they predict *less certainty* about
 * the outcome, which a Monte Carlo naturally represents as a wider
 * spread.
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

/**
 * Applies risk adjustments to a full mixture: widens both sub-distributions'
 * variance the same way applyRiskAdjustments does, and additionally nudges
 * pHealthy down for real recent missed-time history — the one factor with
 * a defensible basis for predicting *direction* here (recent injury is
 * real evidence of elevated recurrence risk), not just added uncertainty.
 */
export function applyRiskAdjustmentsToMixture(base: MixtureDistribution, risk: PlayerRiskFactors = {}): MixtureDistribution {
  let pHealthyPenalty = 0;
  if (risk.gamesMissedLastSeason) {
    pHealthyPenalty = Math.min(risk.gamesMissedLastSeason * PHEALTHY_PENALTY_PER_MISSED_GAME, MAX_PHEALTHY_PENALTY);
  }

  return {
    pHealthy: Math.max(0, Math.min(1, base.pHealthy - pHealthyPenalty)),
    healthy: applyRiskAdjustments(base.healthy, risk),
    shortened: applyRiskAdjustments(base.shortened, risk),
  };
}