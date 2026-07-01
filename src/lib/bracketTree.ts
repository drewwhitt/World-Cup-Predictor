/**
 * bracketTree.ts — encodes the official 2026 World Cup knockout bracket structure.
 *
 * The bracket is a fixed binary tree. Each team can only face opponents from
 * specific "zones" at each round — you can never face someone from outside
 * your branch until the round where your branches merge.
 *
 * Used by ForecastsView to filter projected opponents to only show teams
 * that are actually reachable at each round given the bracket structure.
 */

import type { TeamCode } from "./types";

/**
 * The 16 R32 matches, indexed by their ko- number.
 * Groups them into the bracket halves that merge at each subsequent round.
 */
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
 * Bracket tree: which R32 matches feed into each subsequent round.
 * From the official fixture file:
 *   R89 = W74 vs W77  →  QF: R97 = W89 vs W90
 *   R90 = W73 vs W75  ↗
 *   R91 = W76 vs W78  →  QF: R99 = W91 vs W92  → SF: R102
 *   R92 = W79 vs W80  ↗
 *   R93 = W83 vs W84  →  QF: R98 = W93 vs W94  → SF: R101
 *   R94 = W81 vs W82  ↗
 *   R95 = W86 vs W88  →  QF: R100 = W95 vs W96 ↗
 *   R96 = W85 vs W87  ↗
 *   Final = R101 vs R102
 */

// Each "zone" is a set of R32 match IDs whose teams could potentially
// meet at a given round. Zones merge as rounds progress.

type Zone = readonly string[]; // R32 match IDs

// The 8 R16 pairs — consecutive R32 match IDs pair up
// (ko-73 winner faces ko-74 winner, ko-75 vs ko-76, etc.)
const R16_PAIRS: readonly [string, string][] = [
  ["ko-73", "ko-74"],  // Paraguay vs France
  ["ko-75", "ko-76"],  // Canada vs Morocco
  ["ko-77", "ko-78"],  // Portugal vs Austria
  ["ko-79", "ko-80"],  // USA vs Belgium
  ["ko-81", "ko-82"],  // Brazil vs Norway
  ["ko-83", "ko-84"],  // Mexico vs England
  ["ko-85", "ko-86"],  // Argentina vs Egypt
  ["ko-87", "ko-88"],  // Switzerland vs Colombia
] as const;

// The 4 QF pairs — each merges two R16 pairs
const QF_PAIRS: readonly [Zone, Zone][] = [
  [["ko-73", "ko-74"], ["ko-75", "ko-76"]],  // QF1
  [["ko-77", "ko-78"], ["ko-79", "ko-80"]],  // QF2
  [["ko-81", "ko-82"], ["ko-83", "ko-84"]],  // QF3
  [["ko-85", "ko-86"], ["ko-87", "ko-88"]],  // QF4
] as const;

// The 2 SF pairs — each merges two QF zones
const SF_PAIRS: readonly [Zone, Zone][] = [
  [["ko-73","ko-74","ko-75","ko-76"], ["ko-77","ko-78","ko-79","ko-80"]], // SF1: QF1 vs QF2
  [["ko-81","ko-82","ko-83","ko-84"], ["ko-85","ko-86","ko-87","ko-88"]], // SF2: QF3 vs QF4
] as const;

// Final: SF1 half vs SF2 half
const FINAL_HALVES: readonly [Zone, Zone] = [
  ["ko-73","ko-74","ko-75","ko-76","ko-77","ko-78","ko-79","ko-80"],
  ["ko-81","ko-82","ko-83","ko-84","ko-85","ko-86","ko-87","ko-88"],
] as const;

/**
 * Given a team code, find which R32 match they're in.
 */
export function getR32MatchId(code: TeamCode): string | null {
  for (const [id, m] of Object.entries(R32_MATCHUPS)) {
    if (m.home === code || m.away === code) return id;
  }
  return null;
}

/**
 * For a given team, return the set of R32 match IDs whose teams could
 * potentially be their opponent at each knockout round.
 *
 * Returns null for rounds where no specific zone constraint applies
 * (shouldn't happen in a proper bracket).
 */
export function getReachableZoneByRound(teamCode: TeamCode): {
  r16: string | null;      // the one R32 match ID they face in R16
  qf: string[] | null;     // R32 match IDs of teams reachable in QF
  sf: string[] | null;     // R32 match IDs of teams reachable in SF
  final: string[] | null;  // R32 match IDs of teams reachable in Final
} {
  const myR32 = getR32MatchId(teamCode);
  if (!myR32) return { r16: null, qf: null, sf: null, final: null };

  // R16 opponent comes from the paired R32 match
  const r16Pair = R16_PAIRS.find((p) => p[0] === myR32 || p[1] === myR32);
  const r16Zone = r16Pair ? (r16Pair[0] === myR32 ? r16Pair[1] : r16Pair[0]) : null;

  // QF opponents come from the OTHER R16 pair in the same QF zone
  const qfGroup = QF_PAIRS.find((g) => g[0].includes(myR32) || g[1].includes(myR32));
  const qfZone = qfGroup
    ? (qfGroup[0].includes(myR32) ? [...qfGroup[1]] : [...qfGroup[0]])
    : null;

  // SF opponents come from the OTHER QF zone in the same SF half
  const sfGroup = SF_PAIRS.find((g) => g[0].includes(myR32) || g[1].includes(myR32));
  const sfZone = sfGroup
    ? (sfGroup[0].includes(myR32) ? [...sfGroup[1]] : [...sfGroup[0]])
    : null;

  // Final opponents come from the opposite SF half entirely
  const finalZone = FINAL_HALVES[0].includes(myR32)
    ? [...FINAL_HALVES[1]]
    : [...FINAL_HALVES[0]];

  return { r16: r16Zone, qf: qfZone, sf: sfZone, final: finalZone };
}

/**
 * Get all team codes reachable from a zone of R32 match IDs.
 */
export function teamsInZone(matchIds: string[]): Set<TeamCode> {
  const teams = new Set<TeamCode>();
  for (const id of matchIds) {
    const m = R32_MATCHUPS[id];
    if (m) { teams.add(m.home); teams.add(m.away); }
  }
  return teams;
}