/**
 * Diagnostic: dumps every scored group-stage match with its predicted
 * probabilities vs the actual result, sorted worst-to-best by Brier
 * contribution. Run this with real Supabase data to see WHY the overall
 * group-stage Brier score looks the way it does — a single bad number
 * can't tell you if it's a bug or genuine chaos, but the per-match list
 * usually makes it obvious.
 *
 * Usage: npx tsx scripts/diagnose-accuracy.ts
 */
import { GROUP_MATCHES, DEFAULT_SETTINGS } from "../src/data";
import { buildInitialElos } from "../src/lib/simulate";
import { matchOutcomeProbabilities, updateElo } from "../src/lib/elo";
import { TEAM_BY_CODE } from "../src/lib/teams";
import { loadResultsForBuild } from "../src/insights/buildTimeData";

async function main() {
  const stored = await loadResultsForBuild();
  if (!stored) {
    console.error("Could not load live results — check .env.local has VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY");
    process.exit(1);
  }

  const elos = buildInitialElos();
  const played = [...GROUP_MATCHES]
    .filter((m) => stored.matches[m.id])
    .sort((a, b) => a.date.localeCompare(b.date) || a.matchday - b.matchday);

  console.log(`${played.length} scored group matches\n`);

  const rows: Array<{
    match: string;
    predicted: string;
    actual: string;
    brier: number;
    homeElo: number;
    awayElo: number;
  }> = [];

  for (const match of played) {
    const result = stored.matches[match.id];
    const ha = match.isHostMatch ? DEFAULT_SETTINGS.homeAdvantage : 0;
    const { homeWin, draw, awayWin } = matchOutcomeProbabilities(elos[match.home], elos[match.away], ha);

    const actual = result.homeGoals > result.awayGoals ? "home" : result.homeGoals < result.awayGoals ? "away" : "draw";
    const outcome = { home: actual === "home" ? 1 : 0, draw: actual === "draw" ? 1 : 0, away: actual === "away" ? 1 : 0 };
    const brier = (homeWin - outcome.home) ** 2 + (draw - outcome.draw) ** 2 + (awayWin - outcome.away) ** 2;

    const homeName = TEAM_BY_CODE[match.home]?.name ?? match.home;
    const awayName = TEAM_BY_CODE[match.away]?.name ?? match.away;

    rows.push({
      match: `${homeName} vs ${awayName}`,
      predicted: `H:${(homeWin * 100).toFixed(0)}% D:${(draw * 100).toFixed(0)}% A:${(awayWin * 100).toFixed(0)}%`,
      actual: `${result.homeGoals}-${result.awayGoals} (${actual})`,
      brier: Number(brier.toFixed(3)),
      homeElo: Math.round(elos[match.home]),
      awayElo: Math.round(elos[match.away]),
    });

    const updated = updateElo(elos[match.home], elos[match.away], result.homeGoals, result.awayGoals, DEFAULT_SETTINGS.kFactor, ha);
    elos[match.home] = updated.home;
    elos[match.away] = updated.away;
  }

  rows.sort((a, b) => b.brier - a.brier);

  console.log("WORST 15 (highest Brier — biggest misses):");
  for (const r of rows.slice(0, 15)) {
    console.log(`  ${r.brier.toFixed(3)}  ${r.match.padEnd(35)} predicted ${r.predicted}  actual ${r.actual}  (elo ${r.homeElo} v ${r.awayElo})`);
  }

  console.log("\nBEST 10 (lowest Brier):");
  for (const r of rows.slice(-10).reverse()) {
    console.log(`  ${r.brier.toFixed(3)}  ${r.match.padEnd(35)} predicted ${r.predicted}  actual ${r.actual}  (elo ${r.homeElo} v ${r.awayElo})`);
  }

  const avg = rows.reduce((sum, r) => sum + r.brier, 0) / rows.length;
  console.log(`\nAverage Brier across ${rows.length} matches: ${avg.toFixed(4)}`);
}

main().catch((err) => {
  console.error("diagnose-accuracy failed:", err);
  process.exit(1);
});