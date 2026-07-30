/**
 * Joins real 2020 preseason consensus rankings against real nflverse
 * outcomes, extending the fit pool beyond Drew's manually-compiled
 * 2021-2024 years. Kept as its own separate file (not merged into
 * adp-vs-actual-2021-2024.json) deliberately — that file is Drew's own
 * compiled work product; this one is derived from a different, external
 * source, and keeping the provenance separate matters if either needs
 * to be revisited independently later.
 *
 * Source: dynastyprocess/data (GPL-3.0, github.com/dynastyprocess/data),
 * an open, actively-maintained community dataset built from FantasyPros
 * Expert Consensus Rankings — NOT redistributed here; only the raw
 * scrape_date=2020-09-03 "redraft-offense" snapshot (the last one before
 * that season's Week 1) was extracted into raw-adp-2020.json as plain
 * (name, position, rank) tuples, which is what actually gets committed.
 * Predates the "redraft-overall" page_type used in later years of that
 * same dataset — this was the equivalent category at the time.
 *
 * 2019 was checked and deliberately excluded: the earliest real data in
 * that source is 2019-12-27 (in-season, not pre-draft) — there is no
 * real 2019 preseason snapshot available, so it isn't included here
 * rather than approximated.
 *
 * Usage: npx tsx scripts/generate-fantasy-adp-2020.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildByLastName, matchName, resolveAmbiguous, KNOWN_ALIASES } from "../src/lib/fantasy/nameMatching";
import type { AdpVsActualEntry, Position } from "../src/lib/fantasy/types";
import historical from "../src/data/fantasy/historical-player-seasons.json";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rawPath = join(__dirname, "raw-adp-2020.json");
const outPath = join(__dirname, "../src/data/fantasy/adp-vs-actual-2020.json");

const FANTASY_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

interface RawEntry { rawName: string; consensusRank: number; pos: string }
interface HistoricalPlayer { name: string; position: Position; points: number; games: number }

const raw = JSON.parse(readFileSync(rawPath, "utf-8")) as RawEntry[];
const historicalData = historical as { seasons: Record<string, HistoricalPlayer[]> };

function main() {
  const pool = historicalData.seasons["2020"].filter((p) => p.games > 0);
  const byLastName = buildByLastName(pool, (p) => p.name);

  const joined: AdpVsActualEntry[] = [];
  let exactCount = 0, ambiguousResolvedCount = 0, unmatchedCount = 0, skippedNonFantasyPos = 0;
  const unmatchedNames: string[] = [];

  for (const entry of raw) {
    if (!FANTASY_POSITIONS.has(entry.pos)) {
      skippedNonFantasyPos++; // DST/PK — not part of this engine
      continue;
    }

    const result = matchName(entry.rawName, byLastName, (p) => p.name, KNOWN_ALIASES);
    let matched = result.matched;

    if (!matched && result.candidates) {
      matched = resolveAmbiguous(result.candidates, (p) => p.points).chosen;
      ambiguousResolvedCount++;
    } else if (result.status === "exact" || result.status === "exact_first_token") {
      exactCount++;
    }

    if (!matched) {
      unmatchedCount++;
      unmatchedNames.push(entry.rawName);
      continue;
    }

    joined.push({
      name: matched.name,
      position: matched.position,
      consensusRank: entry.consensusRank,
      actualPoints: matched.points,
      games: matched.games,
    });
  }

  console.log(
    `2020: ${joined.length}/${raw.length - skippedNonFantasyPos} matched (excluding ${skippedNonFantasyPos} DST/PK rows) ` +
    `(${exactCount} exact/token, ${ambiguousResolvedCount} resolved via points tiebreak), ` +
    `${unmatchedCount} unmatched: ${unmatchedNames.join(", ") || "none"}`,
  );

  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        label: "2020 preseason consensus rankings (dynastyprocess/data, GPL-3.0 source — see script docstring), joined against nflverse-derived actual PPR season outcomes",
        entries: joined,
      },
      null,
      2,
    ),
  );
  console.log(`Written to ${outPath}`);
}

main();