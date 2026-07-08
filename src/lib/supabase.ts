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

  await callSaveResultApi({
    action: "save",
    matchId,
    homeTeam: homeTeam ?? null,
    awayTeam: awayTeam ?? null,
    matchDate: matchDate ?? null,
    homeGoals,
    awayGoals,
    penaltyWinner: penaltyWinner ?? null,
  });
}

export async function deleteOfficialResult(matchId: string): Promise<void> {
  await callSaveResultApi({ action: "delete", matchId });
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

const ADMIN_SECRET_STORAGE_KEY = "veridex-admin-secret";

/**
 * Asks for the admin write secret once (the password set as
 * ADMIN_WRITE_SECRET in Vercel's environment variables) and remembers it
 * in this browser's localStorage afterward, so it isn't re-prompted on
 * every save. This only matters for whoever is actually entering
 * results — regular visitors never hit this path since they never
 * trigger a save or delete.
 */
function getAdminSecret(): string {
  const stored = localStorage.getItem(ADMIN_SECRET_STORAGE_KEY);
  if (stored) return stored;
  const entered = window.prompt("Enter the admin write password:");
  if (entered) localStorage.setItem(ADMIN_SECRET_STORAGE_KEY, entered);
  return entered ?? "";
}

async function callSaveResultApi(body: Record<string, unknown>): Promise<void> {
  const secret = getAdminSecret();
  const response = await fetch("/api/save-result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, secret }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      // Wrong or stale password — clear it so the next attempt re-prompts
      // instead of silently failing forever with the same bad value.
      localStorage.removeItem(ADMIN_SECRET_STORAGE_KEY);
    }
    throw new Error(payload.error ?? `Save failed (${response.status})`);
  }
}