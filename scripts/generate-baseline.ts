import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import rawFixtures from "../src/data/worldcup-fixtures.json";
import { buildGroupFixtures, buildKnockoutFixtures } from "../src/lib/fixtures";
import { runSimulation } from "../src/lib/simulate";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "../src/data/baseline.json");

const settings = { kFactor: 32, homeAdvantage: 65, simulations: 10000 };
const groupMatches = buildGroupFixtures(rawFixtures);
const knockout = buildKnockoutFixtures(rawFixtures);

const result = runSimulation(groupMatches, knockout, settings, 2026);

const payload = {
  generatedAt: new Date().toISOString(),
  label: "Pre-tournament baseline (no results played)",
  simulations: settings.simulations,
  probabilities: result.probabilities,
};

writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log(`Baseline written to ${outPath}`);
console.log("Top 5 title favorites:");
for (const row of result.probabilities.slice(0, 5)) {
  console.log(`  ${row.name}: ${(row.champion * 100).toFixed(1)}%`);
}
