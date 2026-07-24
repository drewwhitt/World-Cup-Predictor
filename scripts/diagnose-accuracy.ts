/**
 * Diagnostic: dumps every scored match — group stage AND knockouts, the
 * full completed tournament — with its predicted probabilities vs the
 * actual result, sorted worst-to-best by Brier contribution. Also breaks
 * out a decisive-vs-draw summary specifically for the post-tournament
 * draw-probability recalibration flagged in MODEL_HISTORY.md (v1.11
 * candidate): whether DRAW_PROB_SCALE/DRAW_MIN/DRAW_MAX/the *1.6 gap
 * sensitivity in elo.ts need adjusting now that the full 2026 dataset
 * (not just the group stage) is available to check against.
 *
 * Requires .env.local with VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY —
 * this script can't run in a sandbox without live DB access, so run it
 * locally and share the output.
 *
 * Usage: npx tsx scripts/diagnose-accuracy.ts
 */
import { GROUP_MATCHES, KNOCKOUT_MATCHES, DEFAULT_SETTINGS } from "../src/data";
import { buildInitialElos } from "../src/lib/simulate";
import { matchOutcomeProbabilities, updateElo } from "../src/lib/elo";
import { TEAM_BY_CODE } from "../src/lib/teams";
import { resolveKnockoutMatch, KNOCKOUT_STRUCTURE } from "../src/lib/bracketTree";
import { loadResultsForBuild } from "../src/insights/buildTimeData";
import type { TeamCode } from "../src/lib/types";

type Row = {
  stage: "group" | "knockout";
  round: string;
  match: string;
  predicted: string;
  actual: string;
  brier: number;
  drawProb: number;
  isDraw: boolean;
  homeElo: number;
  awayElo: number;
};

async function main() {
  const stored = await loadResultsForBuild();
  if (!stored) {
    console.error("Could not load live results — check .env.local has VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY");
    process.exit(1);
  }

  const elos = buildInitialElos();
  const rows: Row[] = [];

  // ── Group stage (chronological, so Elo updates carry forward correctly) ──
  const playedGroup = [...GROUP_MATCHES]
    .filter((m) => stored.matches[m.id])
    .sort((a, b) => a.date.localeCompare(b.date) || a.matchday - b.matchday);

  for (const match of playedGroup) {
    const result = stored.matches[match.id];
    const ha = match.isHostMatch ? DEFAULT_SETTINGS.homeAdvantage : 0;
    scoreMatch(rows, "group", "Group", match.home, match.away, result, elos, ha);

    const updated = updateElo(elos[match.home], elos[match.away], result.homeGoals, result.awayGoals, DEFAULT_SETTINGS.kFactor, ha);
    elos[match.home] = updated.home;
    elos[match.away] = updated.away;
  }

  // ── Knockout stage (chronological by date; no host advantage) ──
  const playedKnockout = [...KNOCKOUT_MATCHES]
    .filter((m) => stored.knockoutMatches?.[m.id] && m.id in KNOCKOUT_STRUCTURE)
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const match of playedKnockout) {
    const result = stored.knockoutMatches![match.id];
    const { home, away } = resolveKnockoutMatch(match.id, stored);
    if (!home || !away) continue; // teams not determined yet (shouldn't happen for a played match)

    const round = KNOCKOUT_STRUCTURE[match.id].round;
    scoreMatch(rows, "knockout", round, home, away, result, elos, 0);

    const updated = updateElo(elos[home], elos[away], result.homeGoals, result.awayGoals, DEFAULT_SETTINGS.kFactor, 0);
    elos[home] = updated.home;
    elos[away] = updated.away;
  }

  console.log(`${playedGroup.length} scored group matches + ${playedKnockout.length} scored knockout matches = ${rows.length} total\n`);

  const sorted = [...rows].sort((a, b) => b.brier - a.brier);

  console.log("WORST 15 (highest Brier — biggest misses):");
  for (const r of sorted.slice(0, 15)) {
    console.log(`  ${r.brier.toFixed(3)}  [${r.stage}/${r.round}] ${r.match.padEnd(35)} predicted ${r.predicted}  actual ${r.actual}  (elo ${r.homeElo} v ${r.awayElo})`);
  }

  console.log("\nBEST 10 (lowest Brier):");
  for (const r of sorted.slice(-10).reverse()) {
    console.log(`  ${r.brier.toFixed(3)}  [${r.stage}/${r.round}] ${r.match.padEnd(35)} predicted ${r.predicted}  actual ${r.actual}  (elo ${r.homeElo} v ${r.awayElo})`);
  }

  const avg = rows.reduce((sum, r) => sum + r.brier, 0) / rows.length;
  console.log(`\nOverall average Brier across ${rows.length} matches: ${avg.toFixed(4)}`);

  // ── Draw-specific breakdown — the actual question from MODEL_HISTORY.md ──
  const draws = rows.filter((r) => r.isDraw);
  const decisive = rows.filter((r) => !r.isDraw);
  const avgDrawBrier = draws.length ? draws.reduce((s, r) => s + r.brier, 0) / draws.length : NaN;
  const avgDecisiveBrier = decisive.length ? decisive.reduce((s, r) => s + r.brier, 0) / decisive.length : NaN;
  const avgPredictedDrawProbOverall = rows.reduce((s, r) => s + r.drawProb, 0) / rows.length;
  const observedDrawRate = draws.length / rows.length;
  const avgPredictedDrawProbOnActualDraws = draws.length ? draws.reduce((s, r) => s + r.drawProb, 0) / draws.length : NaN;

  console.log("\n── Draw-probability diagnostic (v1.11 candidate) ──");
  console.log(`Decisive-result matches: ${decisive.length}, avg Brier ${avgDecisiveBrier.toFixed(4)}`);
  console.log(`Draw matches: ${draws.length}, avg Brier ${avgDrawBrier.toFixed(4)}`);
  console.log(`Observed draw rate across the full tournament: ${(observedDrawRate * 100).toFixed(1)}% (historical baseline ~25%)`);
  console.log(`Model's average predicted draw probability (all matches): ${(avgPredictedDrawProbOverall * 100).toFixed(1)}%`);
  console.log(`Model's average predicted draw probability, ON matches that were actually draws: ${(avgPredictedDrawProbOnActualDraws * 100).toFixed(1)}%`);
  console.log("If that last number is well below the observed draw rate, DRAW_PROB_SCALE/DRAW_MAX/the *1.6 sensitivity in elo.ts are still under-predicting draws with the complete dataset.");
}

