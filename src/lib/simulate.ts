import { updateElo, sampleMatchOutcome, sampleKnockoutWinner, matchOutcomeProbabilities } from "./elo";
import {
  computeStandings,
  summarizeGroups,
  rankThirdPlaceTeams,
  qualifyingThirdGroups,
  isThirdPlaceQualified,
} from "./groups";
import { assignThirdPlaceSlots, simulateKnockout } from "./bracket";
import { TEAMS, TEAM_BY_CODE } from "./teams";
import { KNOCKOUT_STRUCTURE, resolveKnockoutMatch } from "./bracketTree";
import type {
  GroupLetter,
  GroupMatch,
  KnockoutMatchDef,
  MatchPrediction,
  SimulationResult,
  SimulationSettings,
  StoredResults,
  TeamCode,
  TeamProbabilities,
  KnockoutMatchupProbability,
} from "./types";

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildInitialElos(): Record<TeamCode, number> {
  return Object.fromEntries(TEAMS.map((t) => [t.code, t.initialElo])) as Record<TeamCode, number>;
}

export function applyStoredResults(
  matches: GroupMatch[],
  stored: StoredResults,
): GroupMatch[] {
  return matches.map((m) => {
    const result = stored.matches[m.id];
    if (!result) return m;
    return {
      ...m,
      played: true,
      homeGoals: result.homeGoals,
      awayGoals: result.awayGoals,
    };
  });
}

export function computeElosFromResults(
  matches: GroupMatch[],
  settings: SimulationSettings,
  eloAdjustments: Partial<Record<TeamCode, number>> = {},
): Record<TeamCode, number> {
  const elos = buildInitialElos();
  for (const code of Object.keys(eloAdjustments) as TeamCode[]) {
    elos[code] = (elos[code] ?? 1500) + (eloAdjustments[code] ?? 0);
  }
  const played = [...matches]
    .filter((m) => m.played && m.homeGoals !== undefined && m.awayGoals !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date) || a.matchday - b.matchday);

  for (const match of played) {
    // Host advantage applies only when this specific match is a genuine
    // host-nation fixture (see fixtures.ts isHostMatch). Otherwise treat
    // as neutral — group stage venues are mostly not "home" for either side.
    const ha = match.isHostMatch ? settings.homeAdvantage : 0;
    const updated = updateElo(
      elos[match.home],
      elos[match.away],
      match.homeGoals!,
      match.awayGoals!,
      settings.kFactor,
      ha,
    );
    elos[match.home] = updated.home;
    elos[match.away] = updated.away;
  }
  return elos;
}

// Knockout rounds in bracket order — real knockout matches are processed
// in this order so a team's R16 rating update happens after their (already
// processed) R32 result, matching how the bracket is actually played.
const KNOCKOUT_ROUND_ORDER = ["Round of 32", "Round of 16", "Quarterfinal", "Semifinal", "Final"];

/**
 * Same as computeElosFromResults, but ALSO processes real, already-decided
 * knockout results — group-stage Elo only reflects a team's group-stage
 * form, but every external tracker (FIFA's official ranking, eloratings.net)
 * credits teams for knockout wins too. Without this, a team's displayed
 * "current Elo" — and every forward-looking win% calculation that uses it —
 * stays frozen at their group-stage level even after they've won two
 * knockout rounds, understating their real current strength.
 *
 * This is the function that should represent "how strong is this team
 * right now" anywhere in the app — Rankings, Model Rating, win% for a
 * team's next match, What If. Knockout venues are neutral, so no host
 * advantage is applied here regardless of settings.
 */
