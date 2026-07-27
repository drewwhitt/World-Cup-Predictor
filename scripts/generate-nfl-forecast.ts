/**
 * Precomputes the full-season NFL Monte Carlo forecast at 10,000
 * simulations (same count as the World Cup's live simulation) and writes
 * it to a static JSON. Benchmarked at ~3s for 10,000 runs — squarely in
 * "blocking compute" territory that TrendsView got shelved for — so this
 * runs ahead of time instead of in the browser, the same way
 * generate-baseline.ts precomputes the World Cup's pre-tournament odds.
 *
 * Re-run this whenever real 2026 results start changing the baseline
 * meaningfully (e.g. weekly, once the manual results pipeline exists).
 *
 * Usage: npx tsx scripts/generate-nfl-forecast.ts
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildNflSeasonForecast } from "../src/data/nfl/nflForecast";
import { NFL_TEAM_BY_CODE } from "../src/data/nfl/teams";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "../src/data/nfl/forecast-2026.json");

const SIMULATIONS = 10000;

function main() {
  const forecasts = buildNflSeasonForecast(SIMULATIONS);

  const payload = {
    generatedAt: new Date().toISOString(),
    label: "2026 season forecast — Monte Carlo over the preseason Elo baseline, no real 2026 results yet",
    simulations: SIMULATIONS,
    forecasts,
  };

  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`Forecast written to ${outPath}`);
  console.log("Top 5 Super Bowl odds:");
  for (const row of [...forecasts].sort((a, b) => b.superBowlPct - a.superBowlPct).slice(0, 5)) {
    console.log(`  ${NFL_TEAM_BY_CODE[row.code]?.name ?? row.code}: ${row.superBowlPct}% (${row.projectedWins}W proj., ${row.playoffPct}% playoffs)`);
  }
}

main();