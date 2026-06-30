import { createClient } from "@supabase/supabase-js";
import type { StoredResults } from "./types";
import { GROUP_MATCHES } from "../data";
import { TEAM_BY_CODE } from "./teams";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function loadOfficialResults(): Promise<StoredResults> {
  const { data, error } = await supabase
    .from("match_results")
    .select("match_id, home_goals, away_goals, penalty_winner");

  if (error) throw error;

  const matches: StoredResults["matches"] = {};
  const knockoutMatches: NonNullable<StoredResults["knockoutMatches"]> = {};

  for (const row of data) {
    const score = {
      homeGoals: row.home_goals,
      awayGoals: row.away_goals,
      ...(row.penalty_winner ? { penaltyWinner: row.penalty_winner as "home" | "away" } : {}),
    };
    if (row.match_id.startsWith("ko-")) {
      knockoutMatches[row.match_id] = score;
    } else {
      matches[row.match_id] = score;
    }
  }

  return { matches, knockoutMatches };
}

export async function saveOfficialResult(
  matchId: string,
  homeGoals: number,
  awayGoals: number,
  homeTeam?: string,
  awayTeam?: string,
  matchDate?: string,
  penaltyWinner?: "home" | "away",
): Promise<void> {
  // For group matches, look up team names from GROUP_MATCHES
  if (!homeTeam && !matchId.startsWith("ko-")) {
    const match = GROUP_MATCHES.find((m) => m.id === matchId);
    if (match) {
      homeTeam = TEAM_BY_CODE[match.home]?.name;
      awayTeam = TEAM_BY_CODE[match.away]?.name;
      matchDate = match.date;
    }
  }

  const { error } = await supabase.from("match_results").upsert({
    match_id: matchId,
    home_team: homeTeam ?? null,
    away_team: awayTeam ?? null,
    match_date: matchDate ?? null,
    home_goals: homeGoals,
    away_goals: awayGoals,
    penalty_winner: penaltyWinner ?? null,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}

export async function deleteOfficialResult(matchId: string): Promise<void> {
  const { error } = await supabase
    .from("match_results")
    .delete()
    .eq("match_id", matchId);

  if (error) throw error;
}

export async function loadLatestOfficialResultUpdate() {
  const { data, error } = await supabase
    .from("match_results")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error loading latest official update:", error);
    return null;
  }

  return data?.updated_at ?? null;
}