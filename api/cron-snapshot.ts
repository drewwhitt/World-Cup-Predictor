import { createClient } from "@supabase/supabase-js";
import { buildLiveTeams, buildLiveMorningForecast } from "../src/data/veridexLive.js";
import type { StoredResults } from "../src/lib/types";

/**
 * Automates what the admin panel's "Snapshot odds + publish today's
 * briefing" button does manually — runs on a schedule via Vercel Cron
 * (see vercel.json) instead of relying on someone remembering to click
 * it every morning.
 *
 * This imports buildLiveTeams/buildLiveMorningForecast directly from
 * src/ and runs them server-side. That only works because that
 * computation layer (simulate.ts, elo.ts, bracketTree.ts, veridexLive.ts)
 * has zero browser-only dependencies — no window/localStorage/document —
 * confirmed before building this. If that ever changes, this function
 * would need to change with it.
 *
 * Security: Vercel automatically sends `Authorization: Bearer <CRON_SECRET>`
 * on requests it triggers itself, once CRON_SECRET is set as a Vercel
 * environment variable — this function rejects anything else, so it
 * can't be triggered by a random request to the URL.
 *
 * Required Vercel environment variables (same SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY already used by save-result.ts, plus):
 *   CRON_SECRET — any random string; add it as a Vercel env var, and
 *                 Vercel's Cron scheduler will send it automatically.
 *                 (Not the same secret as ADMIN_WRITE_SECRET.)
 */

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const cronSecret = process.env.CRON_SECRET;

type MinimalRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
};
type MinimalResponse = {
  status: (code: number) => MinimalResponse;
  json: (body: unknown) => void;
};

export default async function handler(req: MinimalRequest, res: MinimalResponse) {
  if (!supabaseUrl || !serviceRoleKey || !cronSecret) {
    console.error("Missing required environment variables for cron-snapshot function");
    res.status(500).json({ error: "Server misconfigured" });
    return;
  }

  const authHeader = req.headers?.authorization;
  if (authHeader !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Same row -> StoredResults transform as loadOfficialResults() in
    // src/lib/supabase.ts, just against the service-role client instead
    // of the client-side anon one.
    const { data, error: readError } = await supabase
      .from("match_results")
      .select("match_id, home_goals, away_goals, penalty_winner");
    if (readError) throw readError;

    const stored: StoredResults = { matches: {}, knockoutMatches: {} };
    for (const row of data ?? []) {
      const score = {
        homeGoals: row.home_goals,
        awayGoals: row.away_goals,
        ...(row.penalty_winner ? { penaltyWinner: row.penalty_winner as "home" | "away" } : {}),
      };
      if (row.match_id.startsWith("ko-")) {
        stored.knockoutMatches![row.match_id] = score;
      } else {
        stored.matches[row.match_id] = score;
      }
    }

    const liveTeams = buildLiveTeams(stored);
    const briefing = buildLiveMorningForecast(liveTeams, stored);
    const today = new Date().toISOString().slice(0, 10);

    const snapshotRows = liveTeams.map((t) => ({
      sport: "world_cup",
      team_code: t.code,
      snapshot_date: today,
      metric: "champion_pct",
      value: t.current,
      reason: null,
    }));

    const { error: snapshotError } = await supabase
      .from("probability_snapshots")
      .upsert(snapshotRows, { onConflict: "sport,team_code,snapshot_date,metric" });
    if (snapshotError) throw snapshotError;

    const { error: briefingError } = await supabase
      .from("daily_briefings")
      .upsert(
        { sport: "world_cup", briefing_date: today, payload: briefing },
        { onConflict: "sport,briefing_date" },
      );
    if (briefingError) throw briefingError;

    res.status(200).json({ ok: true, date: today, teamsSnapshotted: liveTeams.length });
  } catch (err) {
    console.error("cron-snapshot error:", err);
    res.status(500).json({ error: "Snapshot failed" });
  }
}