/**
 * Measures real wall-clock time for the NFL season+playoff Monte Carlo
 * simulator at a few different simulation counts, so the live-vs-
 * precomputed decision for NFLForecastsView is based on an actual
 * number, not a guess. Directly relevant given TrendsView was shelved
 * for a ~3-4s blocking compute — this checks whether NFLForecastsView
 * risks the same fate before it's wired into the UI at all.
 *
 * Usage: npx tsx scripts/benchmark-nfl-sim.ts
 */
import { NFL_TEAMS } from "../src/data/nfl/teams";
import { NFL_SCHEDULE, buildNflTeams } from "../src/data/nfl/nflLive";
import { runNflMonteCarlo, type SimTeam, type SimGame } from "../src/lib/engine/sports/nflSeasonSim";

const SIM_TEAMS: SimTeam[] = NFL_TEAMS.map((t) => ({ code: t.code, conference: t.conference, division: t.division }));
const SIM_SCHEDULE: SimGame[] = NFL_SCHEDULE.map((g) => ({ id: g.id, week: g.week, home: g.home, away: g.away, neutral: g.neutral, div: g.div }));
const eloByCode = new Map(buildNflTeams().map((t) => [t.code, t.elo]));
const initialElos = Object.fromEntries(SIM_TEAMS.map((t) => [t.code, eloByCode.get(t.code) ?? 1505]));

for (const n of [100, 500, 1000, 2000, 5000, 10000]) {
  const start = performance.now();
  const result = runNflMonteCarlo(SIM_TEAMS, SIM_SCHEDULE, initialElos, n);
  const ms = performance.now() - start;
  const top = result[0];
  console.log(`n=${String(n).padStart(5)}   ${ms.toFixed(0).padStart(6)}ms   (top: ${top.code} ${top.projectedWins}W, ${top.playoffPct}% playoffs, ${top.superBowlPct}% SB)`);
}