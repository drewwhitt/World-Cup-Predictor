/**
 * simulate.ts
 * The Monte Carlo core: draws a full season of outcomes for every player
 * `simulations` times, and for each draw computes replacement level and
 * VBD fresh from that draw's own numbers — not once against a fixed
 * baseline. This matters because it lets positional scarcity itself be
 * uncertain: if a draw happens to be a bad year for RB depth, that
 * draw's RB replacement level shifts down with it, exactly the way real
 * season-to-season scarcity varies. Aggregating rank across draws (not
 * just averaging points) is what makes "Value Rank" a genuine
 * probability-weighted answer rather than a single point estimate.
 */
import { computeReplacementLevel, computeVBD } from "./replacementLevel";
import type { PlayerSeasonStat, Position, RosterConfig } from "./types";
import type { PlayerRiskFactors } from "./curveFit";

export interface SimulationInput {
  name: string;
  position: Position;
  adp: number;
  risk?: PlayerRiskFactors;
}

export interface SimulationResult {
  name: string;
  position: Position;
  adp: number;
  meanPoints: number;
  p10Points: number;
  p90Points: number;
  meanVbd: number;
  /** Rank derived from meanVbd (1 = highest) — every player sorted once by their aggregate expected value over replacement, matching the glossary's "Value Rk is simply every player sorted by this same VBD number." NOT an average of each player's rank across individual draws — that was tried first and produced badly inflated numbers (the best player in the league showed as "Value Rank 24", not "1") because rank is floored at 1 but has no ceiling, so variance from any source — including the per-draw replacement level itself, which is a real sampled player's score, not a fixed baseline — pulls the arithmetic mean of ranks upward for everyone, worst for exactly the highest-variance players. */
  valueRank: number;
  sd: number;
}

/**
 * Box-Muller transform — standard normal sample, no external RNG
 * dependency. Fine for this use case: we're not doing anything
 * cryptographic, just need a reasonably-shaped random draw.
 */
function sampleNormal(mean: number, sd: number): number {
  const u1 = Math.random() || 1e-9; // avoid log(0)
  const u2 = Math.random();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + sd * z0;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
}

/**
 * Runs the full Monte Carlo. `distributionOf` supplies the (mean, sd)
 * for a given player — the caller builds this from curveFit.ts (fitted
 * from real historical ADP-vs-actual data plus risk adjustments), kept
 * as an injected function here so simulate.ts itself has no dependency
 * on where the distribution came from and can be tested with synthetic
 * inputs.
 */
export function runSimulation(
  players: SimulationInput[],
  distributionOf: (player: SimulationInput) => { mean: number; sd: number },
  teams: number,
  roster: RosterConfig,
  simulations: number = 10000,
): SimulationResult[] {
  const dists = players.map((p) => distributionOf(p));

  // Per-player accumulators across all draws.
  const pointsByPlayer: number[][] = players.map(() => []);
  const vbdByPlayer: number[][] = players.map(() => []);

  for (let draw = 0; draw < simulations; draw++) {
    const drawStats: PlayerSeasonStat[] = players.map((p, i) => ({
      name: p.name,
      position: p.position,
      points: Math.max(0, sampleNormal(dists[i].mean, dists[i].sd)),
    }));

    const replacementLevel = computeReplacementLevel(drawStats, teams, roster);
    const withVbd = computeVBD(drawStats, replacementLevel);

    for (let i = 0; i < players.length; i++) {
      pointsByPlayer[i].push(drawStats[i].points);
      vbdByPlayer[i].push(withVbd[i].vbd);
    }
  }

  const aggregated = players.map((p, i) => {
    const points = [...pointsByPlayer[i]].sort((a, b) => a - b);
    const mean = points.reduce((a, b) => a + b, 0) / points.length;
    const variance = points.reduce((a, b) => a + (b - mean) ** 2, 0) / points.length;
    const meanVbd = vbdByPlayer[i].reduce((a, b) => a + b, 0) / vbdByPlayer[i].length;

    return {
      name: p.name,
      position: p.position,
      adp: p.adp,
      meanPoints: mean,
      p10Points: percentile(points, 0.10),
      p90Points: percentile(points, 0.90),
      meanVbd,
      sd: Math.sqrt(variance),
    };
  });

  // Value Rank: sort once by aggregate meanVbd, rank 1 = highest. See the
  // SimulationResult docstring for why this replaced averaging each
  // player's per-draw rank. Ranked by index (not name) to avoid any risk
  // of collision if two players ever share an exact name.
  const order = aggregated.map((r, i) => ({ i, vbd: r.meanVbd })).sort((a, b) => b.vbd - a.vbd);
  const valueRankByIndex = new Map(order.map(({ i }, idx) => [i, idx + 1]));

  return aggregated.map((r, i) => ({ ...r, valueRank: valueRankByIndex.get(i)! }));
}