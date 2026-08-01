/**
 * simulate.ts
 * The Monte Carlo core: draws a full season of outcomes for every player
 * `simulations` times. Replacement level is computed ONCE, from a stable
 * pHealthy-weighted baseline (see computeMixtureReplacementLevel) — an
 * earlier version re-derived it fresh from each draw's own noisy sampled
 * points, which sounded appealing ("scarcity itself is uncertain") but
 * had a real, confirmed bug: independent per-player injury coin-flips
 * could cluster within a draw, systematically depressing replacement
 * level for positions where replacement-tier players have low pHealthy
 * (RB, confirmed on real data — see computeMixtureReplacementLevel's
 * docstring for the numbers). Each player's OWN points still come from
 * their own real per-draw mixture sample, so individual boom/bust risk
 * is unaffected — only the subtracted baseline is now stable rather than
 * itself being noisy.
 *
 * Each draw samples from a two-component mixture (see curveFit.ts's
 * fitMixtureDistribution) rather than one blended Gaussian: with
 * probability pHealthy, sample from the "healthy season" distribution;
 * otherwise from the "shortened season" one. VBD/Value Rank/meanPoints
 * are computed from these blended draws — that's real fantasy value,
 * which should account for real injury risk, not pretend it away.
 * Alongside that, healthyMeanPoints/healthyP10-25-75-90Points
 * are computed ONLY from the subset of draws that landed in the healthy
 * mode — "what does this player produce specifically when active,"
 * which is what actually gets displayed as "Range" in the UI (the
 * blended range mixes in real bust-season outcomes, which produces a
 * misleadingly low floor for "if he plays a full season" — see
 * MODEL_HISTORY.md for the real Trey McBride numbers that motivated
 * this split).
 */
import { computeMixtureReplacementLevel, computeVBD } from "./replacementLevel";
import type { PlayerSeasonStat, Position, RosterConfig } from "./types";
import type { MixtureDistribution, PlayerRiskFactors } from "./curveFit";

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
  pHealthy: number;
  healthyMeanPoints: number;
  healthyP10Points: number;
  healthyP25Points: number;
  healthyP75Points: number;
  healthyP90Points: number;
  healthySd: number;
}

function sampleNormal(mean: number, sd: number): number {
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + sd * z0;
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
  mixtureOf: (player: SimulationInput) => MixtureDistribution,
  teams: number,
  roster: RosterConfig,
  simulations: number = 10000,
): SimulationResult[] {
  const mixtures = players.map((p) => mixtureOf(p));

  // Stable, deterministic replacement-level baseline — computed ONCE from
  // each player's pHealthy-weighted expected points, not re-derived from
  // noisy per-draw samples. See computeMixtureReplacementLevel's docstring
  // for the real bug this fixes (RB replacement level was getting
  // systematically depressed by simultaneous-bad-luck clustering across
  // low-pHealthy replacement-tier players).
  const replacementLevel = computeMixtureReplacementLevel(
    players.map((p, i) => ({
      position: p.position,
      pHealthy: mixtures[i].pHealthy,
      healthyMean: mixtures[i].healthy.mean,
      shortenedMean: mixtures[i].shortened.mean,
    })),
    teams,
    roster,
  );

  const pointsByPlayer: number[][] = players.map(() => []);
  const vbdByPlayer: number[][] = players.map(() => []);
  const healthyPointsByPlayer: number[][] = players.map(() => []);

  for (let draw = 0; draw < simulations; draw++) {
    const isHealthyThisDraw: boolean[] = players.map((_, i) => Math.random() < mixtures[i].pHealthy);

    const drawStats: PlayerSeasonStat[] = players.map((p, i) => {
      const dist = isHealthyThisDraw[i] ? mixtures[i].healthy : mixtures[i].shortened;
      return {
        name: p.name,
        position: p.position,
        points: Math.max(0, sampleNormal(dist.mean, dist.sd)),
      };
    });

    const withVbd = computeVBD(drawStats, replacementLevel);

    for (let i = 0; i < players.length; i++) {
      pointsByPlayer[i].push(drawStats[i].points);
      vbdByPlayer[i].push(withVbd[i].vbd);
      if (isHealthyThisDraw[i]) healthyPointsByPlayer[i].push(drawStats[i].points);
    }
  }

  const aggregated = players.map((p, i) => {
    const points = [...pointsByPlayer[i]].sort((a, b) => a - b);
    const mean = meanOf(points);
    const healthyPoints = [...healthyPointsByPlayer[i]].sort((a, b) => a - b);
    const healthyMean = meanOf(healthyPoints);
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
      pHealthy: mixtures[i].pHealthy,
      healthyMeanPoints: healthyMean,
      healthyP10Points: percentile(healthyPoints, 0.10),
      healthyP25Points: percentile(healthyPoints, 0.25),
      healthyP75Points: percentile(healthyPoints, 0.75),
      healthyP90Points: percentile(healthyPoints, 0.90),
      healthySd: sdOf(healthyPoints, healthyMean),
    };
  });

  const order = aggregated.map((r, i) => ({ i, vbd: r.meanVbd })).sort((a, b) => b.vbd - a.vbd);
  const valueRankByIndex = new Map(order.map(({ i }, idx) => [i, idx + 1]));

  return aggregated.map((r, i) => ({ ...r, valueRank: valueRankByIndex.get(i)! }));
}