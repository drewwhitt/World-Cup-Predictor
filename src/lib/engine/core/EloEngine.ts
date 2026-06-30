/**
 * EloEngine.ts
 * Universal Elo engine. Works for every sport — only the SportConfig changes.
 *
 * Key design principle: this file never imports sport-specific logic.
 * All sport-specific behavior lives in SportConfig.
 */

import type { SportConfig } from './SportConfig';

// ── Types ──────────────────────────────────────────────────────────────────

export interface MatchOutcomeProbabilities {
  homeWin: number;
  draw: number;
  awayWin: number;
}

/**
 * Advancement probabilities for elimination contexts.
 * Draw probability is redistributed based on the eliminationFormat.
 * The `knockoutMode` discriminator lets call sites distinguish this from MatchOutcomeProbabilities.
 *
 * Redistribution rules:
 *   penalty / extra_time / away_goals — 50/50 split (penalties modelled as coin flip)
 *   ot_possession  — 60/40 split favouring the team with first OT possession
 *                    (home team gets first possession, so home gets 60% of draw prob)
 *   series         — draw per game is impossible; draw prob is 0 by SportConfig already
 */
export interface AdvancementProbabilities {
  homeWin: number;
  draw: 0;
  awayWin: number;
  knockoutMode: true;
  eliminationFormat: NonNullable<import('./SportConfig').SportConfig['eliminationFormat']>;
}

export interface EloUpdate {
  home: number;
  away: number;
}

export interface MatchContext {
  homeRestDays?: number;     // days since last game for home team
  awayRestDays?: number;
  isHomeAdvantage?: boolean; // explicit override (e.g. WC host)
  isMatchup?: boolean;       // familiar matchup (div game, same-league)
  isExhibition?: boolean;    // preseason / friendly
  isPlayoff?: boolean;
  // Quality metrics (xG for soccer, EPA for NFL, net rating for NBA)
  homeQuality?: number;      // e.g. home team's xG in the match
  awayQuality?: number;
}

export interface FormMatch {
  result: 'W' | 'D' | 'L';
  isCompetitive: boolean;
  opponentElo: number;
  date: Date;
}

// ── Core probability engine ────────────────────────────────────────────────

/**
 * Win probability for the "home" team (or team A in neutral context).
 * Pure logistic: same formula for every sport.
 */
export function winProbability(
  eloA: number,
  eloB: number,
  advantage: number,
  divisor = 400,
): number {
  return 1 / (1 + 10 ** ((eloB - eloA - advantage) / divisor));
}

/**
 * Post-processing step: convert 3-way match probabilities to 2-way advancement
 * probabilities for knockout rounds. Penalties are modelled as a 50/50 coin flip,
 * so the draw probability is split equally between both sides.
 * Core Elo engine is untouched — this is applied only at the output layer.
 */
function toAdvancementProbabilities(
  probs: MatchOutcomeProbabilities,
  format: NonNullable<import('./SportConfig').SportConfig['eliminationFormat']>,
): AdvancementProbabilities {
  let homeShare: number;
  let awayShare: number;

  switch (format) {
    case 'ot_possession':
      // NFL OT: team with first possession wins ~60% of OT games.
      // Home team gets first OT possession (coin-flip in practice, but
      // home advantage is real — modelled as 60/40 split of draw probability).
      homeShare = 0.60;
      awayShare = 0.40;
      break;
    case 'series':
      // Per-game draws are impossible in series formats (NBA/NHL) — draw prob
      // should already be 0 from SportConfig, but guard defensively.
      homeShare = 0.5;
      awayShare = 0.5;
      break;
    case 'penalty':
    case 'extra_time':
    case 'away_goals':
    default:
      // Standard knockout: penalties are a 50/50 coin flip.
      homeShare = 0.5;
      awayShare = 0.5;
      break;
  }

  return {
    homeWin: probs.homeWin + probs.draw * homeShare,
    draw: 0,
    awayWin: probs.awayWin + probs.draw * awayShare,
    knockoutMode: true,
    eliminationFormat: format,
  };
}

