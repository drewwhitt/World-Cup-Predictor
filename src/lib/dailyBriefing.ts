/**
 * dailyBriefing.ts
 * Backs "Today's Briefing" with an actual once-a-day snapshot instead of
 * a value that recomputes on every render from live results.
 *
 * Writes go through /api/save-result (service-role key, admin-secret
 * gated) — same reasoning as match_results and probability_snapshots:
 * the anon key is public, so direct client-side writes would either be
 * rejected by RLS or, worse, be writable by anyone who found the key.
 * Reads are plain public SELECTs, same as everything else read-only.
 */
import { supabase, callSaveResultApi } from "./supabase";
import type { SportKey } from "./snapshots";

/**
 * Save today's briefing payload for a sport. Upserts by (sport, date),
 * so re-snapshotting later the same day overwrites rather than
 * duplicating — same behavior as recordSnapshot.
 */
export async function saveDailyBriefing(
  sport: SportKey,
  payload: Record<string, unknown>,
  date: string = new Date().toISOString().slice(0, 10),
): Promise<void> {
  await callSaveResultApi({ action: "briefing", sport, date, payload });
}

/**
 * Load the most recently saved briefing for a sport, whatever date it's
 * from. Callers fall back to a live-computed briefing when this returns
 * null — pre-launch, or any day before the admin has snapshotted yet.
 */
export async function loadLatestDailyBriefing<T = Record<string, unknown>>(
  sport: SportKey,
): Promise<{ date: string; payload: T } | null> {
  const { data, error } = await supabase
    .from("daily_briefings")
    .select("briefing_date, payload")
    .eq("sport", sport)
    .order("briefing_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error loading daily briefing:", error);
    return null;
  }
  if (!data) return null;

  return { date: data.briefing_date as string, payload: data.payload as T };
}