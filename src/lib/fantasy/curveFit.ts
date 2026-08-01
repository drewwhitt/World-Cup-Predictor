/**
 * curveFit.ts
 * Turns real historical (consensus ADP, actual season points, games
 * played) data into a per-player resampling pool: "a player drafted
 * around this rank, at this position — here are the K real historical
 * players closest to that rank, and what they actually scored." Instead
 * of fitting a parametric distribution (mean, sd, or a healthy/shortened
 * mixture of two Gaussians) and sampling from the formula, we sample
 * directly from these real (games, points) pairs — bootstrap resampling.
 *
 * Why: real skewness checked against actual historical data (see
 * MODEL_HISTORY.md) showed meaningful, position-specific skew that a
 * symmetric Normal can't represent — and critically, it doesn't even
 * point the same direction for every position (healthy-season QBs skew
 * LEFT at -0.66, while RB/WR/TE skew right). No single parametric
 * correction handles that; resampling real outcomes captures whatever
 * shape actually exists, automatically, per position.
 *
 * This also replaces the earlier binary "healthy = 14+ games" cutoff
 * with continuous games-based weighting (see sampleDisplayPoints) — a
 * 13-game season and a 2-game season used to be lumped into the same
 * "shortened" bucket and averaged together, which is exactly the kind
 * of arbitrary-cutoff flattening we're moving away from. There is no
 * hard threshold anywhere in this file; 14 games only survives as a
 * plain-language reporting convention in estimateAvailabilityPct, not
 * as a modeling boundary.
 */
import type { AdpVsActualEntry, Position } from "./types";

/** Real historical (games, points) pair used as a resampling candidate. */
export interface ResampleNeighbor {
  games: number;
  points: number;
}

/**
 * Larger than the old k=15 single-Gaussian fit — bootstrap resampling
 * needs more real data points to avoid an overly lumpy empirical
 * distribution (too few distinct values to draw from).
 */
const RESAMPLE_K = 25;

export interface PlayerRiskFactors {
  /** Games missed last season, if known. */
  gamesMissedLastSeason?: number;
  /** New team, new primary QB/scheme, or a significant depth-chart change. */
  situationChange?: boolean;
  /** Rookie, or fewer than 2 NFL seasons of track record. */
  limitedHistory?: boolean;
}

const RISK_PENALTY_PER_MISSED_GAME = 0.03; // continuous, no cutoff — scales with games missed, not a threshold
const MAX_RISK_PENALTY = 0.6;
const SITUATION_CHANGE_K_BUMP = 8; // widen the neighbor search for more real comparables when there's genuine role uncertainty
const LIMITED_HISTORY_K_BUMP = 10;

/**
 * The K real historical players (pooled across however many seasons the
 * caller passes in) closest in draft rank to a hypothetical player at
 * `consensusRank` and `position`. situationChange/limitedHistory widen
 * the search (more neighbors = more heterogeneous real outcomes pulled
 * in = naturally more spread), replacing the old "widen sd by a fixed
 * multiplier" approach with something that stays grounded in real data
 * rather than an arbitrary variance bump.
 */
export function buildResamplePool(
  position: Position,
  consensusRank: number,
  pool: AdpVsActualEntry[],
  risk?: PlayerRiskFactors,
): ResampleNeighbor[] {
  let k = RESAMPLE_K;
  if (risk?.situationChange) k += SITUATION_CHANGE_K_BUMP;
  if (risk?.limitedHistory) k += LIMITED_HISTORY_K_BUMP;

  const candidates = pool.filter((p) => p.position === position);
  if (candidates.length === 0) return [];
  const sorted = [...candidates].sort(
    (a, b) => Math.abs(a.consensusRank - consensusRank) - Math.abs(b.consensusRank - consensusRank),
  );
  return sorted.slice(0, Math.min(k, sorted.length)).map((n) => ({ games: n.games, points: n.actualPoints }));
}

