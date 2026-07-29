/**
 * rankings.ts (fantasy)
 * Load/save for versioned consensus ranking snapshots — the "Rankings as
 * of [date]" system. Mirrors dailyBriefing.ts's shape exactly: writes go
 * through /api/save-result.ts (service-role key, admin-secret gated,
 * same reasoning as everywhere else — the anon key is public), reads
 * are plain public SELECTs against fantasy_rankings_snapshots (see
 * supabase/fantasy_rankings_snapshots.sql for the table + RLS policy).
 *
 * Unlike daily_briefings (one snapshot per day, always "today's"), a
 * fantasy rankings snapshot is pushed manually whenever the admin
 * re-compiles the consensus board during the pre-draft month — so this
 * always loads "whatever was most recently pushed for this season",
 * not "today's", the same way loadLatestDailyBriefing does for briefings.
 */
import { supabase, callSaveResultApi } from "../supabase";
import type { FantasyRankingsPayload } from "./types";

/**
 * Save a new ranking snapshot for a season. Upserts by (season,
 * snapshot_date) — re-pushing the same day overwrites rather than
 * duplicating, same behavior as recordSnapshot/saveDailyBriefing.
 */
export async function saveFantasyRankingsSnapshot(
  season: number,
  payload: FantasyRankingsPayload,
  date: string = new Date().toISOString().slice(0, 10),
): Promise<void> {
  await callSaveResultApi({ action: "fantasy_rankings", season, date, payload });
}

/**
 * Load the most recently pushed ranking snapshot for a season, whatever
 * date it's from. Callers should treat a null return as "no rankings
 * pushed yet this season" — there is deliberately no live-computed
 * fallback here (unlike daily briefings), since there's no sensible
 * default consensus board to fall back to.
 */
export async function loadLatestFantasyRankings(
  season: number,
): Promise<{ date: string; payload: FantasyRankingsPayload } | null> {
  const { data, error } = await supabase
    .from("fantasy_rankings_snapshots")
    .select("snapshot_date, payload")
    .eq("season", season)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error loading fantasy rankings snapshot:", error);
    return null;
  }
  if (!data) return null;

  return { date: data.snapshot_date as string, payload: data.payload as FantasyRankingsPayload };
}