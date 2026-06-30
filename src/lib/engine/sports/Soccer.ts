/**
 * soccer.ts
 * Soccer-specific logic built on top of the universal EloEngine.
 *
 * This file handles the things that are uniquely soccer:
 * - Confederation strength offsets
 * - Matchday 3 group stage pressure
 * - Host nation detection
 * - Goal-based score simulation
 *
 * Notice how thin this is — almost all logic lives in EloEngine.ts
 */

import {
  matchOutcomeProbabilities,
  updateElo,
  computeContextAdvantage,
  applyMatchupFlatten,
  formScoreToEloAdj,
  computeFormScore,
  sampleMatchWinner,
  sampleShootoutWinner,
  type FormMatch,
  type MatchContext,
  type MatchOutcomeProbabilities,
} from '../core/EloEngine';
import { SOCCER_WORLD_CUP, type SportConfig } from '../core/SportConfig';

// ── Confederation offset ───────────────────────────────────────────────────

/** Map team name → confederation */
export const CONFEDERATION_MAP: Record<string, string> = {
  // UEFA
  Spain: 'UEFA', France: 'UEFA', Germany: 'UEFA', England: 'UEFA',
  Italy: 'UEFA', Portugal: 'UEFA', Netherlands: 'UEFA', Belgium: 'UEFA',
  Croatia: 'UEFA', Switzerland: 'UEFA', Denmark: 'UEFA', Poland: 'UEFA',
  Sweden: 'UEFA', Serbia: 'UEFA', Wales: 'UEFA', Scotland: 'UEFA',
  Austria: 'UEFA', Czech: 'UEFA', Hungary: 'UEFA', Turkey: 'UEFA',
  // CONMEBOL
  Brazil: 'CONMEBOL', Argentina: 'CONMEBOL', Uruguay: 'CONMEBOL',
  Chile: 'CONMEBOL', Colombia: 'CONMEBOL', Ecuador: 'CONMEBOL',
  Paraguay: 'CONMEBOL', Peru: 'CONMEBOL',
  // CAF
  Morocco: 'CAF', Senegal: 'CAF', Nigeria: 'CAF', Ghana: 'CAF',
  Cameroon: 'CAF', Tunisia: 'CAF', Egypt: 'CAF', 'South Africa': 'CAF',
  'Ivory Coast': 'CAF', Algeria: 'CAF',
  // AFC
  Japan: 'AFC', 'South Korea': 'AFC', Australia: 'AFC', Iran: 'AFC',
  'Saudi Arabia': 'AFC', Qatar: 'AFC',
  // CONCACAF
  USA: 'CONCACAF', Mexico: 'CONCACAF', Canada: 'CONCACAF',
  'Costa Rica': 'CONCACAF', Honduras: 'CONCACAF', Panama: 'CONCACAF',
  // OFC
  'New Zealand': 'OFC',
};

/**
 * Get confederation Elo offset for a team.
 * Corrects for regional competition inflation/deflation.
 */
export function getConfederationOffset(
  team: string,
  config: SportConfig = SOCCER_WORLD_CUP,
): number {
  if (!config.confOffsets) return 0;
  const conf = CONFEDERATION_MAP[team] ?? 'UEFA';
  return config.confOffsets[conf] ?? 0;
}

// ── Effective Elo computation ──────────────────────────────────────────────

export interface SoccerTeamState {
  name: string;
  baseElo: number;
  formMatches: FormMatch[];
}

/**
 * Compute a team's effective Elo for match prediction:
 *   base Elo + form adjustment + confederation offset
 */
export function effectiveElo(
  team: SoccerTeamState,
  config: SportConfig = SOCCER_WORLD_CUP,
): number {
  const formScore = computeFormScore(team.formMatches, config);
  const formAdj = formScoreToEloAdj(formScore, config);
  const confAdj = getConfederationOffset(team.name, config);
  return team.baseElo + formAdj + confAdj;
}

// ── Match prediction ───────────────────────────────────────────────────────

