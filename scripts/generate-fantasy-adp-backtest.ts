/**
 * Joins raw historical consensus ADP (2021–2024, manually compiled from
 * ESPN/CBS/FantasyPros/etc. and extracted as plain (name, rank) pairs —
 * see raw-adp-2021-2024.json) against real nflverse-derived season
 * outcomes (historical-player-seasons.json), using the validated
 * name-matching module.
 *
 * This is the dataset simulate.ts's curve-fitting is built on: "a player
 * drafted around consensus rank N historically scored X points with Y
 * variance" only means something if N and X come from the same real
 * player, matched correctly — see nameMatching.ts's docstring for why
 * that isn't as trivial as it sounds.
 *
 * Ambiguous matches are resolved by picking whichever candidate scored
 * the most real points that season — appropriate here because we're
 * looking backward at a season that already happened (unlike a live
 * current-season admin import, where this tiebreak wouldn't be
 * available and ambiguous cases should go to manual review instead).
 *
 * Usage: npx tsx scripts/generate-fantasy-adp-backtest.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildByLastName, matchName, resolveAmbiguous, KNOWN_ALIASES } from "../src/lib/fantasy/nameMatching";
import type { AdpVsActualEntry, Position } from "../src/lib/fantasy/types";
import historical from "../src/data/fantasy/historical-player-seasons.json";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rawAdpPath = join(__dirname, "raw-adp-2021-2024.json");
const outPath = join(__dirname, "../src/data/fantasy/adp-vs-actual-2021-2024.json");

interface RawAdpEntry { rawName: string; consensusRank: number }
interface HistoricalPlayer { name: string; position: Position; points: number; games: number }

const rawAdp = JSON.parse(readFileSync(rawAdpPath, "utf-8")) as Record<string, RawAdpEntry[]>;
const historicalData = historical as { seasons: Record<string, HistoricalPlayer[]> };

function main() {
  const bySeasonResult: Record<string, AdpVsActualEntry[]> = {};

  for (const season of Object.keys(rawAdp)) {
    const pool = historicalData.seasons[season].filter((p) => p.games > 0);
    const byLastName = buildByLastName(pool, (p) => p.name);

    const joined: AdpVsActualEntry[] = [];
    let exactCount = 0, ambiguousResolvedCount = 0, unmatchedCount = 0;
    const unmatchedNames: string[] = [];

    for (const { rawName, consensusRank } of rawAdp[season]) {
      const result = matchName(rawName, byLastName, (p) => p.name, KNOWN_ALIASES);
      let matched = result.matched;

      if (!matched && result.candidates) {
        matched = resolveAmbiguous(result.candidates, (p) => p.points).chosen;
        ambiguousResolvedCount++;
      } else if (result.status === "exact" || result.status === "exact_first_token") {
        exactCount++;
      }

      if (!matched) {
        unmatchedCount++;
        unmatchedNames.push(rawName);
        continue;
      }

      joined.push({
        name: matched.name,
        position: matched.position,
        consensusRank,
        actualPoints: matched.points,
        games: matched.games,
      });
    }

    bySeasonResult[season] = joined;
    console.log(
      `${season}: ${joined.length}/${rawAdp[season].length} matched ` +
      `(${exactCount} exact/token, ${ambiguousResolvedCount} resolved via points tiebreak), ` +
      `${unmatchedCount} unmatched: ${unmatchedNames.join(", ") || "none"}`,
    );
  }

  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        label: "Real consensus ADP (manually compiled 2021-2024) joined against nflverse-derived actual PPR season outcomes",
        seasons: bySeasonResult,
      },
      null,
      2,
    ),
  );
  console.log(`\nWritten to ${outPath}`);
}

main();