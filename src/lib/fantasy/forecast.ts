/**
 * forecast.ts
 * The one place that turns (rankings snapshot, historical fit pool,
 * league config) into simulation results. Used by both
 * scripts/generate-fantasy-forecast.ts (offline, for the precomputed
 * standard presets) and FantasyView's live-compute fallback (for custom
 * rosters) — kept in one shared place specifically so those two paths
 * can't quietly drift apart from each other.
 */
import { applyRiskAdjustments, fitPointsDistribution, type PlayerRiskFactors } from "./curveFit";
import { runSimulation, type SimulationInput, type SimulationResult } from "./simulate";
import type { AdpVsActualEntry, FantasyRankingEntry, RosterConfig } from "./types";

export function buildSimulationInputs(
  entries: FantasyRankingEntry[],
  riskByName: Map<string, PlayerRiskFactors> = new Map(),
): SimulationInput[] {
  return entries.map((e) => ({
    name: e.name,
    position: e.position,
    adp: e.adp,
    risk: riskByName.get(e.name),
  }));
}

export function computeFantasyForecast(
  entries: FantasyRankingEntry[],
  fitPool: AdpVsActualEntry[],
  teams: number,
  roster: RosterConfig,
  riskByName: Map<string, PlayerRiskFactors> = new Map(),
  simulations: number = 10000,
): SimulationResult[] {
  const inputs = buildSimulationInputs(entries, riskByName);
  return runSimulation(
    inputs,
    (player) => applyRiskAdjustments(fitPointsDistribution(player.position, player.adp, fitPool), player.risk),
    teams,
    roster,
    simulations,
  );
}