/**
 * Full 3-outcome probabilities for a match.
 * For sports without draws (NFL/NBA), draw ≈ 0 and homeWin + awayWin ≈ 1.
 * In knockout mode (config.knockoutStage = true), returns AdvancementProbabilities:
 * draw probability is split 50/50 between both sides (penalties modelled as coin flip).
 */
export function matchOutcomeProbabilities(
  homeElo: number,
  awayElo: number,
  advantage: number,
  config: SportConfig,
): MatchOutcomeProbabilities | AdvancementProbabilities {
  const homeExp = winProbability(homeElo, awayElo, advantage, config.eloDivisor);

  const drawBase = config.drawProbScale * (1 - Math.abs(homeExp - 0.5) * 1.6);
  const draw = Math.max(config.drawMin, Math.min(config.drawMax, drawBase));
  const remaining = 1 - draw;

  const raw: MatchOutcomeProbabilities = {
    homeWin: remaining * homeExp,
    draw,
    awayWin: remaining * (1 - homeExp),
  };

  return config.eliminationFormat && config.eliminationFormat !== 'none'
    ? toAdvancementProbabilities(raw, config.eliminationFormat)
    : raw;
}

// ── Context adjustment ─────────────────────────────────────────────────────

/**
 * Compute the effective home advantage for a specific match.
 * Accounts for: venue type, rest differential, matchup familiarity.
 * Returns a net Elo adjustment to add to the home team's effective rating.
 */
export function computeContextAdvantage(
  context: MatchContext,
  config: SportConfig,
): number {
  let advantage = 0;

  // Base home advantage
  if (config.homeIsAlwaysAdvantage) {
    advantage += config.homeAdvantage;
  } else if (context.isHomeAdvantage) {
    advantage += config.homeAdvantage; // e.g. WC host nation
  }

  // Rest day differential
  const homeRest = context.homeRestDays ?? config.normalRestDays;
  const awayRest = context.awayRestDays ?? config.normalRestDays;
  const homeRestAdj = (homeRest - config.normalRestDays) * config.restFactor;
  const awayRestAdj = (awayRest - config.normalRestDays) * config.restFactor;
  advantage += homeRestAdj - awayRestAdj;

  return advantage;
}

/**
 * Apply matchup variance flattening for familiar opponents.
 * Compresses the Elo gap toward zero by the configured fraction.
 * Used for: NFL divisional games, soccer matchday 3, same-conference NBA.
 */
export function applyMatchupFlatten(
  homeElo: number,
  awayElo: number,
  flattenFraction: number,
): { homeElo: number; awayElo: number } {
  const avg = (homeElo + awayElo) / 2;
  return {
    homeElo: avg + (homeElo - avg) * (1 - flattenFraction),
    awayElo: avg + (awayElo - avg) * (1 - flattenFraction),
  };
}

// ── Quality metric conversion ──────────────────────────────────────────────

/**
 * Convert a quality metric differential (xG diff, EPA diff, net rating diff)
 * into a [0,1] win probability proxy.
 *
 * Uses a sigmoid centered at 0: quality diff of 0 → 0.5.
 * The scale parameter controls how quickly it saturates — larger scale
 * means quality differences matter less (more uncertainty).
 *
 * This is the universal bridge between sport-specific metrics and Elo.
 */
export function qualityMetricToOutcome(
  homeMetric: number,
  awayMetric: number,
): number {
  const diff = homeMetric - awayMetric;
  const total = Math.abs(homeMetric) + Math.abs(awayMetric);
  const scale = Math.max(1.0, total * 0.5); // normalize by game volume
  return 1 / (1 + Math.exp(-diff / scale));
}

// ── Elo update engine ──────────────────────────────────────────────────────