/**
 * How much a specific neighbor's outcome should count for a player with
 * known recent injury history — continuous, scaling with both the
 * player's own risk (games missed last season) and the neighbor's own
 * games played, not a cutoff. A player coming off missed time gets
 * full-health neighbor outcomes discounted somewhat (they're less
 * likely to replicate a clean 17-game season than a generic same-rank
 * player would be), while lower-games neighbors are barely discounted
 * at all. No risk factor supplied → uniform weight (1) for everyone,
 * which is correct: real risk is already reflected by which neighbors
 * exist in the pool (if a position/rank tier has lots of real injuries,
 * the pool naturally contains lots of low-games neighbors already).
 */
function riskWeight(neighbor: ResampleNeighbor, risk?: PlayerRiskFactors): number {
  if (!risk?.gamesMissedLastSeason) return 1;
  const penalty = Math.min(risk.gamesMissedLastSeason * RISK_PENALTY_PER_MISSED_GAME, MAX_RISK_PENALTY);
  return Math.max(0.05, 1 - penalty * (neighbor.games / 17));
}

function weightedPick(neighbors: ResampleNeighbor[], weightOf: (n: ResampleNeighbor) => number): ResampleNeighbor {
  const weights = neighbors.map(weightOf);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return neighbors[Math.floor(Math.random() * neighbors.length)];
  let r = Math.random() * total;
  for (let i = 0; i < neighbors.length; i++) {
    r -= weights[i];
    if (r <= 0) return neighbors[i];
  }
  return neighbors[neighbors.length - 1];
}

/**
 * Samples one real historical outcome for the TRUE, risk-inclusive
 * value calculation (VBD/Value Rank/replacement level) — uniform weight
 * by default (every real neighbor equally likely), only reweighted for
 * a player's own known recent injury history. This is what "real
 * fantasy value" should reflect: the actual unconditional risk a
 * similarly-drafted player historically faced.
 */
export function sampleValuePoints(neighbors: ResampleNeighbor[], risk?: PlayerRiskFactors): number {
  if (neighbors.length === 0) return 0;
  return weightedPick(neighbors, (n) => riskWeight(n, risk)).points;
}

/**
 * Samples one real historical outcome for the DISPLAYED range —
 * weighted continuously by games played (a 17-game season counts much
 * more than a 3-game one, but nothing is fully excluded the way the old
 * "games >= 14" cutoff excluded everything below it). This answers "what
 * should I expect from this player when they're actually on the field,"
 * without pretending real partial-season data doesn't exist.
 */
export function sampleDisplayPoints(neighbors: ResampleNeighbor[], risk?: PlayerRiskFactors): number {
  if (neighbors.length === 0) return 0;
  return weightedPick(neighbors, (n) => n.games * riskWeight(n, risk)).points;
}

/**
 * Risk-weighted mean of the pool — a smooth, deterministic "expected
 * points" number per player, used to build a stable replacement-level
 * baseline (see replacementLevel.ts) rather than re-deriving it from
 * noisy per-draw samples.
 */
export function expectedValuePoints(neighbors: ResampleNeighbor[], risk?: PlayerRiskFactors): number {
  if (neighbors.length === 0) return 0;
  const weights = neighbors.map((n) => riskWeight(n, risk));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) return neighbors.reduce((a, n) => a + n.points, 0) / neighbors.length;
  const weightedSum = neighbors.reduce((sum, n, i) => sum + n.points * weights[i], 0);
  return weightedSum / totalWeight;
}

/**
 * Real historical fraction of the pool that played 14+ games — a plain,
 * intuitive number for the Availability stat shown in each player's
 * dropdown. Purely descriptive/reporting; 14 has no role in how points
 * actually get sampled anywhere else in this file.
 */
export function estimateAvailabilityPct(neighbors: ResampleNeighbor[], threshold: number = 14): number {
  if (neighbors.length === 0) return 0.5;
  return neighbors.filter((n) => n.games >= threshold).length / neighbors.length;
}