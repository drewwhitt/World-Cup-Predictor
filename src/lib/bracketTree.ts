/**
 * bracketTree.ts — 2026 World Cup knockout bracket structure.
 *
 * All zones derived directly from the official fixture file's W-key slot
 * assignments. Each team's reachable opponent zones at each round are
 * pre-computed and hardcoded here so filtering is O(1) with no inference.
 */

import type { StoredResults, TeamCode } from "./types";

export const R32_MATCHUPS: Record<string, { home: TeamCode; away: TeamCode }> = {
  "ko-73": { home: "GER", away: "PAR" },
  "ko-74": { home: "FRA", away: "SWE" },
  "ko-75": { home: "RSA", away: "CAN" },
  "ko-76": { home: "NED", away: "MAR" },
  "ko-77": { home: "POR", away: "CRO" },
  "ko-78": { home: "ESP", away: "AUT" },
  "ko-79": { home: "USA", away: "BIH" },
  "ko-80": { home: "BEL", away: "SEN" },
  "ko-81": { home: "BRA", away: "JPN" },
  "ko-82": { home: "CIV", away: "NOR" },
  "ko-83": { home: "MEX", away: "ECU" },
  "ko-84": { home: "ENG", away: "COD" },
  "ko-85": { home: "ARG", away: "CPV" },
  "ko-86": { home: "AUS", away: "EGY" },
  "ko-87": { home: "SUI", away: "ALG" },
  "ko-88": { home: "COL", away: "GHA" },
};

/**
 * For each R32 match, the opponent zones at each subsequent round.
 *
 * Verified against FIFA's official bracket structure and cross-checked
 * against live 2026 tournament reporting for every pairing (Portugal v
 * Spain, Paraguay v France, Canada v Morocco, Brazil v Norway, Mexico v
 * England, USA v Belgium all confirmed as real R16 fixtures).
 *
 *   R16: ko-89=W73vW74, ko-90=W75vW76, ko-91=W77vW78, ko-92=W79vW80,
 *        ko-93=W83vW84, ko-94=W81vW82, ko-95=W86vW88, ko-96=W85vW87
 *   QF:  ko-97=W89vW90, ko-98=W93vW94, ko-99=W91vW92, ko-100=W95vW96
 *   SF:  ko-101=W97vW99 (73-80 side), ko-102=W98vW100 (81-88 side)
 *
 * The two SF matches each combine the two QFs from the SAME half of the
 * draw — this previously combined mismatched halves (W97+W98), which
 * incorrectly showed teams from opposite sides of the bracket as SF
 * opponents.
 */
const ZONES: Record<string, {
  r16: string;       // single R32 match ID of R16 opponent
  qf: string[];      // R32 match IDs of possible QF opponents
  sf: string[];      // R32 match IDs of possible SF opponents
  final: string[];   // R32 match IDs of possible Final opponents
}> = {
  "ko-73": { r16:"ko-74", qf:["ko-75","ko-76"], sf:["ko-77","ko-78","ko-79","ko-80"], final:["ko-81","ko-82","ko-83","ko-84","ko-85","ko-86","ko-87","ko-88"] },
  "ko-74": { r16:"ko-73", qf:["ko-75","ko-76"], sf:["ko-77","ko-78","ko-79","ko-80"], final:["ko-81","ko-82","ko-83","ko-84","ko-85","ko-86","ko-87","ko-88"] },
  "ko-75": { r16:"ko-76", qf:["ko-73","ko-74"], sf:["ko-77","ko-78","ko-79","ko-80"], final:["ko-81","ko-82","ko-83","ko-84","ko-85","ko-86","ko-87","ko-88"] },
  "ko-76": { r16:"ko-75", qf:["ko-73","ko-74"], sf:["ko-77","ko-78","ko-79","ko-80"], final:["ko-81","ko-82","ko-83","ko-84","ko-85","ko-86","ko-87","ko-88"] },
  "ko-77": { r16:"ko-78", qf:["ko-79","ko-80"], sf:["ko-73","ko-74","ko-75","ko-76"], final:["ko-81","ko-82","ko-83","ko-84","ko-85","ko-86","ko-87","ko-88"] },
  "ko-78": { r16:"ko-77", qf:["ko-79","ko-80"], sf:["ko-73","ko-74","ko-75","ko-76"], final:["ko-81","ko-82","ko-83","ko-84","ko-85","ko-86","ko-87","ko-88"] },
  "ko-79": { r16:"ko-80", qf:["ko-77","ko-78"], sf:["ko-73","ko-74","ko-75","ko-76"], final:["ko-81","ko-82","ko-83","ko-84","ko-85","ko-86","ko-87","ko-88"] },
  "ko-80": { r16:"ko-79", qf:["ko-77","ko-78"], sf:["ko-73","ko-74","ko-75","ko-76"], final:["ko-81","ko-82","ko-83","ko-84","ko-85","ko-86","ko-87","ko-88"] },
  "ko-81": { r16:"ko-82", qf:["ko-83","ko-84"], sf:["ko-85","ko-86","ko-87","ko-88"], final:["ko-73","ko-74","ko-75","ko-76","ko-77","ko-78","ko-79","ko-80"] },
  "ko-82": { r16:"ko-81", qf:["ko-83","ko-84"], sf:["ko-85","ko-86","ko-87","ko-88"], final:["ko-73","ko-74","ko-75","ko-76","ko-77","ko-78","ko-79","ko-80"] },
  "ko-83": { r16:"ko-84", qf:["ko-81","ko-82"], sf:["ko-85","ko-86","ko-87","ko-88"], final:["ko-73","ko-74","ko-75","ko-76","ko-77","ko-78","ko-79","ko-80"] },
  "ko-84": { r16:"ko-83", qf:["ko-81","ko-82"], sf:["ko-85","ko-86","ko-87","ko-88"], final:["ko-73","ko-74","ko-75","ko-76","ko-77","ko-78","ko-79","ko-80"] },
  "ko-85": { r16:"ko-87", qf:["ko-86","ko-88"], sf:["ko-81","ko-82","ko-83","ko-84"], final:["ko-73","ko-74","ko-75","ko-76","ko-77","ko-78","ko-79","ko-80"] },
  "ko-86": { r16:"ko-88", qf:["ko-85","ko-87"], sf:["ko-81","ko-82","ko-83","ko-84"], final:["ko-73","ko-74","ko-75","ko-76","ko-77","ko-78","ko-79","ko-80"] },
  "ko-87": { r16:"ko-85", qf:["ko-86","ko-88"], sf:["ko-81","ko-82","ko-83","ko-84"], final:["ko-73","ko-74","ko-75","ko-76","ko-77","ko-78","ko-79","ko-80"] },
  "ko-88": { r16:"ko-86", qf:["ko-85","ko-87"], sf:["ko-81","ko-82","ko-83","ko-84"], final:["ko-73","ko-74","ko-75","ko-76","ko-77","ko-78","ko-79","ko-80"] },
};

