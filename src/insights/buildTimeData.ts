/**
 * Node-compatible Supabase access for build-time scripts (generate-insights.tsx).
 *
 * src/lib/supabase.ts can't be reused here — it reads `import.meta.env`,
 * which only exists inside Vite's own build/dev process, not in a plain
 * `tsx scripts/foo.ts` invocation. This reads the same env var NAMES
 * (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) so no new secrets are
 * needed, just a different way of reading them:
 *
 *   - Locally: parses .env.local directly (tsx doesn't auto-load it).
 *   - On Vercel: these are already in process.env for the whole build
 *     command, since Vite itself needs them there too — this is a no-op
 *     fallback in that case.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";
import type { StoredResults } from "../lib/types";

function loadEnvLocal() {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

/**
 * Returns null (rather than throwing) if Supabase isn't reachable at
 * build time — the accuracy page falls back to a "not enough data yet"
 * state instead of failing the whole build over a missing/misconfigured
 * env var.
 */
export async function loadResultsForBuild(): Promise<StoredResults | null> {
  loadEnvLocal();
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn("  [model-accuracy] VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY not found — skipping live data");
    return null;
  }

  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from("match_results")
      .select("match_id, home_goals, away_goals, penalty_winner");
    if (error) throw error;

    const matches: StoredResults["matches"] = {};
    const knockoutMatches: NonNullable<StoredResults["knockoutMatches"]> = {};
    for (const row of data ?? []) {
      const score = {
        homeGoals: row.home_goals,
        awayGoals: row.away_goals,
        ...(row.penalty_winner ? { penaltyWinner: row.penalty_winner as "home" | "away" } : {}),
      };
      if (row.match_id.startsWith("ko-")) knockoutMatches[row.match_id] = score;
      else matches[row.match_id] = score;
    }
    return { matches, knockoutMatches };
  } catch (err) {
    console.warn("  [model-accuracy] Failed to fetch live results — skipping live data:", err);
    return null;
  }
}