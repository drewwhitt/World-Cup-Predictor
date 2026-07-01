/**
 * bracketTree.ts — 2026 World Cup knockout bracket structure.
 *
 * All zones derived directly from the official fixture file's W-key slot
 * assignments. Each team's reachable opponent zones at each round are
 * pre-computed and hardcoded here so filtering is O(1) with no inference.
 */

import type { TeamCode } from "./types";

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
 * Derived from fixture file bracket structure:
 *   R16: ko-89=W74vW77, ko-90=W73vW75, ko-91=W76vW78, ko-92=W79vW80
 *        ko-93=W83vW84, ko-94=W81vW82, ko-95=W86vW88, ko-96=W85vW87
 *   QF:  ko-97=W89vW90, ko-98=W93vW94, ko-99=W91vW92, ko-100=W95vW96
 *   SF:  ko-101=W97vW98, ko-102=W99vW100
 */
const ZONES: Record<string, {
  r16: string;       // single R32 match ID of R16 opponent
  qf: string[];      // R32 match IDs of possible QF opponents
  sf: string[];      // R32 match IDs of possible SF opponents
  final: string[];   // R32 match IDs of possible Final opponents
}> = {
  "ko-73": { r16:"ko-75", qf:["ko-74","ko-77"], sf:["ko-81","ko-82","ko-83","ko-84"], final:["ko-76","ko-78","ko-79","ko-80","ko-85","ko-86","ko-87","ko-88"] },
  "ko-74": { r16:"ko-77", qf:["ko-73","ko-75"], sf:["ko-81","ko-82","ko-83","ko-84"], final:["ko-76","ko-78","ko-79","ko-80","ko-85","ko-86","ko-87","ko-88"] },
  "ko-75": { r16:"ko-73", qf:["ko-74","ko-77"], sf:["ko-81","ko-82","ko-83","ko-84"], final:["ko-76","ko-78","ko-79","ko-80","ko-85","ko-86","ko-87","ko-88"] },
  "ko-76": { r16:"ko-78", qf:["ko-79","ko-80"], sf:["ko-85","ko-86","ko-87","ko-88"], final:["ko-73","ko-74","ko-75","ko-77","ko-81","ko-82","ko-83","ko-84"] },
  "ko-77": { r16:"ko-74", qf:["ko-73","ko-75"], sf:["ko-81","ko-82","ko-83","ko-84"], final:["ko-76","ko-78","ko-79","ko-80","ko-85","ko-86","ko-87","ko-88"] },
  "ko-78": { r16:"ko-76", qf:["ko-79","ko-80"], sf:["ko-85","ko-86","ko-87","ko-88"], final:["ko-73","ko-74","ko-75","ko-77","ko-81","ko-82","ko-83","ko-84"] },
  "ko-79": { r16:"ko-80", qf:["ko-76","ko-78"], sf:["ko-85","ko-86","ko-87","ko-88"], final:["ko-73","ko-74","ko-75","ko-77","ko-81","ko-82","ko-83","ko-84"] },
  "ko-80": { r16:"ko-79", qf:["ko-76","ko-78"], sf:["ko-85","ko-86","ko-87","ko-88"], final:["ko-73","ko-74","ko-75","ko-77","ko-81","ko-82","ko-83","ko-84"] },
  "ko-81": { r16:"ko-82", qf:["ko-83","ko-84"], sf:["ko-73","ko-74","ko-75","ko-77"], final:["ko-76","ko-78","ko-79","ko-80","ko-85","ko-86","ko-87","ko-88"] },
  "ko-82": { r16:"ko-81", qf:["ko-83","ko-84"], sf:["ko-73","ko-74","ko-75","ko-77"], final:["ko-76","ko-78","ko-79","ko-80","ko-85","ko-86","ko-87","ko-88"] },
  "ko-83": { r16:"ko-84", qf:["ko-81","ko-82"], sf:["ko-73","ko-74","ko-75","ko-77"], final:["ko-76","ko-78","ko-79","ko-80","ko-85","ko-86","ko-87","ko-88"] },
  "ko-84": { r16:"ko-83", qf:["ko-81","ko-82"], sf:["ko-73","ko-74","ko-75","ko-77"], final:["ko-76","ko-78","ko-79","ko-80","ko-85","ko-86","ko-87","ko-88"] },
  "ko-85": { r16:"ko-87", qf:["ko-86","ko-88"], sf:["ko-76","ko-78","ko-79","ko-80"], final:["ko-73","ko-74","ko-75","ko-77","ko-81","ko-82","ko-83","ko-84"] },
  "ko-86": { r16:"ko-88", qf:["ko-85","ko-87"], sf:["ko-76","ko-78","ko-79","ko-80"], final:["ko-73","ko-74","ko-75","ko-77","ko-81","ko-82","ko-83","ko-84"] },
  "ko-87": { r16:"ko-85", qf:["ko-86","ko-88"], sf:["ko-76","ko-78","ko-79","ko-80"], final:["ko-73","ko-74","ko-75","ko-77","ko-81","ko-82","ko-83","ko-84"] },
  "ko-88": { r16:"ko-86", qf:["ko-85","ko-87"], sf:["ko-76","ko-78","ko-79","ko-80"], final:["ko-73","ko-74","ko-75","ko-77","ko-81","ko-82","ko-83","ko-84"] },
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