export function getR32MatchId(code: TeamCode): string | null {
  for (const [id, m] of Object.entries(R32_MATCHUPS)) {
    if (m.home === code || m.away === code) return id;
  }
  return null;
}

export function getReachableZoneByRound(teamCode: TeamCode): {
  r16: string | null;
  qf: string[] | null;
  sf: string[] | null;
  final: string[] | null;
} {
  const myR32 = getR32MatchId(teamCode);
  if (!myR32 || !ZONES[myR32]) return { r16: null, qf: null, sf: null, final: null };
  const z = ZONES[myR32];
  return { r16: z.r16, qf: z.qf, sf: z.sf, final: z.final };
}

export function teamsInZone(matchIds: string[]): Set<TeamCode> {
  const teams = new Set<TeamCode>();
  for (const id of matchIds) {
    const m = R32_MATCHUPS[id];
    if (m) { teams.add(m.home); teams.add(m.away); }
  }
  return teams;
}

/**
 * The FULL knockout bracket, R32 through Final, as a single shared source
 * of truth for anything that needs to know "what round is this match" or
 * "who plays in this match" beyond just R32.
 *
 * Used by AdminResultsPanel (to let you enter R16+ results) and UpsetFeed
 * (to score R16+ predictions) — previously each of those had their own
 * R32-only copy of this data, so R16-onward matches were silently invisible
 * everywhere except BracketView/simulate.ts.
 *
 * Pairing verified against FIFA's official bracket and live 2026 reporting
 * — see MODEL_HISTORY.md v1.10. Must stay in sync with simulate.ts's
 * R16_FROM_R32/QF_FROM_R16/SF_FROM_QF if the structure ever needs
 * correcting again.
 */
export type KnockoutRound = "Round of 32" | "Round of 16" | "Quarterfinal" | "Semifinal" | "Final";

export type KnockoutSource = { type: "team"; code: TeamCode } | { type: "winner"; matchId: string };