function scoreMatch(
  rows: Row[],
  stage: "group" | "knockout",
  round: string,
  home: TeamCode,
  away: TeamCode,
  result: { homeGoals: number; awayGoals: number },
  elos: Record<TeamCode, number>,
  ha: number,
) {
  const { homeWin, draw, awayWin } = matchOutcomeProbabilities(elos[home], elos[away], ha);
  const actual = result.homeGoals > result.awayGoals ? "home" : result.homeGoals < result.awayGoals ? "away" : "draw";
  const outcome = { home: actual === "home" ? 1 : 0, draw: actual === "draw" ? 1 : 0, away: actual === "away" ? 1 : 0 };
  // Divided by 3 to match the scale used everywhere else in the app
  // (lib/accuracy.ts, RANDOM_BASELINE_BRIER=0.2222, BACKTESTED_BRIER=0.1877)
  // — omitting this made every number here read ~3x worse than reality,
  // the exact bug lib/accuracy.ts's own comments already warned about.
  const brier = ((homeWin - outcome.home) ** 2 + (draw - outcome.draw) ** 2 + (awayWin - outcome.away) ** 2) / 3;

  const homeName = TEAM_BY_CODE[home]?.name ?? home;
  const awayName = TEAM_BY_CODE[away]?.name ?? away;

  rows.push({
    stage,
    round,
    match: `${homeName} vs ${awayName}`,
    predicted: `H:${(homeWin * 100).toFixed(0)}% D:${(draw * 100).toFixed(0)}% A:${(awayWin * 100).toFixed(0)}%`,
    actual: `${result.homeGoals}-${result.awayGoals} (${actual})`,
    brier: Number(brier.toFixed(3)),
    drawProb: draw,
    isDraw: actual === "draw",
    homeElo: Math.round(elos[home]),
    awayElo: Math.round(elos[away]),
  });
}

main().catch((err) => {
  console.error("diagnose-accuracy failed:", err);
  process.exit(1);
});