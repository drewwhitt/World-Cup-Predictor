import { DEFAULT_SETTINGS, GROUP_MATCHES, KNOCKOUT_MATCHES } from "../data";
import { runSimulation, computeElosIncludingKnockouts } from "./simulate";
import { TEAM_BY_CODE, TEAM_CONFEDERATION, type Confederation } from "./teams";
import { KNOCKOUT_STRUCTURE, type KnockoutSource, type KnockoutRound } from "./bracketTree";
import type { StoredResults, TeamCode } from "./types";

/**
 * The "aggressive" confederation weighting from backtesting (scipy-optimized,
 * equal-weight) vs the conservative set actually live in teams.ts. Expressed
 * here as a delta per confederation so switching to it is just a batch of
 * Elo adjustments — no changes needed to teams.ts itself.
 */
const CONSERVATIVE_OFFSETS: Record<Confederation, number> = {
  UEFA: 0, CONMEBOL: 10, CAF: -15, AFC: -45, CONCACAF: -45, OFC: 0,
};
const AGGRESSIVE_OFFSETS: Record<Confederation, number> = {
  UEFA: 0, CONMEBOL: 12, CAF: -55, AFC: -55, CONCACAF: -65, OFC: 0,
};

export interface MatchOverride {
  matchId: string;
  winner: TeamCode;
}

export interface WhatIfScenario {
  hostAdvantageOff?: boolean;
  aggressiveConfederationWeighting?: boolean;
  eloAdjustments?: Partial<Record<TeamCode, number>>;
  matchOverrides?: MatchOverride[];
}

export const EMPTY_SCENARIO: WhatIfScenario = {};

export function scenarioIsDefault(scenario: WhatIfScenario): boolean {
  return (
    !scenario.hostAdvantageOff &&
    !scenario.aggressiveConfederationWeighting &&
    !Object.keys(scenario.eloAdjustments ?? {}).length &&
    !(scenario.matchOverrides?.length)
  );
}

/**
 * Resolves a single source (a fixed real team, or "whoever wins match X")
 * to an actual team code — checking the override map FIRST at every level
 * of recursion. This is what lets overriding an early match correctly
 * change who plays in every match downstream, including matches that are
 * themselves overridden (e.g. override the R32, then also override the
 * hypothetical R16 match that override creates).
 */
function resolveSource(
  source: KnockoutSource,
  stored: StoredResults,
  overridesByMatch: Map<string, TeamCode>,
): TeamCode | null {
  if (source.type === "team") return source.code;
  return resolveWinner(source.matchId, stored, overridesByMatch);
}

function resolveWinner(
  matchId: string,
  stored: StoredResults,
  overridesByMatch: Map<string, TeamCode>,
): TeamCode | null {
  const overridden = overridesByMatch.get(matchId);
  if (overridden) return overridden;

  const structure = KNOCKOUT_STRUCTURE[matchId];
  if (!structure) return null;
  const result = stored.knockoutMatches?.[matchId];
  if (!result) return null; // not decided in reality, and not overridden

  const home = resolveSource(structure.home, stored, overridesByMatch);
  const away = resolveSource(structure.away, stored, overridesByMatch);
  if (!home || !away) return null;

  if (result.homeGoals > result.awayGoals) return home;
  if (result.awayGoals > result.homeGoals) return away;
  if (result.penaltyWinner === "home") return home;
  if (result.penaltyWinner === "away") return away;
  return null;
}

export interface ResolvedWhatIfMatch {
  id: string;
  round: KnockoutRound;
  home: ResolvedSide;
  away: ResolvedSide;
  winner: TeamCode | null;
  /** True if THIS specific match has a user override applied (vs just inheriting one from an earlier round). */
  isOverridden: boolean;
  /** True if a real result exists for this exact match, before any override. */
  hasRealResult: boolean;
}

/**
 * A bracket slot is one of three things:
 *   - a specific team, decided (by a real result or an override)
 *   - "pending": genuinely one of two specific teams, depending on a
 *     match that hasn't been decided yet — e.g. "whoever wins Spain v
 *     Portugal" when that match itself has no result or override. Still
 *     concrete enough to show both hypothetical matchups with real odds.
 *   - "unknown": depends on something further upstream that's ALSO not
 *     decided — not expanded further, to avoid a combinatorial explosion
 *     of hypothetical branches more than one level out.
 */
export type ResolvedSide =
  | { kind: "team"; code: TeamCode }
  | { kind: "pending"; candidates: [TeamCode, TeamCode]; feederMatchId: string }
  | { kind: "unknown" };

function resolveSideForDisplay(
  source: KnockoutSource,
  stored: StoredResults,
  overridesByMatch: Map<string, TeamCode>,
): ResolvedSide {
  if (source.type === "team") return { kind: "team", code: source.code };

  const winner = resolveWinner(source.matchId, stored, overridesByMatch);
  if (winner) return { kind: "team", code: winner };

  const structure = KNOCKOUT_STRUCTURE[source.matchId];
  if (!structure) return { kind: "unknown" };
  const home = resolveSource(structure.home, stored, overridesByMatch);
  const away = resolveSource(structure.away, stored, overridesByMatch);
  if (home && away) return { kind: "pending", candidates: [home, away], feederMatchId: source.matchId };
  return { kind: "unknown" };
}

