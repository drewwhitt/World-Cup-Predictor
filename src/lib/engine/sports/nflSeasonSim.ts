/**
 * nflSeasonSim.ts
 * Simulates one full NFL season, start to finish: every regular-season
 * game, real playoff seeding (4 division winners + 3 wildcards per
 * conference, ranked by tiebreaker), and the actual bracket (Wild Card →
 * Divisional → Conference Championship → Super Bowl, with correct
 * re-seeding between rounds).
 *
 * KNOWN SIMPLIFICATION: real NFL tiebreakers are a long official cascade
 * (head-to-head, division record, conference record, common games,
 * strength of victory, strength of schedule, net points in common games,
 * net points overall, net touchdowns, coin toss). This implementation
 * only goes three levels deep — head-to-head, division record, conference
 * record — then falls back to point differential. That covers the large
 * majority of real tiebreak scenarios but will occasionally resolve a
 * multi-team tie differently than the NFL's official rulebook would.
 * Worth tightening later if seeding accuracy in edge cases matters more
 * than it does for "who's likely to make the playoffs" at a glance.
 *
 * Doesn't import anything from src/data — takes teams/schedule/elos as
 * plain arguments so it stays a pure, independently testable function,
 * same spirit as engine/sports/NFL.ts.
 */
import { updateNFLElo, predictNFLMatch } from "./NFL";
import { sampleMatchWinner, sampleShootoutWinner, matchOutcomeProbabilities } from "../core/EloEngine";
import { NFL } from "../core/SportConfig";

export interface SimTeam {
  code: string;
  conference: "AFC" | "NFC";
  division: string; // "East" | "North" | "South" | "West"
}

export interface SimGame {
  id: string;
  week: number;
  home: string;
  away: string;
  neutral: boolean;
  div: boolean;
}

interface Record3 {
  wins: number;
  losses: number;
  ties: number;
}

function pct(r: Record3): number {
  const games = r.wins + r.losses + r.ties;
  return games === 0 ? 0 : (r.wins + r.ties * 0.5) / games;
}

interface TeamState {
  code: string;
  overall: Record3;
  division: Record3;
  conference: Record3;
  pointDiff: number;
  headToHead: Map<string, Record3>;
}

function emptyRecord(): Record3 {
  return { wins: 0, losses: 0, ties: 0 };
}

function recordGame(state: TeamState, opponent: TeamState, isDiv: boolean, isConf: boolean, diff: number) {
  const bucket: Record3 = diff > 0 ? { wins: 1, losses: 0, ties: 0 } : diff < 0 ? { wins: 0, losses: 1, ties: 0 } : { wins: 0, losses: 0, ties: 1 };
  state.overall.wins += bucket.wins;
  state.overall.losses += bucket.losses;
  state.overall.ties += bucket.ties;
  if (isDiv) {
    state.division.wins += bucket.wins;
    state.division.losses += bucket.losses;
    state.division.ties += bucket.ties;
  }
  if (isConf) {
    state.conference.wins += bucket.wins;
    state.conference.losses += bucket.losses;
    state.conference.ties += bucket.ties;
  }
  state.pointDiff += diff;
  const h2h = state.headToHead.get(opponent.code) ?? emptyRecord();
  h2h.wins += bucket.wins;
  h2h.losses += bucket.losses;
  h2h.ties += bucket.ties;
  state.headToHead.set(opponent.code, h2h);
}

/** Three-level simplified tiebreaker (see file header). Higher is better. */
function compareTeams(a: TeamState, b: TeamState): number {
  const overallDiff = pct(a.overall) - pct(b.overall);
  if (overallDiff !== 0) return overallDiff;

  const h2h = a.headToHead.get(b.code);
  if (h2h && h2h.wins + h2h.losses + h2h.ties > 0) {
    const h2hPct = pct(h2h) - 0.5;
    if (h2hPct !== 0) return h2hPct;
  }

  const divDiff = pct(a.division) - pct(b.division);
  if (divDiff !== 0) return divDiff;

  const confDiff = pct(a.conference) - pct(b.conference);
  if (confDiff !== 0) return confDiff;

  return a.pointDiff - b.pointDiff;
}

export interface SeasonSimResult {
  seeds: Record<"AFC" | "NFC", string[]>; // 7 codes, seed 1 first
  superBowlWinner: string;
  conferenceChamps: Record<"AFC" | "NFC", string>;
  finalWins: Record<string, number>; // regular-season wins per team code
}

