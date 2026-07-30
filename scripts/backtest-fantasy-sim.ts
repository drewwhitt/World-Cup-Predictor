/**
 * Out-of-sample backtest for the fantasy Monte Carlo engine: fits the
 * projection curve on 2021–2023 only, then simulates 2024 as if it
 * hadn't happened yet (using only real 2024 ADP + real prior-season
 * games-played, both known before the season starts), and checks the
 * simulated outcomes against what actually happened. 2024 is never in
 * the fit pool — this is a genuine held-out test, not a fit-then-check
 * on the same data.
 *
 * Mirrors backtest-nfl.ts's role for the NFL Elo engine: real
 * historical outcomes, not assumed calibration. Re-run this whenever
 * curveFit.ts or simulate.ts's core logic changes, before trusting the
 * new numbers.
 *
 * Usage: npx tsx scripts/backtest-fantasy-sim.ts
 */
import adpVsActualData from "../src/data/fantasy/adp-vs-actual-2021-2024.json";
import adpVsActual2020Data from "../src/data/fantasy/adp-vs-actual-2020.json";
import historicalData from "../src/data/fantasy/historical-player-seasons.json";
import { fitPointsDistribution, applyRiskAdjustments } from "../src/lib/fantasy/curveFit";
import { runSimulation, type SimulationInput } from "../src/lib/fantasy/simulate";
import { STANDARD_ROSTER } from "../src/lib/fantasy/types";
import type { AdpVsActualEntry } from "../src/lib/fantasy/types";

const data = adpVsActualData as { seasons: Record<string, AdpVsActualEntry[]> };
const historical = historicalData as { seasons: Record<string, Array<{ name: string; games: number }>> };

// Fit pool: 2021-2023 only. 2024 is held out entirely — the model never sees it.
const fitPool: AdpVsActualEntry[] = [
  ...data.seasons["2021"], ...data.seasons["2022"], ...data.seasons["2023"],
  ...(adpVsActual2020Data as { entries: AdpVsActualEntry[] }).entries,
];

// Real prior-season (2023) games played, looked up by exact name — same
// canonical nflverse source across years, so no fuzzy matching needed
// here (unlike matching an external consensus board's abbreviated names).
const games2023ByName = new Map(historical.seasons["2023"].map((p) => [p.name, p.games]));

// "Pretend" input: 2024 players' real ADP and position, plus real risk
// factors derived from their actual 2023 record — not hypothetical.
const players2024: SimulationInput[] = data.seasons["2024"].map((p) => {
  const games2023 = games2023ByName.get(p.name);
  const risk = games2023 === undefined
    ? { limitedHistory: true } // no 2023 record at all — rookie or first real season
    : { gamesMissedLastSeason: Math.max(0, 17 - games2023) };
  return { name: p.name, position: p.position, adp: p.consensusRank, risk };
});

console.log(`Fitting on ${fitPool.length} historical player-seasons (2020-2023). Simulating ${players2024.length} players for 2024 (held out).\n`);

const results = runSimulation(
  players2024,
  (player) => {
    const base = fitPointsDistribution(player.position, player.adp, fitPool);
    return applyRiskAdjustments(base, player.risk);
  },
  12,
  STANDARD_ROSTER,
  10000,
);

// Join simulated results back to real 2024 outcomes for comparison.
const actualByName = new Map(data.seasons["2024"].map((p) => [p.name, p.actualPoints]));

let withinRangeCount = 0;
const rows = results.map((r) => {
  const actual = actualByName.get(r.name) ?? 0;
  const withinRange = actual >= r.p10Points && actual <= r.p90Points;
  if (withinRange) withinRangeCount++;
  return { ...r, actual, withinRange };
});

console.log(`Calibration check: actual outcome fell within the simulated 10th-90th percentile band for ${withinRangeCount}/${rows.length} players (${((withinRangeCount / rows.length) * 100).toFixed(1)}%). Target: roughly 80% for a well-calibrated 10th-90th band.\n`);

console.log("Spot check — top 10 by ADP (real stars):");
for (const r of [...rows].sort((a, b) => a.adp - b.adp).slice(0, 10)) {
  console.log(
    `  ${r.name.padEnd(22)} (${r.position}) ADP #${r.adp} — simulated ${r.p10Points.toFixed(0)}-${r.p90Points.toFixed(0)} ` +
    `(mean ${r.meanPoints.toFixed(0)}) | actual: ${r.actual.toFixed(0)} ${r.withinRange ? "✓ within range" : "✗ OUTSIDE range"}`,
  );
}

console.log("\nKnown 2024 busts (should show as within-range but near/below the low end, or flagged outside if it was extreme):");
for (const name of ["Christian McCaffrey", "Isiah Pacheco", "Chris Olave"]) {
  const r = rows.find((row) => row.name === name);
  if (!r) { console.log(`  ${name}: not found in results`); continue; }
  console.log(
    `  ${r.name.padEnd(22)} (${r.position}) ADP #${r.adp} — simulated ${r.p10Points.toFixed(0)}-${r.p90Points.toFixed(0)} ` +
    `(mean ${r.meanPoints.toFixed(0)}) | actual: ${r.actual.toFixed(0)} ${r.withinRange ? "✓ within range" : "✗ OUTSIDE range"}`,
  );
}

console.log("\nKnown 2024 breakouts:");
for (const name of ["Baker Mayfield", "Jahmyr Gibbs", "Ja'Marr Chase"]) {
  const r = rows.find((row) => row.name === name);
  if (!r) { console.log(`  ${name}: not found in results`); continue; }
  console.log(
    `  ${r.name.padEnd(22)} (${r.position}) ADP #${r.adp} — simulated ${r.p10Points.toFixed(0)}-${r.p90Points.toFixed(0)} ` +
    `(mean ${r.meanPoints.toFixed(0)}) | actual: ${r.actual.toFixed(0)} ${r.withinRange ? "✓ within range" : "✗ OUTSIDE range"}`,
  );
}