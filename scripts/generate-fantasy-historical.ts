/**
 * Derives real historical PPR fantasy season totals (2020–2024, REG season
 * only) from nflverse's weekly player stats, so the fantasy engine has
 * actual outcomes to validate replacement-level thresholds and (later)
 * fit the Monte Carlo distributions against — not assumed numbers.
 *
 * Mirrors generate-nfl-baseline.ts's role for team Elo: a small,
 * precomputed JSON the app/scripts can import directly, instead of
 * re-fetching and re-parsing a 30+MB CSV from nflverse on every run.
 *
 * nflverse already computes `fantasy_points_ppr` per player per week —
 * this script only aggregates it (REG season, QB/RB/WR/TE) and does not
 * re-derive PPR scoring from raw box-score stats.
 *
 * Usage: npx tsx scripts/generate-fantasy-historical.ts
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Position } from "../src/lib/fantasy/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "../src/data/fantasy/historical-player-seasons.json");

const SOURCE_URL = "https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv";
const SEASONS = ["2020", "2021", "2022", "2023", "2024"]; // extend as future seasons become available
const FANTASY_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

export interface HistoricalPlayerSeason {
  name: string;
  position: Position;
  points: number;
  games: number;
}

export interface HistoricalFantasyData {
  generatedAt: string;
  label: string;
  source: string;
  seasons: Record<string, HistoricalPlayerSeason[]>;
}

/**
 * Quote-aware CSV line parser — handles embedded commas inside quoted
 * fields (this nflverse export has at least one such field), which a
 * naive split(",") silently misaligns every column after it without
 * erroring. Handles doubled-quote escaping ("") for quotes inside a
 * quoted field, which is the one other case plain CSVs commonly need.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      result.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

async function main() {
  console.log(`Fetching ${SOURCE_URL} ...`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch nflverse player stats: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  const lines = text.split("\n").filter((l) => l.length > 0);
  const header = parseCsvLine(lines[0]);

  const col = (name: string) => {
    const idx = header.indexOf(name);
    if (idx === -1) throw new Error(`Expected column "${name}" not found in nflverse CSV header`);
    return idx;
  };

  const idxSeason = col("season");
  const idxSeasonType = col("season_type");
  const idxPosition = col("position");
  const idxName = col("player_display_name");
  const idxPpr = col("fantasy_points_ppr");

  type Agg = { points: number; games: number; position: Position };
  const bySeasonPlayer: Record<string, Map<string, Agg>> = {};
  for (const season of SEASONS) bySeasonPlayer[season] = new Map();

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const season = fields[idxSeason];
    if (!SEASONS.includes(season)) continue;
    if (fields[idxSeasonType] !== "REG") continue;
    const position = fields[idxPosition] as Position;
    if (!FANTASY_POSITIONS.has(position)) continue;

    const name = fields[idxName];
    const pts = Number(fields[idxPpr]) || 0;

    const map = bySeasonPlayer[season];
    const existing = map.get(name);
    if (existing) {
      existing.points += pts;
      existing.games += 1;
    } else {
      map.set(name, { points: pts, games: 1, position });
    }
  }

  const seasons: Record<string, HistoricalPlayerSeason[]> = {};
  for (const season of SEASONS) {
    const rows: HistoricalPlayerSeason[] = Array.from(bySeasonPlayer[season].entries()).map(
      ([name, agg]) => ({
        name,
        position: agg.position,
        points: Number(agg.points.toFixed(1)),
        games: agg.games,
      }),
    );
    rows.sort((a, b) => b.points - a.points);
    seasons[season] = rows;
  }

  const payload: HistoricalFantasyData = {
    generatedAt: new Date().toISOString(),
    label: "Real derived PPR season totals (REG season only), QB/RB/WR/TE — nflverse fantasy_points_ppr aggregated per player per season",
    source: "https://github.com/nflverse/nflverse-data",
    seasons,
  };

  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`Written to ${outPath}`);
  for (const season of SEASONS) {
    const top3 = seasons[season].slice(0, 3);
    console.log(
      `  ${season}: ${seasons[season].length} players — top 3: ${top3
        .map((p) => `${p.name} (${p.points})`)
        .join(", ")}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});