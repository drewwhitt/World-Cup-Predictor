import type { GroupLetter, KnockoutMatchDef, TeamCode } from "./types";
import type { ThirdPlaceCandidate } from "./groups";

/** Round-of-32 slots that need a third-place team and their eligible groups. */
const THIRD_PLACE_SLOTS: Array<{ slot: string; eligible: GroupLetter[] }> = [
  { slot: "3AB", eligible: ["A", "B", "C", "D", "F"] },
  { slot: "3CD", eligible: ["C", "D", "F", "G", "H"] },
  { slot: "3CE", eligible: ["C", "E", "F", "H", "I"] },
  { slot: "3EH", eligible: ["E", "H", "I", "J", "K"] },
  { slot: "3BE", eligible: ["B", "E", "F", "I", "J"] },
  { slot: "3AE", eligible: ["A", "E", "H", "I", "J"] },
  { slot: "3EF", eligible: ["E", "F", "G", "I", "J"] },
  { slot: "3DE", eligible: ["D", "E", "I", "J", "L"] },
];

/** Maps fixture placeholder strings to internal slot keys. */
const FIXTURE_THIRD_SLOT: Record<string, string> = {
  "3A/B/C/D/F": "3AB",
  "3C/D/F/G/H": "3CD",
  "3C/E/F/H/I": "3CE",
  "3E/H/I/J/K": "3EH",
  "3B/E/F/I/J": "3BE",
  "3A/E/H/I/J": "3AE",
  "3E/F/G/I/J": "3EF",
  "3D/E/I/J/L": "3DE",
};

export function assignThirdPlaceSlots(
  thirdRanked: ThirdPlaceCandidate[],
  qualifiedGroups: GroupLetter[],
): Record<string, TeamCode> {
  const assignments: Record<string, TeamCode> = {};
  const remaining = thirdRanked.filter((t) => qualifiedGroups.includes(t.group));
  const used = new Set<TeamCode>();

  for (const { slot, eligible } of THIRD_PLACE_SLOTS) {
    const pick = remaining.find((t) => eligible.includes(t.group) && !used.has(t.team));
    if (pick) {
      assignments[slot] = pick.team;
      used.add(pick.team);
    }
  }

  // Fill any unfilled slots with remaining qualifiers (fallback)
  for (const { slot } of THIRD_PLACE_SLOTS) {
    if (assignments[slot]) continue;
    const pick = remaining.find((t) => !used.has(t.team));
    if (pick) {
      assignments[slot] = pick.team;
      used.add(pick.team);
    }
  }

  return assignments;
}

export function resolveSlot(
  slot: string,
  groupWinners: Record<GroupLetter, TeamCode>,
  groupRunnersUp: Record<GroupLetter, TeamCode>,
  thirdAssignments: Record<string, TeamCode>,
  winners: Record<string, TeamCode>,
): TeamCode | null {
  if (/^W\d+$/.test(slot)) {
    return winners[slot] ?? null;
  }

  const winnerMatch = slot.match(/^1([A-L])$/);
  if (winnerMatch) {
    return groupWinners[winnerMatch[1] as GroupLetter];
  }

  const runnerMatch = slot.match(/^2([A-L])$/);
  if (runnerMatch) {
    return groupRunnersUp[runnerMatch[1] as GroupLetter];
  }

  const thirdKey = FIXTURE_THIRD_SLOT[slot];
  if (thirdKey) {
    return thirdAssignments[thirdKey] ?? null;
  }

  return null;
}

export function simulateKnockout(
  defs: KnockoutMatchDef[],
  groupWinners: Record<GroupLetter, TeamCode>,
  groupRunnersUp: Record<GroupLetter, TeamCode>,
  thirdAssignments: Record<string, TeamCode>,
  elos: Record<TeamCode, number>,
  rng: () => number,
  sampleWinner: (
    home: TeamCode,
    away: TeamCode,
    elos: Record<TeamCode, number>,
    rng: () => number,
  ) => TeamCode,
): {
  champion: TeamCode;
  reached: Partial<Record<TeamCode, Set<string>>>;
  matchups: Array<{ round: KnockoutMatchDef["round"]; home: TeamCode; away: TeamCode }>;
} {
  const winners: Record<string, TeamCode> = {};
  const reached: Partial<Record<TeamCode, Set<string>>> = {};
  let champion: TeamCode | null = null;
  const matchups: Array<{ round: KnockoutMatchDef["round"]; home: TeamCode; away: TeamCode }> = [];
  const track = (team: TeamCode, round: string) => {
    (reached[team] ??= new Set()).add(round);
  };

  for (const def of defs) {
    const home = resolveSlot(def.homeSlot, groupWinners, groupRunnersUp, thirdAssignments, winners);
    const away = resolveSlot(def.awaySlot, groupWinners, groupRunnersUp, thirdAssignments, winners);
    if (!home || !away) continue;
    matchups.push({
  round: def.round,
  home,
  away,
});
    track(home, def.round);
    track(away, def.round);

    const winner = sampleWinner(home, away, elos, rng);
    const matchNum = def.id.match(/ko-(\d+)/);
    if (def.round === "Final") {
      champion = winner;
    } else if (matchNum) {
      winners[`W${matchNum[1]}`] = winner;
    }

    track(winner, nextRound(def.round));
  }

  if (!champion) {
    throw new Error("Knockout simulation did not produce a champion — check bracket resolution");
  }
  return { champion, reached, matchups };
}

function nextRound(round: KnockoutMatchDef["round"]): string {
  switch (round) {
    case "Round of 32":
      return "Round of 16";
    case "Round of 16":
      return "Quarter-final";
    case "Quarter-final":
      return "Semi-final";
    case "Semi-final":
      return "Final";
    default:
      return "Champion";
  }
}