/**
 * Update Elo ratings after a match.
 * Blends result-based update with quality metric update (xG/EPA/net rating).
 *
 * This is the same function for every sport — only the config values change.
 */
export function updateElo(
  homeElo: number,
  awayElo: number,
  homeScore: number,   // goals, points, etc.
  awayScore: number,
  advantage: number,   // pre-computed context advantage
  config: SportConfig,
  context: MatchContext = {},
): EloUpdate {
  const margin = homeScore - awayScore;

  // Result-based outcome [0, 0.5, 1]
  const resultActual =
    margin > 0 ? 1.0 : margin < 0 ? 0.0 : 0.5;

  // Margin-of-victory multiplier (log scale, same across sports)
  const movMultiplier = movMult(margin, homeElo, awayElo, advantage, config);

  // Expected probability
  const expectedHome = winProbability(homeElo, awayElo, advantage, config.eloDivisor);

  let delta: number;

  if (
    context.homeQuality !== undefined &&
    context.awayQuality !== undefined &&
    config.qualityBlend > 0
  ) {
    // Blended update: (1 - blend) × result + blend × quality metric
    const qualityActual = qualityMetricToOutcome(
      context.homeQuality,
      context.awayQuality,
    );
    const blendedActual =
      (1 - config.qualityBlend) * resultActual +
      config.qualityBlend * qualityActual;

    // Quality margin multiplier
    const qualityGap = Math.abs(context.homeQuality - context.awayQuality);
    const qualityMult = qualityGap < 3 ? 1 : qualityGap < 8 ? 1.1 : 1.2;
    const blendedMult =
      (1 - config.qualityBlend) * movMultiplier +
      config.qualityBlend * qualityMult;

    const k = config.kFactor * (context.isPlayoff ? config.playoffKMult : 1);
    delta = k * blendedMult * (blendedActual - expectedHome);
  } else {
    // Pure result-based update
    const k = config.kFactor * (context.isPlayoff ? config.playoffKMult : 1);
    delta = k * movMultiplier * (resultActual - expectedHome);
  }

  return {
    home: homeElo + delta,
    away: awayElo - delta,
  };
}

/**
 * Margin-of-victory multiplier.
 * Uses the 538-style formula: ln(|margin| + 1) × movMult / autocorr_correction
 * This prevents runaway Elo from blowouts while still rewarding dominance.
 */
function movMult(
  margin: number,
  homeElo: number,
  awayElo: number,
  advantage: number,
  config: SportConfig,
): number {
  const eloDiff = homeElo - awayElo + advantage;
  const autocorrCorrection = Math.abs(eloDiff) * 0.001 + 2.2;
  return (Math.log(Math.abs(margin) + 1) * config.movMultiplier) / autocorrCorrection;
}

// ── Form score engine ──────────────────────────────────────────────────────

/**
 * Compute a team's pre-match form score from recent results.
 * Returns a value in [-1, 1]: +1 = perfect form, -1 = terrible form.
 *
 * Identical function for every sport. Config controls:
 * - formWindow (how many matches)
 * - formDecay (linear or exponential recency weighting)
 * - compMatchWeight vs exhibitionWeight (competitive vs friendly)
 * - oppQualityExp (how steeply to penalize wins over weak opponents)
 *
 * The resulting score is converted to an Elo adjustment by:
 *   formBonus = formScore × formEloRange × (W_FORM / (W_ELO + W_FORM))
 */
