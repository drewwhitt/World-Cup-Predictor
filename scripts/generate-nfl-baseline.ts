/**
 * Computes each team's 2026 preseason Elo baseline: runs the real
 * chronological history (1999–2025, from historical-games.json) through
 * the same engine backtest-nfl.ts uses, then applies one final
 * season-reset (mean reversion) after 2025 — that reverted number is
 * where every team actually starts the 2026 season.
 *
 * This mirrors generate-baseline.ts's role for the World Cup: a small,
 * precomputed JSON the live app can import directly, instead of
 * re-running the full 7,276-game history (1.5MB) in the browser.
 *
 * Usage: npx tsx scripts/generate-nfl-baseline.ts
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import historicalGames from "../src/data/nfl/historical-games.json";
import { NFL_TEAMS } from "../src/data/nfl/teams.ts";
import { updateNFLElo, nflSeasonReset } from "../src/lib/engine/sports/NFL";

interface HistGame {
  season: number;
  type: string;
  week: number;
  date: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  div: boolean;
  homeRest: number | null;
  awayRest: number | null;
}

const games = historicalGames as HistGame[];
const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "../src/data/nfl/baseline-2026.json");

function main() {
  const sorted = [...games].sort((a, b) => a.season - b.season || a.week - b.week || a.date.localeCompare(b.date));
  const elos: Record<string, number> = {};
  let currentSeason: number | null = null;

  for (const game of sorted) {
    if (currentSeason !== null && game.season !== currentSeason) {
      const reverted = nflSeasonReset(elos);
      for (const code of Object.keys(reverted)) elos[code] = reverted[code];
    }
    currentSeason = game.season;

    if (!(game.home in elos)) elos[game.home] = 1500;
    if (!(game.away in elos)) elos[game.away] = 1500;

    const ctx = {
      homeRestDays: game.homeRest ?? undefined,
      awayRestDays: game.awayRest ?? undefined,
      isDivisional: game.div,
      isPlayoff: game.type !== "REG",
    };

    const updated = updateNFLElo(elos[game.home], elos[game.away], game.homeScore, game.awayScore, ctx);
    elos[game.home] = updated.home;
    elos[game.away] = updated.away;
  }

  // Final reset — this is the actual 2026 preseason starting point.
  const preseasonElos = nflSeasonReset(elos);

  const rows = NFL_TEAMS.map((t) => ({
    code: t.code,
    elo: Number((preseasonElos[t.code] ?? 1505).toFixed(1)),
  })).sort((a, b) => b.elo - a.elo);

  const payload = {
    generatedAt: new Date().toISOString(),
    label: "2026 preseason baseline — derived from real 1999–2025 results (nflverse/nfldata), mean-reverted for the new season",
    source: "https://github.com/nflverse/nfldata",
    elos: rows,
  };

  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`Baseline written to ${outPath}`);
  console.log("Top 5 by preseason Elo:");
  for (const row of rows.slice(0, 5)) {
    console.log(`  ${row.code}: ${row.elo}`);
  }
}

main();