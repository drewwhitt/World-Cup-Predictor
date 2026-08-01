/**
 * simulate.ts
 * The Monte Carlo core: draws a full season of outcomes for every player
 * `simulations` times by resampling real historical outcomes (see
 * curveFit.ts) rather than sampling from a fitted parametric
 * distribution. Two independent resamples happen per player per draw:
 *  - VALUE points (uniform-weighted, risk-adjusted) feed VBD/Value
 *    Rank/replacement level — the true, risk-inclusive fantasy value.
 *  - DISPLAY points (continuously games-weighted) feed the Range shown
 *    in the UI — "what to expect when this player is actually playing,"
 *    without a hard healthy/shortened cutoff anywhere.
 * These are independent draws of the same underlying real population,
 * not paired per-draw — they're answering two different questions about
 * the same historical data, not requiring shared randomness.
 *
 * Replacement level is computed ONCE, from each player's stable
 * risk-weighted expected value (see curveFit.ts's expectedValuePoints),
 * not re-derived from noisy per-draw samples — re-deriving it per draw
 * had a real, confirmed bug: independent per-player sampling could
 * cluster within a draw, systematically depressing replacement level
 * for positions where replacement-tier players skew toward more
 * variable/lower-games historical outcomes (confirmed on real RB data —
 * see MODEL_HISTORY.md and replacementLevel.ts).
 */
import { computeReplacementLevel, computeVBD } from "./replacementLevel";
import type { PlayerSeasonStat, Position, RosterConfig } from "./types";
import type { PlayerRiskFactors, ResampleNeighbor } from "./curveFit";
import { estimateAvailabilityPct, expectedValuePoints, sampleDisplayPoints, sampleValuePoints } from "./curveFit";

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
  valueRank: number;
  sd: number;
  availabilityPct: number;
  displayMeanPoints: number;
  displayP10Points: number;
  displayP90Points: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
}

function meanOf(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function sdOf(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function runSimulation(
  players: SimulationInput[],
  poolOf: (player: SimulationInput) => ResampleNeighbor[],
  teams: number,
  roster: RosterConfig,
  simulations: number = 10000,
): SimulationResult[] {
  const pools = players.map((p) => poolOf(p));

  const replacementInputs: PlayerSeasonStat[] = players.map((p, i) => ({
    name: p.name,
    position: p.position,
    points: expectedValuePoints(pools[i], p.risk),
  }));
  const replacementLevel = computeReplacementLevel(replacementInputs, teams, roster);

  const pointsByPlayer: number[][] = players.map(() => []);
  const vbdByPlayer: number[][] = players.map(() => []);
  const displayPointsByPlayer: number[][] = players.map(() => []);

  for (let draw = 0; draw < simulations; draw++) {
    const drawStats: PlayerSeasonStat[] = players.map((p, i) => ({
      name: p.name,
      position: p.position,
      points: Math.max(0, sampleValuePoints(pools[i], p.risk)),
    }));

    const withVbd = computeVBD(drawStats, replacementLevel);

    for (let i = 0; i < players.length; i++) {
      pointsByPlayer[i].push(drawStats[i].points);
      vbdByPlayer[i].push(withVbd[i].vbd);
      displayPointsByPlayer[i].push(Math.max(0, sampleDisplayPoints(pools[i], players[i].risk)));
    }
  }

  const aggregated = players.map((p, i) => {
    const points = [...pointsByPlayer[i]].sort((a, b) => a - b);
    const mean = meanOf(points);
    const displayPoints = [...displayPointsByPlayer[i]].sort((a, b) => a - b);
    const meanVbd = meanOf(vbdByPlayer[i]);

    return {
      name: p.name,
      position: p.position,
      adp: p.adp,
      meanPoints: mean,
      p10Points: percentile(points, 0.10),
      p90Points: percentile(points, 0.90),
      meanVbd,
      sd: sdOf(points, mean),
      availabilityPct: estimateAvailabilityPct(pools[i]),
      displayMeanPoints: meanOf(displayPoints),
      displayP10Points: percentile(displayPoints, 0.10),
      displayP90Points: percentile(displayPoints, 0.90),
    };
  });

  const order = aggregated.map((r, i) => ({ i, vbd: r.meanVbd })).sort((a, b) => b.vbd - a.vbd);
  const valueRankByIndex = new Map(order.map(({ i }, idx) => [i, idx + 1]));

  return aggregated.map((r, i) => ({ ...r, valueRank: valueRankByIndex.get(i)! }));
}