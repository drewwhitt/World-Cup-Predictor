import { DEFAULT_SETTINGS, GROUP_MATCHES, KNOCKOUT_MATCHES } from "../data";
import { runSimulation } from "./simulate";
import { TEAM_BY_CODE, TEAM_CONFEDERATION, type Confederation } from "./teams";
import { KNOCKOUT_STRUCTURE, resolveKnockoutMatch } from "./bracketTree";
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
 * Turns a forced match winner into a synthetic 1-0 result, the same shape
 * as a real entered result — this is what lets the what-if simulator reuse
 * the exact same bracket-progression machinery as real confirmed results,
 * including the ripple effect into every match that depends on this one.
 */
function buildSyntheticKnockoutResults(
  overrides: MatchOverride[],
  stored: StoredResults,
): StoredResults["knockoutMatches"] {
  const result: StoredResults["knockoutMatches"] = { ...(stored.knockoutMatches ?? {}) };
  for (const { matchId, winner } of overrides) {
    const { home, away } = resolveKnockoutMatch(matchId, stored);
    if (!home || !away) continue; // can't override a match whose participants aren't known yet
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

/**
 * The knockout bracket is hardcoded to the REAL tournament's actual R32
 * qualifiers (that draw already happened in reality) — it does not
 * re-derive who "would" qualify from a hypothetically different group
 * stage. That means boosting a team who never actually made the real R32
 * can't meaningfully change anything downstream, even though their
 * isolated group-stage stats might still move. Restricting the picker to
 * real knockout participants who haven't already been eliminated avoids
 * showing a boost that silently does nothing.
 */
export function getKnockoutTeamCodes(): Set<TeamCode> {
  const codes = new Set<TeamCode>();
  for (const structure of Object.values(KNOCKOUT_STRUCTURE)) {
    if (structure.home.type === "team") codes.add(structure.home.code);
    if (structure.away.type === "team") codes.add(structure.away.code);
  }
  return codes;
}

export function isEliminated(code: TeamCode, stored: StoredResults): boolean {
  for (const id of Object.keys(KNOCKOUT_STRUCTURE)) {
    const result = stored.knockoutMatches?.[id];
    if (!result) continue;
    const { home, away } = resolveKnockoutMatch(id, stored);
    if (!home || !away) continue;
    const winner = result.homeGoals > result.awayGoals || result.penaltyWinner === "home" ? home : away;
    const loser = winner === home ? away : home;
    if (loser === code) return true;
  }
  return false;
}

export function getBoostableTeams(stored: StoredResults): TeamCode[] {
  const knockoutCodes = getKnockoutTeamCodes();
  return [...knockoutCodes].filter((code) => !isEliminated(code, stored));
}

/** All knockout matches whose two participants are currently known, grouped by round — for the match-override picker. */
export function getOverridableMatches(stored: StoredResults) {
  return Object.keys(KNOCKOUT_STRUCTURE)
    .map((id) => {
      const { home, away, round } = resolveKnockoutMatch(id, stored);
      return { id, home, away, round };
    })
    .filter((m) => m.home && m.away) as Array<{ id: string; home: TeamCode; away: TeamCode; round: string }>;
}