function playGame(homeElo: number, awayElo: number, ctx: { isDivisional?: boolean; isPlayoff?: boolean }, rng: () => number) {
  const probs = predictNFLMatch(homeElo, awayElo, ctx);
  const outcome = sampleMatchWinner(probs, rng);
  return outcome;
}

/** One playoff game between two seeded teams — always at the higher seed's stadium. */
function playPlayoffGame(
  higherSeedCode: string,
  lowerSeedCode: string,
  elos: Record<string, number>,
  rng: () => number,
): string {
  const homeElo = elos[higherSeedCode] ?? 1505;
  const awayElo = elos[lowerSeedCode] ?? 1505;
  const probs = matchOutcomeProbabilities(homeElo, awayElo, NFL.homeAdvantage, NFL);
  const outcome = sampleMatchWinner(probs as { homeWin: number; draw: number; awayWin: number }, rng);
  if (outcome === "home") return higherSeedCode;
  if (outcome === "away") return lowerSeedCode;
  const shootout = sampleShootoutWinner(homeElo, awayElo, rng);
  return shootout === "home" ? higherSeedCode : lowerSeedCode;
}

/** Standard 7-team bracket, re-seeded each round: 1-seed byes Wild Card, then always hosts the lowest remaining seed. */
function simulatePlayoffBracket(seeds: string[], elos: Record<string, number>, rng: () => number): string {
  // Wild Card: 2v7, 3v6, 4v5
  const wc: Array<[string, string]> = [
    [seeds[1], seeds[6]],
    [seeds[2], seeds[5]],
    [seeds[3], seeds[4]],
  ];
  const wcWinners = wc.map(([h, a]) => playPlayoffGame(h, a, elos, rng));

  // Divisional: 1-seed vs lowest remaining seed, other two winners play each other.
  const survivors = [seeds[0], ...wcWinners];
  const bySeed = new Map(seeds.map((code, i) => [code, i]));
  const sorted = [...survivors].sort((a, b) => (bySeed.get(a) ?? 99) - (bySeed.get(b) ?? 99));
  const [one, low, midA, midB] = sorted;
  const div1Winner = playPlayoffGame(one, low, elos, rng);
  const div2Winner = playPlayoffGame(midA, midB, elos, rng);

  // Conference Championship — re-seed once more (higher remaining seed hosts).
  const finalTwo = [div1Winner, div2Winner].sort((a, b) => (bySeed.get(a) ?? 99) - (bySeed.get(b) ?? 99));
  return playPlayoffGame(finalTwo[0], finalTwo[1], elos, rng);
}

