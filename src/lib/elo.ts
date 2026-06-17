import type { TeamCode } from "./types";

const DRAW_PROB_SCALE = 0.28;

export function expectedScore(eloA: number, eloB: number, homeAdv = 0): number {
  return 1 / (1 + 10 ** ((eloB - eloA - homeAdv) / 400));
}

export function matchOutcomeProbabilities(
  homeElo: number,
  awayElo: number,
  homeAdvantage: number,
): { homeWin: number; draw: number; awayWin: number } {
  const homeExpected = expectedScore(homeElo, awayElo, homeAdvantage);
  const drawBase = DRAW_PROB_SCALE * (1 - Math.abs(homeExpected - 0.5) * 1.6);
  const draw = Math.max(0.08, Math.min(0.32, drawBase));
  const remaining = 1 - draw;
  return {
    homeWin: remaining * homeExpected,
    draw,
    awayWin: remaining * (1 - homeExpected),
  };
}

export function updateElo(
  homeElo: number,
  awayElo: number,
  homeGoals: number,
  awayGoals: number,
  kFactor: number,
  homeAdvantage: number,
): { home: number; away: number } {
  const expectedHome = expectedScore(homeElo, awayElo, homeAdvantage);
  let homeScore: number;
  if (homeGoals > awayGoals) {
    homeScore = 1;
  } else if (homeGoals < awayGoals) {
    homeScore = 0;
  } else {
    homeScore = 0.5;
  }

  const margin = Math.abs(homeGoals - awayGoals);
  const multiplier = margin <= 1 ? 1 : margin === 2 ? 1.25 : 1.4;

  const delta = kFactor * multiplier * (homeScore - expectedHome);
  return {
    home: homeElo + delta,
    away: awayElo - delta,
  };
}

export function sampleMatchOutcome(
  homeElo: number,
  awayElo: number,
  homeAdvantage: number,
  rng: () => number,
): { homeGoals: number; awayGoals: number } {
  const probs = matchOutcomeProbabilities(homeElo, awayElo, homeAdvantage);
  const roll = rng();
  if (roll < probs.homeWin) {
    const goals = rng() < 0.55 ? 1 : rng() < 0.8 ? 2 : 3;
    const concede = rng() < 0.65 ? 0 : 1;
    return { homeGoals: goals, awayGoals: concede };
  }
  if (roll < probs.homeWin + probs.draw) {
    const goals = rng() < 0.7 ? 1 : 2;
    return { homeGoals: goals, awayGoals: goals };
  }
  const goals = rng() < 0.55 ? 1 : rng() < 0.8 ? 2 : 3;
  const concede = rng() < 0.65 ? 0 : 1;
  return { homeGoals: concede, awayGoals: goals };
}

export function sampleKnockoutWinner(
  home: TeamCode,
  away: TeamCode,
  elos: Record<TeamCode, number>,
  rng: () => number,
): TeamCode {
  const probs = matchOutcomeProbabilities(elos[home], elos[away], 0);
  const roll = rng();
  if (roll < probs.homeWin) return home;
  if (roll < probs.homeWin + probs.draw) {
    return rng() < expectedScore(elos[home], elos[away], 0) ? home : away;
  }
  return away;
}
