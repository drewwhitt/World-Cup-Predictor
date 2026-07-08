import { createClient } from "@supabase/supabase-js";

/**
 * Secure write proxy for match results.
 *
 * Why this exists: the browser's Supabase key (VITE_SUPABASE_ANON_KEY) is
 * necessarily public — it's baked into the JS bundle every visitor
 * downloads. Before this file existed, that same public key was also
 * used for writes/deletes, meaning anyone who found it (trivial via dev
 * tools) could modify or delete match_results directly, bypassing the
 * app's admin-mode UI gate entirely (that gate only hides/shows a
 * button — it was never real access control).
 *
 * This function is the only thing that can write. It runs server-side,
 * holds the Supabase SERVICE ROLE key (which bypasses Row Level
 * Security by design) in an environment variable that's never sent to
 * the browser, and only performs a write if the caller supplies a
 * secret that matches ADMIN_WRITE_SECRET — also server-side only.
 *
 * Required Vercel environment variables (Project Settings → Environment
 * Variables), NOT prefixed with VITE_ so they never reach the client bundle:
 *   SUPABASE_URL              — same value as VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY — from Supabase dashboard → Settings → API
 *                               (the "service_role" key, NOT the anon key)
 *   ADMIN_WRITE_SECRET        — any password you choose, known only to you
 */

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminSecret = process.env.ADMIN_WRITE_SECRET;

// Minimal request/response shape — deliberately untyped against
// @vercel/node (not currently a project dependency) so this doesn't
// require adding a new package. Vercel supplies real Node
// IncomingMessage/ServerResponse-compatible objects at runtime.
type MinimalRequest = {
  method?: string;
  body?: unknown;
};
type MinimalResponse = {
  status: (code: number) => MinimalResponse;
  json: (body: unknown) => void;
};

export default async function handler(req: MinimalRequest, res: MinimalResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!supabaseUrl || !serviceRoleKey || !adminSecret) {
    console.error("Missing required environment variables for save-result function");
    res.status(500).json({ error: "Server misconfigured" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const { secret, action } = body;

  if (secret !== adminSecret) {
    res.status(401).json({ error: "Invalid secret" });
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    if (action === "delete") {
      const { matchId } = body as { matchId?: string };
      if (!matchId) {
        res.status(400).json({ error: "matchId required" });
        return;
      }
      const { error } = await supabase.from("match_results").delete().eq("match_id", matchId);
      if (error) throw error;
      res.status(200).json({ ok: true });
      return;
    }

    if (action === "save") {
      const {
        matchId,
        homeTeam,
        awayTeam,
        matchDate,
        homeGoals,
        awayGoals,
        penaltyWinner,
      } = body as {
        matchId?: string;
        homeTeam?: string | null;
        awayTeam?: string | null;
        matchDate?: string | null;
        homeGoals?: number;
        awayGoals?: number;
        penaltyWinner?: "home" | "away" | null;
      };

      if (!matchId || homeGoals === undefined || awayGoals === undefined) {
        res.status(400).json({ error: "matchId, homeGoals, and awayGoals are required" });
        return;
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
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    console.error("save-result error:", err);
    res.status(500).json({ error: "Write failed" });
  }
}