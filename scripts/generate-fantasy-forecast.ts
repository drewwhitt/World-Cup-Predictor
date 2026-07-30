/**
 * Precomputes the fantasy Monte Carlo forecast (10,000 draws) for each
 * standard-roster league size (8/10/12/14 teams) and writes it to a
 * static JSON per size. Benchmarked at ~1.5s for a ~140-player board at
 * 10,000 draws — not as slow as the NFL forecast's ~3s, but still
 * squarely in "don't do this on every UI interaction" territory (see
 * generate-nfl-forecast.ts's docstring — same reasoning, same fix).
 * FantasyView only computes live for custom (non-standard) rosters,
 * which can't be precomputed since there are infinitely many of them.
 *
 * Unlike generate-nfl-forecast.ts, this needs a live read from Supabase
 * (the current consensus rankings snapshot, which changes throughout
 * the pre-draft month) — so unlike that script, this one can't run from
 * committed static data alone. It uses its own minimal Supabase client
 * with plain process.env vars (NOT import.meta.env — that's a Vite-only
 * API and doesn't exist in a plain Node/tsx script), reading the anon
 * key only, since this is a read, not a write.
 *
 * Required env vars (a plain .env file in the repo root works — this
 * script loads one manually below, no new dependency added for it):
 *   SUPABASE_URL       — same value as VITE_SUPABASE_URL
 *   SUPABASE_ANON_KEY  — same value as VITE_SUPABASE_ANON_KEY (public,
 *                        read-only under RLS — this script never writes)
 *
 * Re-run this every time you push an updated rankings snapshot from the
 * admin panel — the precomputed files are matched against the ranking
 * snapshot's date, so a stale one is simply ignored by the live app
 * rather than served by mistake (see precomputed.ts), but visitors
 * won't get the instant path again until this has actually been re-run.
 *
 * Usage: npx tsx scripts/generate-fantasy-forecast.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { computeFantasyForecast } from "../src/lib/fantasy/forecast";
import { LEAGUE_SIZE_PRESETS, STANDARD_ROSTER, FANTASY_SEASON } from "../src/lib/fantasy/types";
import type { AdpVsActualEntry, FantasyRankingsPayload } from "../src/lib/fantasy/types";
import type { PlayerRiskFactors } from "../src/lib/fantasy/curveFit";
import adpVsActualData from "../src/data/fantasy/adp-vs-actual-2021-2024.json";
import adpVsActual2020Data from "../src/data/fantasy/adp-vs-actual-2020.json";
import historicalData from "../src/data/fantasy/historical-player-seasons.json";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEASON = FANTASY_SEASON;
const SIMULATIONS = 10000;

// --- tiny .env loader, no new dependency ---
// Checks .env.local first, then .env — same precedence Vite itself
// uses, and this repo's .gitignore (`*.local`) strongly implies local
// secrets live in .env.local specifically, not .env.
function loadEnvFile(filename: string) {
  const path = join(__dirname, `../${filename}`);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match) continue;
    const [, key, rawValue = ""] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

async function main() {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "Missing SUPABASE_URL / SUPABASE_ANON_KEY (checked process.env, .env.local, and .env in the repo root). " +
      "Nothing to do — this script needs to read the current rankings snapshot from Supabase.",
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data, error } = await supabase
    .from("fantasy_rankings_snapshots")
    .select("snapshot_date, payload")
    .eq("season", SEASON)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error loading fantasy rankings snapshot:", error);
    process.exit(1);
  }
  if (!data) {
    console.log(
      `No fantasy rankings snapshot found for season ${SEASON} yet — nothing to precompute. ` +
      `Push a rankings snapshot from the admin panel first, then re-run this.`,
    );
    return;
  }

  const snapshotDate = data.snapshot_date as string;
  const payload = data.payload as FantasyRankingsPayload;
  console.log(`Loaded rankings snapshot dated ${snapshotDate} (${payload.entries.length} players).`);

  const fitPool: AdpVsActualEntry[] = [
    ...Object.values((adpVsActualData as { seasons: Record<string, AdpVsActualEntry[]> }).seasons).flat(),
    ...(adpVsActual2020Data as { entries: AdpVsActualEntry[] }).entries,
  ];
  console.log(`Fit pool: ${fitPool.length} real player-seasons (2020, 2021-2024).`);

  // Real risk factors from the most recent season nflverse actually has
  // (dynamically picked, not hardcoded — currently 2024, since 2025
  // hasn't landed in nflverse's release yet as of this writing; this
  // will just pick it up automatically once it does).
  const historical = historicalData as { seasons: Record<string, Array<{ name: string; games: number }>> };
  const latestHistoricalSeason = Object.keys(historical.seasons).sort().at(-1)!;
  const gamesByName = new Map(historical.seasons[latestHistoricalSeason].map((p) => [p.name, p.games]));
  console.log(`Using ${latestHistoricalSeason} games-played as the "last season" risk signal.`);

  const riskByName = new Map<string, PlayerRiskFactors>();
  for (const entry of payload.entries) {
    const gamesLastSeason = gamesByName.get(entry.name);
    if (gamesLastSeason === undefined) {
      riskByName.set(entry.name, { limitedHistory: true });
    } else {
      riskByName.set(entry.name, { gamesMissedLastSeason: Math.max(0, 17 - gamesLastSeason) });
    }
  }

  for (const teams of LEAGUE_SIZE_PRESETS) {
    console.log(`Simulating ${teams}-team standard roster (${SIMULATIONS.toLocaleString()} draws)...`);
    const start = Date.now();
    const results = computeFantasyForecast(payload.entries, fitPool, teams, STANDARD_ROSTER, riskByName, SIMULATIONS);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    const outPayload = {
      generatedAt: new Date().toISOString(),
      season: SEASON,
      snapshotDate,
      teams,
      roster: STANDARD_ROSTER,
      results,
    };
    const outPath = join(__dirname, `../src/data/fantasy/forecast-${teams}-standard.json`);
    writeFileSync(outPath, JSON.stringify(outPayload, null, 2));
    console.log(`  done in ${elapsed}s — written to ${outPath}`);
  }
}

main();