/**
 * SportConfig.ts
 * Universal configuration interface for all sports.
 * Every sport is defined by a config — the engine code never changes.
 */

export interface SportConfig {
  // ── Identity ────────────────────────────────────────────────────────────────
  sport: string;
  league: string;

  // ── Probability model ───────────────────────────────────────────────────────
  eloDivisor: number;       // logistic curve steepness. 400 = standard
  drawProbScale: number;    // 0 = no draws (NFL/NBA), 0.28 = soccer
  drawMin: number;          // floor on draw probability
  drawMax: number;          // ceiling on draw probability

  // ── Elo update ──────────────────────────────────────────────────────────────
  kFactor: number;          // base learning rate per game
  movMultiplier: number;    // margin-of-victory scaling. 1.5 = empirical default
  qualityBlend: number;     // 0–1: fraction of xG/EPA in update. 0.20 = default
  playoffKMult: number;     // K multiplier for postseason games
  meanReversion: number;    // 0–1: how much ratings regress per season. 0.33 NFL

  // ── Home / venue advantage ──────────────────────────────────────────────────
  homeAdvantage: number;    // Elo pts. 40 NFL, 100 soccer host, 0 neutral
  homeIsAlwaysAdvantage: boolean; // true = NFL/NBA, false = soccer (host only)

  // ── Context adjustments ─────────────────────────────────────────────────────
  restFactor: number;       // Elo pts per rest-day deficit vs normal. 2.0 default
  normalRestDays: number;   // what "normal" rest looks like. 7 soccer, 7 NFL
  matchupVarianceFlatten: number; // compress gap for familiarity. 0.20 NFL div

  // ── Form model ──────────────────────────────────────────────────────────────
  formWindow: number;       // last N matches for form score
  formDecay: 'linear' | 'exponential';
  compMatchWeight: number;  // competitive match weight. 1.0 both sports
  exhibitionWeight: number; // friendly/preseason weight. 0.4 soccer, 0.5 NFL
  oppQualityExp: number;    // steepness of opponent quality curve. 1.5 default
  formEloRange: number;     // max Elo adjustment from form. 150 soccer

  // ── Stage context ───────────────────────────────────────────────────────────
  /**
   * How draws are resolved in this context.
   * - 'none'            — draws are a valid outcome (group stage, regular season)
   * - 'penalty'         — draw → 50/50 penalties (WC knockout, CL knockout, MLS Cup)
   * - 'extra_time'      — draw → ET then 50/50 penalties (same math, explicit label)
   * - 'away_goals'      — CL legacy format; modelled same as penalty for probability purposes
   * - 'series'          — best-of-N series; draw per game is impossible (NBA/NHL playoffs)
   * - 'ot_possession'   — NFL OT: first possession team wins ~60% (coin flip + drive)
   */
  eliminationFormat?: 'none' | 'penalty' | 'extra_time' | 'away_goals' | 'series' | 'ot_possession';

  // ── Sport-specific extras ───────────────────────────────────────────────────
  confOffsets?: Record<string, number>;  // soccer: CONMEBOL+10, CAF-15, etc.
  backupPenalty?: number;                // NFL: 120 pts when backup starts
  divisionalFlatten?: number;            // NFL: 0.20 for div games
  md3Flatten?: number;                   // soccer: 0.10 for matchday 3
}

// ── Validated sport configs ────────────────────────────────────────────────

export const SOCCER_WORLD_CUP: SportConfig = {
  sport: 'soccer',
  league: 'FIFA World Cup',

  eloDivisor: 400,
  drawProbScale: 0.28,
  drawMin: 0.08,
  drawMax: 0.32,

  kFactor: 40,
  movMultiplier: 1.5,       // log-scale: optimized from 256 matches
  qualityBlend: 0.20,       // xG blend: validated on StatsBomb data
  playoffKMult: 1.0,        // WC is already a tournament — no separate playoff
  meanReversion: 0.0,       // WC is one-time event, no season reversion

  homeAdvantage: 100,       // host nation only
  homeIsAlwaysAdvantage: false,

  restFactor: 15,           // Elo pts per day short of 3-day rest
  normalRestDays: 3,
  matchupVarianceFlatten: 0.10, // matchday 3 group stage

  formWindow: 10,
  formDecay: 'exponential',
  compMatchWeight: 1.0,
  exhibitionWeight: 0.4,
  oppQualityExp: 1.5,
  formEloRange: 150,

  confOffsets: {
    UEFA: 0,
    CONMEBOL: 10,
    CAF: -15,
    AFC: -45,
    CONCACAF: -50,
    OFC: 0,
  },
  md3Flatten: 0.10,
};