export function computeFormScore(
  matches: FormMatch[],
  config: SportConfig,
): number {
  if (matches.length === 0) return 0;

  // Take the most recent N matches
  const recent = matches
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, config.formWindow)
    .reverse(); // oldest first for decay calculation

  const n = recent.length;
  let totalWeight = 0;
  let weightedScore = 0;

  recent.forEach((match, i) => {
    // Time decay weight: position i=0 is oldest, i=n-1 is newest
    const position = i + 1;
    const timeWeight =
      config.formDecay === 'exponential'
        ? Math.pow(2, position - n)   // 2^(-n+1) to 2^0
        : position / n;               // 1/n to n/n

    // Match type weight
    const matchWeight = match.isCompetitive
      ? config.compMatchWeight
      : config.exhibitionWeight;

    // Opponent quality multiplier
    const oppQuality = Math.pow(match.opponentElo / 1800, config.oppQualityExp);

    const combinedWeight = timeWeight * matchWeight * oppQuality;

    // Result: W=+1, D=0, L=-1
    const resultValue =
      match.result === 'W' ? 1 : match.result === 'L' ? -1 : 0;

    weightedScore += combinedWeight * resultValue;
    totalWeight += combinedWeight;
  });

  return totalWeight > 0 ? weightedScore / totalWeight : 0;
}

/**
 * Convert a form score [-1, 1] to an Elo point adjustment.
 */
export function formScoreToEloAdj(
  formScore: number,
  config: SportConfig,
  formWeight = 0.15,
  eloWeight = 0.75,
): number {
  return formScore * config.formEloRange * (formWeight / (eloWeight + formWeight));
}

// ── Season mean reversion ──────────────────────────────────────────────────

/**
 * Apply season-start mean reversion to all team ratings.
 * NFL: 0.33 reversion (strong — roster turnover is high)
 * Soccer club: 0.10 (mild — squads are more stable)
 * WC: 0.0 (one-time event, no reversion)
 */
export function applyMeanReversion(
  elos: Record<string, number>,
  config: SportConfig,
  leagueMean = 1500,
): Record<string, number> {
  if (config.meanReversion === 0) return { ...elos };
  const result: Record<string, number> = {};
  for (const [team, elo] of Object.entries(elos)) {
    result[team] = elo * (1 - config.meanReversion) + leagueMean * config.meanReversion;
  }
  return result;
}

// ── Brier score ────────────────────────────────────────────────────────────

/**
 * Multi-class Brier score for a single match.
 * Works for 2-outcome (W/L) and 3-outcome (W/D/L) sports.
 * Lower is better. Random = 0.222 (3-class) or 0.25 (2-class).
 */
export function brierScore(
  probs: MatchOutcomeProbabilities,
  homeScore: number,
  awayScore: number,
): number {
  let actual: [number, number, number];
  if (homeScore > awayScore)      actual = [1, 0, 0];
  else if (homeScore < awayScore) actual = [0, 0, 1];
  else                            actual = [0, 1, 0];

  const p: [number, number, number] = [probs.homeWin, probs.draw, probs.awayWin];
  return (
    ((p[0] - actual[0]) ** 2 + (p[1] - actual[1]) ** 2 + (p[2] - actual[2]) ** 2) / 3
  );
}

// ── Monte Carlo simulation ─────────────────────────────────────────────────

/**
 * Sample a single match outcome given win probabilities.
 * Returns the winner ('home' | 'away' | 'draw').
 * For knockout contexts with no draws, 'draw' triggers a penalty shootout.
 */
export function sampleMatchWinner(
  probs: MatchOutcomeProbabilities,
  rng: () => number,
): 'home' | 'away' | 'draw' {
  const roll = rng();
  if (roll < probs.homeWin) return 'home';
  if (roll < probs.homeWin + probs.draw) return 'draw';
  return 'away';
}

/**
 * Penalty shootout winner (when draw in knockout round).
 * Slight favorite bias: higher-Elo team wins ~52% of shootouts.
 */
export function sampleShootoutWinner(
  homeElo: number,
  awayElo: number,
  rng: () => number,
): 'home' | 'away' {
  // Small Elo influence on shootouts (~52/48 for 100-pt gap)
  const homeProb = 0.5 + (homeElo - awayElo) * 0.0002;
  return rng() < Math.max(0.35, Math.min(0.65, homeProb)) ? 'home' : 'away';
}