export function simulateNflSeason(
  teams: SimTeam[],
  schedule: SimGame[],
  initialElos: Record<string, number>,
  rng: () => number,
): SeasonSimResult {
  const elos: Record<string, number> = { ...initialElos };
  const states = new Map<string, TeamState>(
    teams.map((t) => [t.code, { code: t.code, overall: emptyRecord(), division: emptyRecord(), conference: emptyRecord(), pointDiff: 0, headToHead: new Map() }]),
  );
  const teamByCode = new Map(teams.map((t) => [t.code, t]));

  const regSeason = schedule.filter((g) => g.week <= 18).sort((a, b) => a.week - b.week);

  for (const game of regSeason) {
    const homeElo = elos[game.home] ?? 1505;
    const awayElo = elos[game.away] ?? 1505;
    const ctx = { isDivisional: game.div };
    const outcome = playGame(homeElo, awayElo, ctx, rng);

    const diff = outcome === "home" ? 1 : outcome === "away" ? -1 : 0;
    const homeTeam = teamByCode.get(game.home)!;
    const awayTeam = teamByCode.get(game.away)!;
    const isDiv = homeTeam.division === awayTeam.division && homeTeam.conference === awayTeam.conference;
    const isConf = homeTeam.conference === awayTeam.conference;

    recordGame(states.get(game.home)!, states.get(game.away)!, isDiv, isConf, diff);
    recordGame(states.get(game.away)!, states.get(game.home)!, isDiv, isConf, -diff);

    // Simulate a plausible score to drive the real Elo update (margin-of-victory-aware).
    const homeWinsGame = diff > 0;
    const homePoints = homeWinsGame ? 24 : diff < 0 ? 17 : 20;
    const awayPoints = homeWinsGame ? 17 : diff < 0 ? 24 : 20;
    const updated = updateNFLElo(homeElo, awayElo, homePoints, awayPoints, { isDivisional: game.div });
    elos[game.home] = updated.home;
    elos[game.away] = updated.away;
  }

  const seeds: Record<"AFC" | "NFC", string[]> = { AFC: [], NFC: [] };
  const finalWins: Record<string, number> = {};
  for (const t of teams) finalWins[t.code] = states.get(t.code)!.overall.wins;

  for (const conf of ["AFC", "NFC"] as const) {
    const confTeams = teams.filter((t) => t.conference === conf);
    const divisions = [...new Set(confTeams.map((t) => t.division))];

    const divisionWinners: string[] = [];
    for (const div of divisions) {
      const inDiv = confTeams.filter((t) => t.division === div).map((t) => states.get(t.code)!);
      inDiv.sort((a, b) => -compareTeams(a, b));
      divisionWinners.push(inDiv[0].code);
    }

    const remaining = confTeams.map((t) => states.get(t.code)!).filter((s) => !divisionWinners.includes(s.code));
    remaining.sort((a, b) => -compareTeams(a, b));
    const wildcards = remaining.slice(0, 3).map((s) => s.code);

    const divisionWinnerStates = divisionWinners.map((c) => states.get(c)!);
    divisionWinnerStates.sort((a, b) => -compareTeams(a, b));

    seeds[conf] = [...divisionWinnerStates.map((s) => s.code), ...wildcards];
  }

  const conferenceChamps: Record<"AFC" | "NFC", string> = {
    AFC: simulatePlayoffBracket(seeds.AFC, elos, rng),
    NFC: simulatePlayoffBracket(seeds.NFC, elos, rng),
  };

  const sbHomeElo = elos[conferenceChamps.AFC] ?? 1505;
  const sbAwayElo = elos[conferenceChamps.NFC] ?? 1505;
  const sbProbs = matchOutcomeProbabilities(sbHomeElo, sbAwayElo, 0, NFL); // Super Bowl is neutral site
  const sbOutcome = sampleMatchWinner(sbProbs as { homeWin: number; draw: number; awayWin: number }, rng);
  const superBowlWinner =
    sbOutcome === "home" ? conferenceChamps.AFC : sbOutcome === "away" ? conferenceChamps.NFC :
    (sampleShootoutWinner(sbHomeElo, sbAwayElo, rng) === "home" ? conferenceChamps.AFC : conferenceChamps.NFC);

  return { seeds, superBowlWinner, conferenceChamps, finalWins };
}

export interface NflTeamForecast {
  code: string;
  projectedWins: number;
  playoffPct: number;
  divisionPct: number;
  conferencePct: number;
  superBowlPct: number;
}

export function runNflMonteCarlo(
  teams: SimTeam[],
  schedule: SimGame[],
  initialElos: Record<string, number>,
  simulations: number,
  rngSeed = 2026,
): NflTeamForecast[] {
  function mulberry32(seed: number): () => number {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const rng = mulberry32(rngSeed);
  const winsSum: Record<string, number> = {};
  const playoffCount: Record<string, number> = {};
  const divisionCount: Record<string, number> = {};
  const conferenceCount: Record<string, number> = {};
  const superBowlCount: Record<string, number> = {};
  for (const t of teams) {
    winsSum[t.code] = 0;
    playoffCount[t.code] = 0;
    divisionCount[t.code] = 0;
    conferenceCount[t.code] = 0;
    superBowlCount[t.code] = 0;
  }

  for (let i = 0; i < simulations; i++) {
    const result = simulateNflSeason(teams, schedule, initialElos, rng);
    for (const t of teams) winsSum[t.code] += result.finalWins[t.code] ?? 0;
    for (const conf of ["AFC", "NFC"] as const) {
      result.seeds[conf].forEach((code, idx) => {
        playoffCount[code] += 1;
        if (idx < 4) divisionCount[code] += 1; // seeds 0-3 are always the 4 division winners
      });
    }
    conferenceCount[result.conferenceChamps.AFC] += 1;
    conferenceCount[result.conferenceChamps.NFC] += 1;
    superBowlCount[result.superBowlWinner] += 1;
  }

  return teams
    .map((t) => ({
      code: t.code,
      projectedWins: Number((winsSum[t.code] / simulations).toFixed(1)),
      playoffPct: Number(((playoffCount[t.code] / simulations) * 100).toFixed(1)),
      divisionPct: Number(((divisionCount[t.code] / simulations) * 100).toFixed(1)),
      conferencePct: Number(((conferenceCount[t.code] / simulations) * 100).toFixed(1)),
      superBowlPct: Number(((superBowlCount[t.code] / simulations) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.projectedWins - a.projectedWins);
}