export function computeElosIncludingKnockouts(
  groupMatches: GroupMatch[],
  stored: StoredResults,
  settings: SimulationSettings,
  eloAdjustments: Partial<Record<TeamCode, number>> = {},
): Record<TeamCode, number> {
  const elos = computeElosFromResults(groupMatches, settings, eloAdjustments);

  const decidedKnockouts = Object.keys(KNOCKOUT_STRUCTURE)
    .map((id) => {
      const result = stored.knockoutMatches?.[id];
      if (!result) return null;
      const { home, away, round } = resolveKnockoutMatch(id, stored);
      if (!home || !away || !round) return null;
      return { id, home, away, round, result };
    })
    .filter((m) => m !== null)
    .sort((a, b) => KNOCKOUT_ROUND_ORDER.indexOf(a.round) - KNOCKOUT_ROUND_ORDER.indexOf(b.round));

  for (const match of decidedKnockouts) {
    // Penalty shootouts don't reflect a real goal margin, so treat a
    // penalty-decided match as the smallest possible decisive margin (1)
    // rather than the actual shootout score — same spirit as the draw fix,
    // avoiding a degenerate/misleading margin input to the MOV curve.
    const homeGoals = match.result.penaltyWinner === "home" ? 1 : match.result.penaltyWinner === "away" ? 0 : match.result.homeGoals;
    const awayGoals = match.result.penaltyWinner === "away" ? 1 : match.result.penaltyWinner === "home" ? 0 : match.result.awayGoals;
    const updated = updateElo(elos[match.home], elos[match.away], homeGoals, awayGoals, settings.kFactor, 0);
    elos[match.home] = updated.home;
    elos[match.away] = updated.away;
  }

  return elos;
}

