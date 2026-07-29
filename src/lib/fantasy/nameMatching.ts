/**
 * nameMatching.ts
 * Matches a raw name (as written in a consensus ranking source — often
 * abbreviated, e.g. "A. Brown") against a canonical player pool (e.g.
 * nflverse's `player_display_name`, or a live current-season roster).
 *
 * This exists because a naive "compare first initial + last name" match
 * is wrong often enough to matter: real historical validation caught it
 * silently resolving "A.J. Brown" to "Amon-Ra St. Brown" (both start
 * with "A" + "Brown"), and "Jonathan Brooks" to "Jalen Brooks" (both
 * start with "J" + "Brooks") — see MODEL_HISTORY.md for the full
 * backtest notes. The tiered approach below (exact name → exact first
 * token → fuzzy first token → initial-only → last-name-only) fixes
 * both without giving up automatic matching for the vast majority of
 * names that really are unambiguous.
 *
 * Reused for two different purposes with two different tiebreak needs:
 *  - Re-validating historical rankings against real season outcomes,
 *    where "which candidate scored the most points" is a reasonable
 *    automatic tiebreak for genuinely ambiguous cases.
 *  - Matching a *live* current-season consensus board against the
 *    active roster, where no season has happened yet — there's no
 *    points-based tiebreak available, so ambiguous cases should surface
 *    for manual confirmation instead of being silently guessed.
 * This module only does the matching; callers decide how (or whether)
 * to resolve remaining ambiguity — see resolveAmbiguous below for the
 * points-based option, and MatchResult.candidates for the manual-review
 * option.
 */

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

export type MatchStatus =
  | "exact"
  | "exact_first_token"
  | "fuzzy_first_token"
  | "initial_only"
  | "lastname_unique"
  | "ambiguous"
  | "unmatched";

export interface MatchResult<T> {
  matched: T | null;
  status: MatchStatus;
  /** Present only when status === "ambiguous" — the candidates that tied at whatever tier matched. */
  candidates?: T[];
}

function clean(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/,/g, ".")
    .replace(/[^a-z. ']/g, "")
    .replace(/\./g, "");
}

function nameTokens(s: string): string[] {
  return clean(s)
    .split(/\s+/)
    .filter((t) => t.length > 0 && !SUFFIXES.has(t));
}

/** Levenshtein edit distance, capped — good enough for short name tokens and cheap to bail early on length mismatch. */
function editDistanceLeq(a: string, b: string, maxDist: number): boolean {
  if (Math.abs(a.length - b.length) > maxDist) return false;
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length] <= maxDist;
}

/** Groups a player pool by last name once, for reuse across many matchName() calls against the same pool. */
export function buildByLastName<T>(pool: T[], nameOf: (t: T) => string): Map<string, T[]> {
  const byLast = new Map<string, T[]>();
  for (const item of pool) {
    const tokens = nameTokens(nameOf(item));
    const last = tokens[tokens.length - 1];
    if (!last) continue;
    const arr = byLast.get(last) ?? [];
    arr.push(item);
    byLast.set(last, arr);
  }
  return byLast;
}

/**
 * Matches one raw name against a pool (grouped via buildByLastName).
 * `aliases` maps a lowercased raw nickname (e.g. "hollywood brown") to
 * the canonical "first last" it should resolve to before matching —
 * needed for cases no amount of token-matching can catch.
 */
export function matchName<T>(
  rawName: string,
  byLastName: Map<string, T[]>,
  nameOf: (t: T) => string,
  aliases: Record<string, string> = {},
): MatchResult<T> {
  const rawClean = clean(rawName);
  const tokens = aliases[rawClean] ? aliases[rawClean].split(" ") : nameTokens(rawName);
  if (tokens.length === 0) return { matched: null, status: "unmatched" };

  const last = tokens[tokens.length - 1];
  const firstToken = tokens.length > 1 ? tokens[0] : null;
  const fullClean = tokens.join(" ");

  const candidates = byLastName.get(last) ?? [];
  if (candidates.length === 0) return { matched: null, status: "unmatched" };

  // Tier 1: exact full name
  const exact = candidates.find((c) => clean(nameOf(c)) === fullClean);
  if (exact) return { matched: exact, status: "exact" };

  if (firstToken) {
    const candTokens = new Map(candidates.map((c) => [c, nameTokens(nameOf(c))[0]] as const));

    // Tier 2: exact first-token match
    const tier2 = candidates.filter((c) => candTokens.get(c) === firstToken);
    if (tier2.length === 1) return { matched: tier2[0], status: "exact_first_token" };
    if (tier2.length > 1) return { matched: null, status: "ambiguous", candidates: tier2 };

    // Tier 3: fuzzy first-token (edit distance <= 1)
    const tier3 = candidates.filter((c) => editDistanceLeq(candTokens.get(c) ?? "", firstToken, 1));
    if (tier3.length === 1) return { matched: tier3[0], status: "fuzzy_first_token" };
    if (tier3.length > 1) return { matched: null, status: "ambiguous", candidates: tier3 };

    // Tier 4: initial-only
    const tier4 = candidates.filter((c) => (candTokens.get(c) ?? "")[0] === firstToken[0]);
    if (tier4.length === 1) return { matched: tier4[0], status: "initial_only" };
    if (tier4.length > 1) return { matched: null, status: "ambiguous", candidates: tier4 };
  }

  // Tier 5: last-name only
  if (candidates.length === 1) return { matched: candidates[0], status: "lastname_unique" };
  return { matched: null, status: "ambiguous", candidates };
}

/**
 * Resolves an ambiguous MatchResult by picking whichever candidate
 * scores highest on some caller-supplied metric (e.g. real season
 * points, for historical backtest re-validation). Only appropriate
 * when that metric is actually meaningful for disambiguation — for a
 * live current-season board with no season played yet, prefer
 * surfacing `candidates` for manual confirmation instead of calling
 * this with a weak or arbitrary score.
 */
export function resolveAmbiguous<T>(candidates: T[], scoreOf: (t: T) => number): { chosen: T; comparison: Array<{ item: T; score: number }> } {
  const scored = candidates.map((item) => ({ item, score: scoreOf(item) }));
  scored.sort((a, b) => b.score - a.score);
  return { chosen: scored[0].item, comparison: scored };
}

/** Known nicknames that no amount of token/edit-distance matching can catch — extend as new cases surface. */
export const KNOWN_ALIASES: Record<string, string> = {
  "hollywood brown": "marquise brown",
};