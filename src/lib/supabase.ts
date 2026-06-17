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
    .select("match_id, home_goals, away_goals");

  if (error) throw error;

  return {
    matches: Object.fromEntries(
      data.map((row) => [
        row.match_id,
        {
          homeGoals: row.home_goals,
          awayGoals: row.away_goals,
        },
      ]),
    ),
  };
}

export async function saveOfficialResult(
  matchId: string,
  homeGoals: number,
  awayGoals: number,
): Promise<void> {
const match = GROUP_MATCHES.find((m) => m.id === matchId);

const { error } = await supabase.from("match_results").upsert({
  match_id: matchId,
  home_team: match ? TEAM_BY_CODE[match.home].name : null,
  away_team: match ? TEAM_BY_CODE[match.away].name : null,
  match_date: match?.date,
  home_goals: homeGoals,
  away_goals: awayGoals,
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