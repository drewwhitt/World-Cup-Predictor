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