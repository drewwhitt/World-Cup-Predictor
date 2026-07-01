/**
 * snapshots.ts
 * Daily probability snapshot system — the foundation for "movers" across
 * the home page, sport-specific tabs, and the breaking ticker.
 *
 * Design: one row per (sport, team, date, metric). Each sport writes to the
 * same table with its own `sport` key, so adding NFL/NBA later requires no
 * schema change — just a new sport string and a call to recordSnapshot().
 */
import { supabase } from "./supabase";

export type SportKey = "world_cup" | "nfl" | "nba" | "nhl";

export interface Mover {
  sport: SportKey;
  teamCode: string;
  teamName: string;
  currentValue: number;
  previousValue: number;
  delta: number;       // currentValue - previousValue
  reason?: string;
}

/**
 * Record today's snapshot for every team in a sport.
 * Call this once per day per sport — e.g. after results are entered,
 * or on a scheduled basis. Upserts, so calling it multiple times in
 * one day is safe (overwrites, doesn't duplicate).
 */
export async function recordSnapshot(
  sport: SportKey,
  teamValues: Array<{ code: string; value: number; reason?: string }>,
  metric = "champion_pct",
  date: string = new Date().toISOString().slice(0, 10), // YYYY-MM-DD
): Promise<void> {
  const rows = teamValues.map((t) => ({
    sport,
    team_code: t.code,
    snapshot_date: date,
    metric,
    value: t.value,
    reason: t.reason ?? null,
  }));

  const { error } = await supabase
    .from("probability_snapshots")
    .upsert(rows, { onConflict: "sport,team_code,snapshot_date,metric" });

  if (error) throw error;
}

/**
 * Get the most recent two distinct snapshot dates for a sport,
 * so we can compute "today vs most recent prior day" even if
 * snapshots weren't recorded every single day.
 */
async function getLastTwoDates(sport: SportKey, metric: string): Promise<[string, string] | null> {
  const { data, error } = await supabase
    .from("probability_snapshots")
    .select("snapshot_date")
    .eq("sport", sport)
    .eq("metric", metric)
    .order("snapshot_date", { ascending: false });

  if (error || !data || data.length === 0) return null;

  const distinctDates = Array.from(new Set(data.map((r) => r.snapshot_date as string)));
  if (distinctDates.length < 2) return null;

  return [distinctDates[0], distinctDates[1]]; // [latest, previous]
}

/**
 * Compute movers for a single sport: every team's delta between the
 * latest two snapshot dates, sorted by absolute movement descending.
 */
export async function getMoversForSport(
  sport: SportKey,
  teamNames: Record<string, string>, // code -> display name
  metric = "champion_pct",
  limit = 6,
): Promise<Mover[]> {
  const dates = await getLastTwoDates(sport, metric);
  if (!dates) return [];
  const [latest, previous] = dates;

  const { data, error } = await supabase
    .from("probability_snapshots")
    .select("team_code, snapshot_date, value, reason")
    .eq("sport", sport)
    .eq("metric", metric)
    .in("snapshot_date", [latest, previous]);

  if (error || !data) return [];

  const byTeam = new Map<string, { current?: number; previous?: number; reason?: string }>();
  for (const row of data) {
    const entry = byTeam.get(row.team_code) ?? {};
    if (row.snapshot_date === latest) {
      entry.current = row.value;
      entry.reason = row.reason ?? entry.reason;
    } else {
      entry.previous = row.value;
    }
    byTeam.set(row.team_code, entry);
  }

  const movers: Mover[] = [];
  for (const [code, { current, previous: prev, reason }] of byTeam) {
    if (current === undefined || prev === undefined) continue;
    movers.push({
      sport,
      teamCode: code,
      teamName: teamNames[code] ?? code,
      currentValue: current,
      previousValue: prev,
      delta: Number((current - prev).toFixed(1)),
      reason,
    });
  }

  return movers
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
}

/**
 * Get the single biggest mover for a sport — used on the home page's
 * "one card per sport" view.
 */
export async function getTopMoverForSport(
  sport: SportKey,
  teamNames: Record<string, string>,
  metric = "champion_pct",
): Promise<Mover | null> {
  const movers = await getMoversForSport(sport, teamNames, metric, 1);
  return movers[0] ?? null;
}

/**
 * Get the single biggest mover across ALL sports the user has enabled —
 * used for the home page ticker, which shows the single most newsworthy
 * movement regardless of which sport it's in.
 */
export async function getTopMoverAcrossSports(
  sports: SportKey[],
  teamNamesBySport: Record<SportKey, Record<string, string>>,
  metric = "champion_pct",
): Promise<Mover | null> {
  const allMovers = await Promise.all(
    sports.map((s) => getTopMoverForSport(s, teamNamesBySport[s] ?? {}, metric)),
  );
  const valid = allMovers.filter((m): m is Mover => m !== null);
  if (valid.length === 0) return null;
  return valid.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
}