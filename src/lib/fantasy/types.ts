/**
 * types.ts (fantasy)
 * Shared shapes for the fantasy engine — positions, roster configuration,
 * and the player/VBD records that flow through replacementLevel.ts and
 * (later) simulate.ts. Kept separate from the World Cup / NFL matchup
 * types in ../types.ts since fantasy is a player-level value problem,
 * not a team-vs-team Elo/simulation one — it doesn't share SportConfig.
 */

export type Position = "QB" | "RB" | "WR" | "TE";

export const FANTASY_POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

/**
 * Starter counts per position, plus how many FLEX slots exist and which
 * positions are FLEX-eligible. This is intentionally free-form (any
 * starter count, any FLEX count, any eligible-position set) rather than
 * hardcoded to "standard" — validated against real 2021–2024 data for
 * 8/10/12/14-team standard rosters, a 2-QB league, and a 3RB/3WR/0-FLEX
 * league; see MODEL_HISTORY.md for the backtest notes.
 */
export interface RosterConfig {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  FLEX: number;
  flexEligible: Position[];
}

export const STANDARD_ROSTER: RosterConfig = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  FLEX: 1,
  flexEligible: ["RB", "WR", "TE"],
};

export const FANTASY_SEASON = 2026;

/** The four league sizes exposed as one-click presets in the UI. Custom sizes/rosters are just a RosterConfig the person edits directly — there's no separate "custom" code path. */
export const LEAGUE_SIZE_PRESETS = [8, 10, 12, 14] as const;
export type LeagueSizePreset = (typeof LEAGUE_SIZE_PRESETS)[number];

/** A player's actual or projected season point total — the common input to replacement-level/VBD math, whether it comes from real historical nflverse data or a simulated draw. */
export interface PlayerSeasonStat {
  name: string;
  position: Position;
  points: number;
  games?: number;
}

/** A PlayerSeasonStat plus its computed value over replacement for a given league configuration. */
export interface PlayerVBD extends PlayerSeasonStat {
  vbd: number;
}

/** One player's row in a consensus ranking snapshot — the output of the admin import/name-matching step, not raw per-platform data (that's kept in platformRanks for transparency but isn't re-derived on every read). */
export interface FantasyRankingEntry {
  name: string;
  position: Position;
  team?: string;
  adp: number;
  /** Best-to-worst rank spread across platform sources, as a plain display string (e.g. "1 - 4") — not parsed into numbers since it's display-only, never used in the simulation. */
  adpRange?: string;
  platformRanks?: number[];
}

export interface FantasyRankingsPayload {
  entries: FantasyRankingEntry[];
  /** PPR only for now — see MODEL_HISTORY.md; format flexibility (half-PPR, superflex, dynasty) is a deferred decision. */
  scoringFormat: "PPR";
}

/** One real historical (consensus ADP, actual season outcome) pair — the training data for curveFit.ts's projections. Produced by scripts/generate-fantasy-adp-backtest.ts, not something computed at runtime. */
export interface AdpVsActualEntry {
  name: string;
  position: Position;
  consensusRank: number;
  actualPoints: number;
  games: number;
}