export function runSimulation(
  groupMatches: GroupMatch[],
  knockoutDefs: KnockoutMatchDef[],
  settings: SimulationSettings,
  seed = 42,
  storedKnockout: StoredResults["knockoutMatches"] = {},
  eloAdjustments: Partial<Record<TeamCode, number>> = {},
): SimulationResult {
  const playedCount = groupMatches.filter((m) => m.played).length;
  const baseElos = computeElosIncludingKnockouts(
    groupMatches,
    { matches: {}, knockoutMatches: storedKnockout },
    settings,
    eloAdjustments,
  );
  const rng = mulberry32(seed);

  // Real 2026 R32 matchups from FIFA's published bracket.
  const REAL_R32: Record<string, { home: TeamCode; away: TeamCode }> = {
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

  // Real R16 matchups — verified against FIFA's official bracket structure
  // and live 2026 tournament reporting (Portugal v Spain, Paraguay v France,
  // Canada v Morocco, Brazil v Norway, Mexico v England, USA v Belgium).
  // ko-89=W73vW74, ko-90=W75vW76, ko-91=W77vW78, ko-92=W79vW80,
  // ko-93=W83vW84, ko-94=W81vW82, ko-95=W86vW88, ko-96=W85vW87
  const R16_FROM_R32: Record<string, [string, string]> = {
    "ko-89": ["W73", "W74"],
    "ko-90": ["W75", "W76"],
    "ko-91": ["W77", "W78"],
    "ko-92": ["W79", "W80"],
    "ko-93": ["W83", "W84"],
    "ko-94": ["W81", "W82"],
    "ko-95": ["W86", "W88"],
    "ko-96": ["W85", "W87"],
  };

  // Real QF matchups — winners of R16 pairs face each other
  const QF_FROM_R16: Record<string, [string, string]> = {
    "ko-97":  ["W89", "W90"],
    "ko-98":  ["W93", "W94"],
    "ko-99":  ["W91", "W92"],
    "ko-100": ["W95", "W96"],
  };

  // Real SF matchups — each semifinal combines the two QFs from the SAME
  // half of the bracket (ko-97+ko-99 = the 73-80 side, ko-98+ko-100 = the
  // 81-88 side). This was previously cross-wired (ko-97+ko-98), which
  // incorrectly merged two different bracket halves into one semifinal.
  const SF_FROM_QF: Record<string, [string, string]> = {
    "ko-101": ["W97", "W99"],
    "ko-102": ["W98", "W100"],
  };

  // Build confirmedWinners from stored knockout results using real team codes.
  // ALSO pre-seed R32 participants directly — the fixture file's homeSlot/awaySlot
  // strings (like "1A", "3C/E/F/H/I") don't match the real bracket, so
  // bracket.ts resolveSlot would put wrong teams in R32. We bypass this by
  // pre-seeding all 16 real R32 matchups as participant pairs.
  const confirmedWinners: Record<string, TeamCode> = {};

  // Pre-seed R32 participants using a special "home/away" convention:
  // For each ko-NN match, store the real home as "H{NN}" and away as "A{NN}"
  // bracket.ts will be updated to check these before resolving slots.
  // Actually — simpler approach: seed all known R32 winners now, and for
  // unplayed R32 matches we'll fix bracket.ts to check REAL_R32 directly.

  // First pass: resolve R32 results (played matches → set winner W-keys)
  for (const [matchId, result] of Object.entries(storedKnockout ?? {})) {
    const def = REAL_R32[matchId];
    const num = matchId.match(/ko-(\d+)/)?.[1];
    if (!def || !num) continue;
    let winner: TeamCode;
    if (result.homeGoals > result.awayGoals || result.penaltyWinner === "home") {
      winner = def.home;
    } else if (result.awayGoals > result.homeGoals || result.penaltyWinner === "away") {
      winner = def.away;
    } else continue;
    confirmedWinners[`W${num}`] = winner;
  }

  // Second pass: resolve R16 results
  for (const [matchId, result] of Object.entries(storedKnockout ?? {})) {
    const r16Keys = R16_FROM_R32[matchId];
    const num = matchId.match(/ko-(\d+)/)?.[1];
    if (!r16Keys || !num) continue;
    const homeTeam = confirmedWinners[r16Keys[0]];
    const awayTeam = confirmedWinners[r16Keys[1]];
    if (!homeTeam || !awayTeam) continue;
    let winner: TeamCode;
    if (result.homeGoals > result.awayGoals || result.penaltyWinner === "home") {
      winner = homeTeam;
    } else if (result.awayGoals > result.homeGoals || result.penaltyWinner === "away") {
      winner = awayTeam;
    } else continue;
    confirmedWinners[`W${num}`] = winner;
  }

  // Third pass: resolve QF results
  for (const [matchId, result] of Object.entries(storedKnockout ?? {})) {
    const qfKeys = QF_FROM_R16[matchId];
    const num = matchId.match(/ko-(\d+)/)?.[1];
    if (!qfKeys || !num) continue;
    const homeTeam = confirmedWinners[qfKeys[0]];
    const awayTeam = confirmedWinners[qfKeys[1]];
    if (!homeTeam || !awayTeam) continue;
    let winner: TeamCode;
    if (result.homeGoals > result.awayGoals || result.penaltyWinner === "home") {
      winner = homeTeam;
    } else if (result.awayGoals > result.homeGoals || result.penaltyWinner === "away") {
      winner = awayTeam;
    } else continue;
    confirmedWinners[`W${num}`] = winner;
  }

  // Fourth pass: resolve SF results
  for (const [matchId, result] of Object.entries(storedKnockout ?? {})) {
    const sfKeys = SF_FROM_QF[matchId];
    const num = matchId.match(/ko-(\d+)/)?.[1];
    if (!sfKeys || !num) continue;
    const homeTeam = confirmedWinners[sfKeys[0]];
    const awayTeam = confirmedWinners[sfKeys[1]];
    if (!homeTeam || !awayTeam) continue;
    let winner: TeamCode;
    if (result.homeGoals > result.awayGoals || result.penaltyWinner === "home") {
      winner = homeTeam;
    } else if (result.awayGoals > result.homeGoals || result.penaltyWinner === "away") {
      winner = awayTeam;
    } else continue;
    confirmedWinners[`W${num}`] = winner;
  }

  const counts = initCounts();
  const matchupCounts = new Map<string, number>();
  const matchupWinnerCounts = new Map<string, Map<TeamCode, number>>();
  for (let i = 0; i < settings.simulations; i++) {
    const sim = simulateOnce(groupMatches, knockoutDefs, baseElos, settings, rng, confirmedWinners, REAL_R32);
    accumulate(counts, sim);
    accumulateMatchups(matchupCounts, matchupWinnerCounts, sim.matchups);
  }

  return {
    simulations: settings.simulations,
    playedMatches: playedCount,
    probabilities: finalizeProbabilities(counts, settings.simulations),
    knockoutMatchups: finalizeMatchups(matchupCounts, matchupWinnerCounts, settings.simulations),
  };
}

function initCounts(): Record<TeamCode, Omit<TeamProbabilities, "code" | "name">> {
  const empty = {
  groupWin: 0,
  groupSecond: 0,
  groupThird: 0,
  advanceFromGroup: 0,
  advanceAsThird: 0,
  roundOf32: 0,
  roundOf16: 0,
  quarterFinal: 0,
  semiFinal: 0,
  final: 0,
  champion: 0,
};
  return Object.fromEntries(TEAMS.map((t) => [t.code, { ...empty }])) as Record<
    TeamCode,
    Omit<TeamProbabilities, "code" | "name">
  >;
}

function simulateOnce(
  groupMatches: GroupMatch[],
  knockoutDefs: KnockoutMatchDef[],
  startElos: Record<TeamCode, number>,
  settings: SimulationSettings,
  rng: () => number,
  confirmedWinners: Record<string, TeamCode> = {},
  realR32: Record<string, { home: TeamCode; away: TeamCode }> = {},
): {
  groups: ReturnType<typeof summarizeGroups>;
  qualifiedThird: ReturnType<typeof qualifyingThirdGroups>;
  champion: TeamCode;
  reached: Partial<Record<TeamCode, Set<string>>>;
  matchups: Array<{ id: string; round: KnockoutMatchDef["round"]; home: TeamCode; away: TeamCode; winner: TeamCode }>;
} {
  const elos = { ...startElos };
  const simulatedMatches = groupMatches.map((m) => ({ ...m }));

  for (const match of simulatedMatches) {
    if (match.played) continue;
    const ha = match.isHostMatch ? settings.homeAdvantage : 0;
    const outcome = sampleMatchOutcome(
      elos[match.home],
      elos[match.away],
      ha,
      rng,
    );
    match.played = true;
    match.homeGoals = outcome.homeGoals;
    match.awayGoals = outcome.awayGoals;
    const updated = updateElo(
      elos[match.home],
      elos[match.away],
      outcome.homeGoals,
      outcome.awayGoals,
      settings.kFactor,
      ha,
    );
    elos[match.home] = updated.home;
    elos[match.away] = updated.away;
  }

  const standings = computeStandings(simulatedMatches);
  const groups = summarizeGroups(standings);
  const thirdRanked = rankThirdPlaceTeams(groups);
  const qualifiedThird = qualifyingThirdGroups(thirdRanked);
  const thirdAssignments = assignThirdPlaceSlots(thirdRanked, qualifiedThird);

  const groupWinners = Object.fromEntries(
    groups.map((g) => [g.group, g.winner]),
  ) as Record<GroupLetter, TeamCode>;
  const groupRunnersUp = Object.fromEntries(
    groups.map((g) => [g.group, g.runnerUp]),
  ) as Record<GroupLetter, TeamCode>;

  const { champion, reached, matchups } = simulateKnockout(
    knockoutDefs,
    groupWinners,
    groupRunnersUp,
    thirdAssignments,
    elos,
    rng,
    sampleKnockoutWinner,
    confirmedWinners,
    realR32,
  );

  return { groups, qualifiedThird, champion, reached, matchups };
}

function accumulate(
  counts: Record<TeamCode, Omit<TeamProbabilities, "code" | "name">>,
  sim: ReturnType<typeof simulateOnce>,
) {
  for (const group of sim.groups) {
    const thirdQualified = isThirdPlaceQualified(group.group, sim.qualifiedThird);

counts[group.winner].groupWin += 1;
counts[group.runnerUp].groupSecond += 1;
counts[group.third].groupThird += 1;

counts[group.winner].advanceFromGroup += 1;
counts[group.runnerUp].advanceFromGroup += 1;

if (thirdQualified) {
  counts[group.third].advanceFromGroup += 1;
  counts[group.third].advanceAsThird += 1;
}

    for (const code of [group.winner, group.runnerUp, group.third]) {
      if (
        code === group.winner ||
        code === group.runnerUp ||
        isThirdPlaceQualified(group.group, sim.qualifiedThird)
      ) {
        counts[code].roundOf32 += 1;
      }
    }
  }

  for (const [team, rounds] of Object.entries(sim.reached) as [TeamCode, Set<string>][]) {
    if (rounds.has("Round of 16")) counts[team].roundOf16 += 1;
    if (rounds.has("Quarter-final")) counts[team].quarterFinal += 1;
    if (rounds.has("Semi-final")) counts[team].semiFinal += 1;
    if (rounds.has("Final")) counts[team].final += 1;
  }

  counts[sim.champion].champion += 1;
}

function finalizeProbabilities(
  counts: Record<TeamCode, Omit<TeamProbabilities, "code" | "name">>,
  simulations: number,
): TeamProbabilities[] {
  return TEAMS.map((team) => {
    const c = counts[team.code];
    const pct = (n: number) => n / simulations;
    return {
  code: team.code,
  name: team.name,
  groupWin: pct(c.groupWin),
  groupSecond: pct(c.groupSecond),
  groupThird: pct(c.groupThird),
  advanceFromGroup: pct(c.advanceFromGroup),
  advanceAsThird: pct(c.advanceAsThird),
  roundOf32: pct(c.roundOf32),
  roundOf16: pct(c.roundOf16),
  quarterFinal: pct(c.quarterFinal),
  semiFinal: pct(c.semiFinal),
  final: pct(c.final),
  champion: pct(c.champion),
};
  }).sort((a, b) => b.champion - a.champion);
}

function matchupKey(
  id: string,
  round: KnockoutMatchDef["round"],
  teamA: TeamCode,
  teamB: TeamCode,
): string {
  const [a, b] = [teamA, teamB].sort();
  return `${id}|${round}|${a}|${b}`;
}

function accumulateMatchups(
  matchupCounts: Map<string, number>,
  matchupWinnerCounts: Map<string, Map<TeamCode, number>>,
  matchups: Array<{ id: string; round: KnockoutMatchDef["round"]; home: TeamCode; away: TeamCode; winner: TeamCode }>,
) {
  for (const matchup of matchups) {
    const key = matchupKey(matchup.id, matchup.round, matchup.home, matchup.away);
    matchupCounts.set(key, (matchupCounts.get(key) ?? 0) + 1);

    // Track who won *this specific pairing in this specific slot* — this is
    // what lets the bracket project a real conditional winner instead of a
    // raw pairwise Elo comparison.
    const winnerCounts = matchupWinnerCounts.get(key) ?? new Map<TeamCode, number>();
    winnerCounts.set(matchup.winner, (winnerCounts.get(matchup.winner) ?? 0) + 1);
    matchupWinnerCounts.set(key, winnerCounts);
  }
}

function finalizeMatchups(
  matchupCounts: Map<string, number>,
  matchupWinnerCounts: Map<string, Map<TeamCode, number>>,
  simulations: number,
): KnockoutMatchupProbability[] {
  return Array.from(matchupCounts.entries())
    .map(([key, count]) => {
      const [id, round, teamA, teamB] = key.split("|") as [
        string,
        KnockoutMatchDef["round"],
        TeamCode,
        TeamCode,
      ];

      const winnerCounts = matchupWinnerCounts.get(key);
      let projectedWinner: TeamCode = teamA;
      let winnerProbability = 0.5;
      if (winnerCounts) {
        const timesTheyMet = count;
        let bestTeam: TeamCode = teamA;
        let bestCount = 0;
        for (const [team, teamWinCount] of winnerCounts.entries()) {
          if (teamWinCount > bestCount) {
            bestCount = teamWinCount;
            bestTeam = team;
          }
        }
        projectedWinner = bestTeam;
        winnerProbability = bestCount / timesTheyMet;
      }

      return {
        id,
        round,
        teamA,
        teamB,
        probability: count / simulations,
        projectedWinner,
        winnerProbability,
      };
    })
    .sort((a, b) => b.probability - a.probability);
}

export function predictUpcoming(
  groupMatches: GroupMatch[],
  elos: Record<TeamCode, number>,
  settings: SimulationSettings,
): MatchPrediction[] {
  return [...groupMatches]
  .filter((m) => !m.played)
  .sort((a, b) => a.date.localeCompare(b.date) || a.matchday - b.matchday)
  .slice(0, 8)
  .map((m) => {
      const ha = m.isHostMatch ? settings.homeAdvantage : 0;
      const probs = matchOutcomeProbabilities(elos[m.home], elos[m.away], ha);
      return {
        id: m.id,
        home: m.home,
        away: m.away,
        homeWin: probs.homeWin,
        draw: probs.draw,
        awayWin: probs.awayWin,
        label: `${TEAM_BY_CODE[m.home].name} vs ${TEAM_BY_CODE[m.away].name}`,
      };
    });
}