/**
 * The full bracket (R32 through Final) as it stands under the current
 * scenario — real results everywhere, except wherever an override says
 * otherwise, cascading correctly into every later round that depends on
 * an overridden match. This is what drives the interactive bracket UI.
 */
export function resolveWhatIfBracket(stored: StoredResults, overrides: MatchOverride[]): ResolvedWhatIfMatch[] {
  const overridesByMatch = new Map(overrides.map((o) => [o.matchId, o.winner]));
  return Object.keys(KNOCKOUT_STRUCTURE).map((id) => {
    const structure = KNOCKOUT_STRUCTURE[id];
    const home = resolveSideForDisplay(structure.home, stored, overridesByMatch);
    const away = resolveSideForDisplay(structure.away, stored, overridesByMatch);
    const winner = home.kind === "team" && away.kind === "team" ? resolveWinner(id, stored, overridesByMatch) : null;
    return {
      id,
      round: structure.round,
      home,
      away,
      winner,
      isOverridden: overridesByMatch.has(id),
      hasRealResult: !!stored.knockoutMatches?.[id],
    };
  });
}

/**
 * Elo ratings as they stand today (after the real group stage — knockout
 * results don't change Elo the way they're used here, since these are
 * for computing hypothetical matchup odds, not re-simulating history).
 * One snapshot answers every hypothetical matchup in the bracket, since
 * none of the what-if toggles change group-stage Elo itself.
 */
export function currentElos(stored: StoredResults): Record<TeamCode, number> {
  const playedMatches = GROUP_MATCHES.map((match) => {
    const result = stored.matches[match.id];
    return result
      ? { ...match, played: true, homeGoals: result.homeGoals, awayGoals: result.awayGoals }
      : match;
  });
  return computeElosIncludingKnockouts(playedMatches, stored, DEFAULT_SETTINGS);
}

/**
 * Turns the override chain into synthetic results for runSimulation,
 * resolving each override's home/away through the SAME cascading logic
 * as resolveWhatIfBracket — so a multi-step override (e.g. override R32,
 * then also override the hypothetical R16 match that creates) feeds the
 * real simulation engine consistently.
 */
function buildSyntheticKnockoutResults(
  overrides: MatchOverride[],
  stored: StoredResults,
): StoredResults["knockoutMatches"] {
  const overridesByMatch = new Map(overrides.map((o) => [o.matchId, o.winner]));
  const result: StoredResults["knockoutMatches"] = { ...(stored.knockoutMatches ?? {}) };
  for (const { matchId, winner } of overrides) {
    const structure = KNOCKOUT_STRUCTURE[matchId];
    if (!structure) continue;
    const home = resolveSource(structure.home, stored, overridesByMatch);
    const away = resolveSource(structure.away, stored, overridesByMatch);
    if (!home || !away) continue;
    if (winner !== home && winner !== away) continue;
    result[matchId] = winner === home ? { homeGoals: 1, awayGoals: 0 } : { homeGoals: 0, awayGoals: 1 };
  }
  return result;
}

export function buildWhatIfEloAdjustments(scenario: WhatIfScenario): Partial<Record<TeamCode, number>> {
  const adjustments: Partial<Record<TeamCode, number>> = { ...(scenario.eloAdjustments ?? {}) };
  if (scenario.aggressiveConfederationWeighting) {
    for (const code of Object.keys(TEAM_CONFEDERATION) as TeamCode[]) {
      const conf = TEAM_CONFEDERATION[code];
      const delta = AGGRESSIVE_OFFSETS[conf] - CONSERVATIVE_OFFSETS[conf];
      adjustments[code] = (adjustments[code] ?? 0) + delta;
    }
  }
  return adjustments;
}

export interface WhatIfResult {
  code: TeamCode;
  name: string;
  championPct: number;
}

/**
 * Runs the real simulation engine with a what-if scenario applied. This is
 * NOT a separate/simplified model — it's the exact same runSimulation used
 * for the live Home/Forecasts/Bracket odds, just with different inputs.
 */
export function runWhatIf(stored: StoredResults, scenario: WhatIfScenario): WhatIfResult[] {
  const playedMatches = GROUP_MATCHES.map((match) => {
    const result = stored.matches[match.id];
    return result
      ? { ...match, played: true, homeGoals: result.homeGoals, awayGoals: result.awayGoals }
      : match;
  });

  const settings = {
    ...DEFAULT_SETTINGS,
    homeAdvantage: scenario.hostAdvantageOff ? 0 : DEFAULT_SETTINGS.homeAdvantage,
  };

  const knockoutMatches = buildSyntheticKnockoutResults(scenario.matchOverrides ?? [], stored);
  const eloAdjustments = buildWhatIfEloAdjustments(scenario);

  const result = runSimulation(playedMatches, KNOCKOUT_MATCHES, settings, 42, knockoutMatches, eloAdjustments);

  return result.probabilities
    .map((row) => ({
      code: row.code,
      name: TEAM_BY_CODE[row.code]?.name ?? row.code,
      championPct: Number((row.champion * 100).toFixed(1)),
    }))
    .sort((a, b) => b.championPct - a.championPct);
}