export const SOCCER_CLUB: SportConfig = {
  ...SOCCER_WORLD_CUP,
  league: 'Club (EPL/MLS/etc)',
  homeAdvantage: 70,        // club home advantage is higher than neutral WC
  homeIsAlwaysAdvantage: true,
  meanReversion: 0.10,      // slight season-to-season reversion
  confOffsets: undefined,   // no confederation offsets for club leagues
  md3Flatten: undefined,
  matchupVarianceFlatten: 0.10, // same-league familiarity
};

export const NFL: SportConfig = {
  sport: 'american_football',
  league: 'NFL',

  eloDivisor: 400,
  drawProbScale: 0.0,       // NFL has effectively no draws
  drawMin: 0.0,
  drawMax: 0.01,            // tiny allowance for OT ties

  kFactor: 30,              // optimized from 7,000+ games
  movMultiplier: 1.5,       // same as soccer — universal constant
  qualityBlend: 0.20,       // EPA blend — same as xG
  playoffKMult: 1.5,        // playoff games are more informative
  meanReversion: 0.33,      // strong season-to-season reversion

  homeAdvantage: 40,        // optimized — declining since 2020
  homeIsAlwaysAdvantage: true,

  restFactor: 2.0,          // Elo pts per day short of normal
  normalRestDays: 7,
  matchupVarianceFlatten: 0.20, // divisional games

  formWindow: 6,            // last 6 games
  formDecay: 'exponential',
  compMatchWeight: 1.0,
  exhibitionWeight: 0.5,    // preseason matters a little
  oppQualityExp: 1.5,       // same as soccer
  formEloRange: 100,        // NFL form window is shorter so range is tighter

  backupPenalty: 120,       // when backup QB starts
  divisionalFlatten: 0.20,
};

// ── NBA and NHL stubs (to be calibrated) ──────────────────────────────────

export const NBA: SportConfig = {
  sport: 'basketball',
  league: 'NBA',

  eloDivisor: 400,
  drawProbScale: 0.0,
  drawMin: 0.0,
  drawMax: 0.0,

  kFactor: 20,              // 82-game season, high volume
  movMultiplier: 1.5,       // start with universal default
  qualityBlend: 0.20,       // net rating blend — TBD
  playoffKMult: 1.5,
  meanReversion: 0.25,

  homeAdvantage: 80,        // NBA home advantage is meaningful
  homeIsAlwaysAdvantage: true,

  restFactor: 2.0,          // back-to-backs are significant
  normalRestDays: 2,        // NBA plays more frequently
  matchupVarianceFlatten: 0.05, // same playoff opponent

  formWindow: 10,
  formDecay: 'exponential',
  compMatchWeight: 1.0,
  exhibitionWeight: 0.3,    // preseason less relevant in NBA
  oppQualityExp: 1.5,
  formEloRange: 80,
};

export const NHL: SportConfig = {
  sport: 'hockey',
  league: 'NHL',

  eloDivisor: 400,
  drawProbScale: 0.23,      // OT losses create a draw-like outcome
  drawMin: 0.08,
  drawMax: 0.28,

  kFactor: 20,
  movMultiplier: 1.5,
  qualityBlend: 0.20,       // Corsi/xG blend — TBD
  playoffKMult: 1.5,
  meanReversion: 0.30,

  homeAdvantage: 60,
  homeIsAlwaysAdvantage: true,

  restFactor: 2.0,
  normalRestDays: 2,
  matchupVarianceFlatten: 0.10,

  formWindow: 10,
  formDecay: 'exponential',
  compMatchWeight: 1.0,
  exhibitionWeight: 0.4,
  oppQualityExp: 1.5,
  formEloRange: 100,
};

export const SPORT_CONFIGS: Record<string, SportConfig> = {
  worldCup: SOCCER_WORLD_CUP,
  soccerClub: SOCCER_CLUB,
  nfl: NFL,
  nba: NBA,
  nhl: NHL,
};