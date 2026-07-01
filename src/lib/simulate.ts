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
): Record<TeamCode, number> {
  const elos = buildInitialElos();
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

export function runSimulation(
  groupMatches: GroupMatch[],
  knockoutDefs: KnockoutMatchDef[],
  settings: SimulationSettings,
  seed = 42,
  storedKnockout: StoredResults["knockoutMatches"] = {},
): SimulationResult {
  const playedCount = groupMatches.filter((m) => m.played).length;
  const baseElos = computeElosFromResults(groupMatches, settings);
  const rng = mulberry32(seed);

  // Build W-key map from confirmed knockout results so the simulation
  // never re-draws eliminated teams. W73 = winner of ko-73, etc.
  const confirmedWinners: Record<string, TeamCode> = {};
  for (const [matchId, result] of Object.entries(storedKnockout ?? {})) {
    const num = matchId.match(/ko-(\d+)/)?.[1];
    if (!num) continue;
    // We need to know home/away codes — hardcoded R32 matchups
    const R32_HOME: Record<string, TeamCode> = {
      "73":"GER","74":"FRA","75":"RSA","76":"NED","77":"POR","78":"ESP",
      "79":"USA","80":"BEL","81":"BRA","82":"CIV","83":"MEX","84":"ENG",
      "85":"ARG","86":"AUS","87":"SUI","88":"COL",
    };
    const R32_AWAY: Record<string, TeamCode> = {
      "73":"PAR","74":"SWE","75":"CAN","76":"MAR","77":"CRO","78":"AUT",
      "79":"BIH","80":"SEN","81":"JPN","82":"NOR","83":"ECU","84":"COD",
      "85":"CPV","86":"EGY","87":"ALG","88":"GHA",
    };
    const home = R32_HOME[num];
    const away = R32_AWAY[num];
    if (!home || !away) continue;
    let winner: TeamCode;
    if (result.homeGoals > result.awayGoals || result.penaltyWinner === "home") {
      winner = home;
    } else if (result.awayGoals > result.homeGoals || result.penaltyWinner === "away") {
      winner = away;
    } else continue; // unresolved draw — shouldn't happen in knockout
    confirmedWinners[`W${num}`] = winner;
  }

  const counts = initCounts();
  const matchupCounts = new Map<string, number>();
  for (let i = 0; i < settings.simulations; i++) {
    const sim = simulateOnce(groupMatches, knockoutDefs, baseElos, settings, rng, confirmedWinners);
    accumulate(counts, sim);
    accumulateMatchups(matchupCounts, sim.matchups);
  }

  return {
    simulations: settings.simulations,
    playedMatches: playedCount,
    probabilities: finalizeProbabilities(counts, settings.simulations),
    knockoutMatchups: finalizeMatchups(matchupCounts, settings.simulations),
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
) {
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
  round: KnockoutMatchDef["round"],
  teamA: TeamCode,
  teamB: TeamCode,
): string {
  const [a, b] = [teamA, teamB].sort();
  return `${round}|${a}|${b}`;
}

function accumulateMatchups(
  matchupCounts: Map<string, number>,
  matchups: Array<{ round: KnockoutMatchDef["round"]; home: TeamCode; away: TeamCode }>,
) {
  for (const matchup of matchups) {
    const key = matchupKey(matchup.round, matchup.home, matchup.away);
    matchupCounts.set(key, (matchupCounts.get(key) ?? 0) + 1);
  }
}

function finalizeMatchups(
  matchupCounts: Map<string, number>,
  simulations: number,
): KnockoutMatchupProbability[] {
  return Array.from(matchupCounts.entries())
    .map(([key, count]) => {
      const [round, teamA, teamB] = key.split("|") as [
        KnockoutMatchDef["round"],
        TeamCode,
        TeamCode,
      ];

      return {
        round,
        teamA,
        teamB,
        probability: count / simulations,
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