export const KNOCKOUT_STRUCTURE: Record<string, { round: KnockoutRound; home: KnockoutSource; away: KnockoutSource }> = {
  "ko-73": { round: "Round of 32", home: { type: "team", code: "GER" }, away: { type: "team", code: "PAR" } },
  "ko-74": { round: "Round of 32", home: { type: "team", code: "FRA" }, away: { type: "team", code: "SWE" } },
  "ko-75": { round: "Round of 32", home: { type: "team", code: "RSA" }, away: { type: "team", code: "CAN" } },
  "ko-76": { round: "Round of 32", home: { type: "team", code: "NED" }, away: { type: "team", code: "MAR" } },
  "ko-77": { round: "Round of 32", home: { type: "team", code: "POR" }, away: { type: "team", code: "CRO" } },
  "ko-78": { round: "Round of 32", home: { type: "team", code: "ESP" }, away: { type: "team", code: "AUT" } },
  "ko-79": { round: "Round of 32", home: { type: "team", code: "USA" }, away: { type: "team", code: "BIH" } },
  "ko-80": { round: "Round of 32", home: { type: "team", code: "BEL" }, away: { type: "team", code: "SEN" } },
  "ko-81": { round: "Round of 32", home: { type: "team", code: "BRA" }, away: { type: "team", code: "JPN" } },
  "ko-82": { round: "Round of 32", home: { type: "team", code: "CIV" }, away: { type: "team", code: "NOR" } },
  "ko-83": { round: "Round of 32", home: { type: "team", code: "MEX" }, away: { type: "team", code: "ECU" } },
  "ko-84": { round: "Round of 32", home: { type: "team", code: "ENG" }, away: { type: "team", code: "COD" } },
  "ko-85": { round: "Round of 32", home: { type: "team", code: "ARG" }, away: { type: "team", code: "CPV" } },
  "ko-86": { round: "Round of 32", home: { type: "team", code: "AUS" }, away: { type: "team", code: "EGY" } },
  "ko-87": { round: "Round of 32", home: { type: "team", code: "SUI" }, away: { type: "team", code: "ALG" } },
  "ko-88": { round: "Round of 32", home: { type: "team", code: "COL" }, away: { type: "team", code: "GHA" } },

  "ko-89": { round: "Round of 16", home: { type: "winner", matchId: "ko-73" }, away: { type: "winner", matchId: "ko-74" } },
  "ko-90": { round: "Round of 16", home: { type: "winner", matchId: "ko-75" }, away: { type: "winner", matchId: "ko-76" } },
  "ko-91": { round: "Round of 16", home: { type: "winner", matchId: "ko-77" }, away: { type: "winner", matchId: "ko-78" } },
  "ko-92": { round: "Round of 16", home: { type: "winner", matchId: "ko-79" }, away: { type: "winner", matchId: "ko-80" } },
  "ko-93": { round: "Round of 16", home: { type: "winner", matchId: "ko-83" }, away: { type: "winner", matchId: "ko-84" } },
  "ko-94": { round: "Round of 16", home: { type: "winner", matchId: "ko-81" }, away: { type: "winner", matchId: "ko-82" } },
  "ko-95": { round: "Round of 16", home: { type: "winner", matchId: "ko-86" }, away: { type: "winner", matchId: "ko-88" } },
  "ko-96": { round: "Round of 16", home: { type: "winner", matchId: "ko-85" }, away: { type: "winner", matchId: "ko-87" } },

  "ko-97":  { round: "Quarterfinal", home: { type: "winner", matchId: "ko-89" }, away: { type: "winner", matchId: "ko-90" } },
  "ko-98":  { round: "Quarterfinal", home: { type: "winner", matchId: "ko-93" }, away: { type: "winner", matchId: "ko-94" } },
  "ko-99":  { round: "Quarterfinal", home: { type: "winner", matchId: "ko-91" }, away: { type: "winner", matchId: "ko-92" } },
  "ko-100": { round: "Quarterfinal", home: { type: "winner", matchId: "ko-95" }, away: { type: "winner", matchId: "ko-96" } },

  "ko-101": { round: "Semifinal", home: { type: "winner", matchId: "ko-97" }, away: { type: "winner", matchId: "ko-99" } },
  "ko-102": { round: "Semifinal", home: { type: "winner", matchId: "ko-98" }, away: { type: "winner", matchId: "ko-100" } },

  "ko-104": { round: "Final", home: { type: "winner", matchId: "ko-101" }, away: { type: "winner", matchId: "ko-102" } },
};

/** Recursively resolves a source to an actual team code, or null if that round hasn't been played (or entered) yet. */
export function resolveKnockoutTeam(source: KnockoutSource, stored: StoredResults): TeamCode | null {
  if (source.type === "team") return source.code;
  const result = stored.knockoutMatches?.[source.matchId];
  const structure = KNOCKOUT_STRUCTURE[source.matchId];
  if (!result || !structure) return null;

  const homeCode = resolveKnockoutTeam(structure.home, stored);
  const awayCode = resolveKnockoutTeam(structure.away, stored);
  if (!homeCode || !awayCode) return null;

  if (result.homeGoals > result.awayGoals) return homeCode;
  if (result.awayGoals > result.homeGoals) return awayCode;
  if (result.penaltyWinner === "home") return homeCode;
  if (result.penaltyWinner === "away") return awayCode;
  return null; // drawn, no penalty result recorded yet
}

export function resolveKnockoutMatch(
  id: string,
  stored: StoredResults,
): { home: TeamCode | null; away: TeamCode | null; round: KnockoutRound | null } {
  const structure = KNOCKOUT_STRUCTURE[id];
  if (!structure) return { home: null, away: null, round: null };
  return {
    home: resolveKnockoutTeam(structure.home, stored),
    away: resolveKnockoutTeam(structure.away, stored),
    round: structure.round,
  };
}