export interface SoccerMatchContext {
  isHostNation?: boolean;     // home team is WC host
  homeRestDays?: number;
  awayRestDays?: number;
  isMatchday3?: boolean;      // final group stage matchday
  isPlayoff?: boolean;
  /**
   * Set eliminationFormat to trigger knockout advancement probabilities.
   * For group stage matches, omit this (draws are valid outcomes).
   *
   * Examples:
   *   WC knockout / CL knockout / MLS Cup:  'penalty'
   *   CL legacy away-goals format:          'away_goals'
   *   Champions League extra time:          'extra_time'
   */
  eliminationFormat?: 'penalty' | 'extra_time' | 'away_goals';
  homeXg?: number;            // in-match xG (for Elo update, not prediction)
  awayXg?: number;
}

/**
 * Predict match outcome probabilities.
 */
export function predictSoccerMatch(
  homeElo: number,
  awayElo: number,
  ctx: SoccerMatchContext,
  config: SportConfig = SOCCER_WORLD_CUP,
): MatchOutcomeProbabilities {
  // Compute context advantage
  const matchCtx: MatchContext = {
    isHomeAdvantage: ctx.isHostNation,
    homeRestDays: ctx.homeRestDays,
    awayRestDays: ctx.awayRestDays,
  };
  let advantage = computeContextAdvantage(matchCtx, config);

  // Matchday 3 pressure flattening
  let he = homeElo;
  let ae = awayElo;
  if (ctx.isMatchday3 && config.md3Flatten) {
    const flat = applyMatchupFlatten(he, ae, config.md3Flatten);
    he = flat.homeElo;
    ae = flat.awayElo;
  }

  // For knockout matches, override eliminationFormat so draw prob
  // is redistributed to advancement probabilities.
  const matchConfig = ctx.eliminationFormat
    ? { ...config, eliminationFormat: ctx.eliminationFormat }
    : config;

  return matchOutcomeProbabilities(he, ae, advantage, matchConfig);
}

/**
 * Update Elo ratings after a completed match.
 * Uses xG blend if available.
 */
export function updateSoccerElo(
  homeElo: number,
  awayElo: number,
  homeGoals: number,
  awayGoals: number,
  ctx: SoccerMatchContext,
  config: SportConfig = SOCCER_WORLD_CUP,
): { home: number; away: number } {
  const advantage = computeContextAdvantage(
    {
      isHomeAdvantage: ctx.isHostNation,
      homeRestDays: ctx.homeRestDays,
      awayRestDays: ctx.awayRestDays,
    },
    config,
  );

  return updateElo(homeElo, awayElo, homeGoals, awayGoals, advantage, config, {
    homeQuality: ctx.homeXg,
    awayQuality: ctx.awayXg,
    isPlayoff: ctx.isPlayoff,
  });
}

// ── Goal simulation (unchanged from original) ─────────────────────────────

/**
 * Sample a scoreline given match outcome probabilities.
 * Used for Monte Carlo tournament simulation.
 */
export function sampleSoccerScore(
  probs: MatchOutcomeProbabilities,
  rng: () => number,
): { homeGoals: number; awayGoals: number } {
  const winner = sampleMatchWinner(probs, rng);

  if (winner === 'home') {
    const goals = rng() < 0.55 ? 1 : rng() < 0.8 ? 2 : 3;
    const concede = rng() < 0.65 ? 0 : 1;
    return { homeGoals: goals, awayGoals: concede };
  }
  if (winner === 'draw') {
    const goals = rng() < 0.7 ? 1 : 2;
    return { homeGoals: goals, awayGoals: goals };
  }
  const goals = rng() < 0.55 ? 1 : rng() < 0.8 ? 2 : 3;
  const concede = rng() < 0.65 ? 0 : 1;
  return { homeGoals: concede, awayGoals: goals };
}

/**
 * Knockout round winner — handles draw via penalties.
 */
export function soccerKnockoutWinner(
  homeTeam: string,
  awayTeam: string,
  homeElo: number,
  awayElo: number,
  rng: () => number,
  config: SportConfig = SOCCER_WORLD_CUP,
): string {
  const probs = matchOutcomeProbabilities(homeElo, awayElo, 0, config);
  const result = sampleMatchWinner(probs, rng);

  if (result === 'home') return homeTeam;
  if (result === 'away') return awayTeam;

  // Penalty shootout
  const shootoutWinner = sampleShootoutWinner(homeElo, awayElo, rng);
  return shootoutWinner === 'home' ? homeTeam : awayTeam;
}