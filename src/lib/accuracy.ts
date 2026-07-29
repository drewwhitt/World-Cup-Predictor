import { GROUP_MATCHES, DEFAULT_SETTINGS } from "../data/index.js";
import { buildInitialElos, computeElosFromResults } from "./simulate.js";
import { matchOutcomeProbabilities, toAdvancementProbabilities, updateElo } from "./elo.js";
import { KNOCKOUT_STRUCTURE, resolveKnockoutMatch } from "./bracketTree.js";
import { TEAM_BY_CODE } from "./teams.js";
import type { StoredResults, TeamCode } from "./types";

export interface AccuracyResult {
  group: {
    matchesScored: number;
    brierScore: number | null;
    decisive: { count: number; brierScore: number | null };
    draws: { count: number; brierScore: number | null; observedRate: number | null };
  };
  knockout: {
    matchesScored: number;
    correct: number;
    upsets: number;
    accuracyPct: number | null;
    brierScore: number | null;
    upsetExamples: Array<{ winner: string; loser: string; winnerPct: number; round: string }>;
  };
}

const RANDOM_BASELINE_BRIER = 0.2222; // uniform 1/3-1/3-1/3 guess, 3-way scale — valid for any group-stage comparison
const COIN_FLIP_BRIER = 0.1667; // 3-way-scaled coin flip, but ONLY valid when compared against decisive (non-draw) results specifically — see note below
const BINARY_COIN_FLIP_BRIER = 0.25; // p=0.5 on a genuine binary (win/lose) outcome — the correct comparison for knockout matches, which have no draw option
const BACKTESTED_BRIER = 0.1877; // v9, validated across 2010/2014/2018/2022 — see MODEL_HISTORY.md
const HISTORICAL_DRAW_RATE = 0.25; // roughly typical for World Cup group-stage matches historically

export { RANDOM_BASELINE_BRIER, COIN_FLIP_BRIER, BINARY_COIN_FLIP_BRIER, BACKTESTED_BRIER, HISTORICAL_DRAW_RATE };

/**
 * Group-stage Brier score using the same 3-way formula documented in
 * MODEL_HISTORY.md (sum of squared errors across all 3 outcomes, DIVIDED
 * BY 3) — this /3 step was missing in an earlier version of this file,
 * which made every group-stage number here read ~3x worse than it really
 * was relative to the 0.1877 backtest baseline and the 0.2222/0.1667
 * reference constants (both of which were already on the correct /3
 * scale). Walks matches in chronological order, scoring each one on the
 * Elo ratings as they stood BEFORE that match (not after), same as the
 * live model actually predicts.
 *
 * Also splits the score into decisive-result matches vs draws. A single
 * aggregate number can hide a lot — the model can be scoring fine on
 * decisive results while badly under-predicting draws (or vice versa),
 * and that's a much more useful, honest thing to show than one number.
 */
function scoreGroupStage(stored: StoredResults): AccuracyResult["group"] {
  const elos = buildInitialElos();
  const played = [...GROUP_MATCHES]
    .filter((m) => stored.matches[m.id])
    .sort((a, b) => a.date.localeCompare(b.date) || a.matchday - b.matchday);

  let totalBrier = 0;
  let count = 0;
  let decisiveBrier = 0;
  let decisiveCount = 0;
  let drawBrier = 0;
  let drawCount = 0;

  for (const match of played) {
    const result = stored.matches[match.id];
    const ha = match.isHostMatch ? DEFAULT_SETTINGS.homeAdvantage : 0;

    const { homeWin, draw, awayWin } = matchOutcomeProbabilities(elos[match.home], elos[match.away], ha);
    const actual = result.homeGoals > result.awayGoals ? "home" : result.homeGoals < result.awayGoals ? "away" : "draw";
    const outcome = { home: actual === "home" ? 1 : 0, draw: actual === "draw" ? 1 : 0, away: actual === "away" ? 1 : 0 };
    const brier = ((homeWin - outcome.home) ** 2 + (draw - outcome.draw) ** 2 + (awayWin - outcome.away) ** 2) / 3;
    totalBrier += brier;
    count += 1;

    if (actual === "draw") {
      drawBrier += brier;
      drawCount += 1;
    } else {
      decisiveBrier += brier;
      decisiveCount += 1;
    }

    const updated = updateElo(elos[match.home], elos[match.away], result.homeGoals, result.awayGoals, DEFAULT_SETTINGS.kFactor, ha);
    elos[match.home] = updated.home;
    elos[match.away] = updated.away;
  }

  return {
    matchesScored: count,
    brierScore: count > 0 ? Number((totalBrier / count).toFixed(4)) : null,
    decisive: {
      count: decisiveCount,
      brierScore: decisiveCount > 0 ? Number((decisiveBrier / decisiveCount).toFixed(4)) : null,
    },
    draws: {
      count: drawCount,
      brierScore: drawCount > 0 ? Number((drawBrier / drawCount).toFixed(4)) : null,
      observedRate: count > 0 ? Number((drawCount / count).toFixed(3)) : null,
    },
  };
}

/**
 * Knockout-stage accuracy — same logic as UpsetFeed.tsx (correct vs
 * upset, using each match's pre-match advancement probability), plus a
 * binary Brier score for the same matches.
 */
function scoreKnockoutStage(stored: StoredResults): AccuracyResult["knockout"] {
  const playedGroupMatches = GROUP_MATCHES.map((m) => {
    const r = stored.matches[m.id];
    return r ? { ...m, played: true, homeGoals: r.homeGoals, awayGoals: r.awayGoals } : m;
  });
  const elos = computeElosFromResults(playedGroupMatches, DEFAULT_SETTINGS);

  let correct = 0;
  let upsets = 0;
  let totalBrier = 0;
  let count = 0;
  const upsetExamples: AccuracyResult["knockout"]["upsetExamples"] = [];

  for (const id of Object.keys(KNOCKOUT_STRUCTURE)) {
    const result = stored.knockoutMatches?.[id];
    if (!result) continue;
    const { home, away, round } = resolveKnockoutMatch(id, stored);
    if (!home || !away || !round) continue;

    const { home: homeWinPct } = toAdvancementProbabilities(elos[home] ?? 1500, elos[away] ?? 1500, 0);
    const homeWon = result.homeGoals > result.awayGoals || result.penaltyWinner === "home";
    const winner: TeamCode = homeWon ? home : away;
    const loser: TeamCode = homeWon ? away : home;
    const winnerPct = homeWon ? homeWinPct : 1 - homeWinPct;
    const isUpset = winnerPct < 0.5;

    if (isUpset) {
      upsets += 1;
      upsetExamples.push({
        winner: TEAM_BY_CODE[winner]?.name ?? winner,
        loser: TEAM_BY_CODE[loser]?.name ?? loser,
        winnerPct: Math.round(winnerPct * 100),
        round,
      });
    } else {
      correct += 1;
    }

    const outcome = homeWon ? 1 : 0;
    totalBrier += (homeWinPct - outcome) ** 2;
    count += 1;
  }

  return {
    matchesScored: count,
    correct,
    upsets,
    accuracyPct: count > 0 ? Number(((correct / count) * 100).toFixed(1)) : null,
    brierScore: count > 0 ? Number((totalBrier / count).toFixed(4)) : null,
    upsetExamples: upsetExamples.sort((a, b) => a.winnerPct - b.winnerPct).slice(0, 5),
  };
}

export interface GroupMatchLogEntry {
  id: string;
  group: string;
  homeCode: TeamCode;
  awayCode: TeamCode;
  homeName: string;
  awayName: string;
  homeWinPct: number; // 0-100, predicted BEFORE this match
  drawPct: number;
  awayWinPct: number;
  homeGoals: number;
  awayGoals: number;
  actual: "home" | "draw" | "away";
  brierScore: number;
  matchday: number;
  homeEloDelta: number;
  awayEloDelta: number;
  homeEloAfter: number;
  awayEloAfter: number;
}

/**
 * Every played group-stage match with its predicted probabilities (as of
 * right before that match, not after) alongside the real result — the
 * full detail behind the aggregate Brier numbers above. Walks matches in
 * the same chronological order as scoreGroupStage so the Elo used for
 * each match's prediction matches what scoreGroupStage actually scored.
 */
export function getGroupStageMatchLog(stored: StoredResults): GroupMatchLogEntry[] {
  const elos = buildInitialElos();
  const played = [...GROUP_MATCHES]
    .filter((m) => stored.matches[m.id])
    .sort((a, b) => a.date.localeCompare(b.date) || a.matchday - b.matchday);

  const log: GroupMatchLogEntry[] = [];

  for (const match of played) {
    const result = stored.matches[match.id];
    const ha = match.isHostMatch ? DEFAULT_SETTINGS.homeAdvantage : 0;
    const { homeWin, draw, awayWin } = matchOutcomeProbabilities(elos[match.home], elos[match.away], ha);
    const actual = result.homeGoals > result.awayGoals ? "home" : result.homeGoals < result.awayGoals ? "away" : "draw";
    const outcome = { home: actual === "home" ? 1 : 0, draw: actual === "draw" ? 1 : 0, away: actual === "away" ? 1 : 0 };
    const brier = ((homeWin - outcome.home) ** 2 + (draw - outcome.draw) ** 2 + (awayWin - outcome.away) ** 2) / 3;

    const beforeHomeElo = elos[match.home];
    const beforeAwayElo = elos[match.away];
    const updated = updateElo(elos[match.home], elos[match.away], result.homeGoals, result.awayGoals, DEFAULT_SETTINGS.kFactor, ha);
    elos[match.home] = updated.home;
    elos[match.away] = updated.away;

    log.push({
      id: match.id,
      group: TEAM_BY_CODE[match.home]?.group ?? "?",
      homeCode: match.home,
      awayCode: match.away,
      homeName: TEAM_BY_CODE[match.home]?.name ?? match.home,
      awayName: TEAM_BY_CODE[match.away]?.name ?? match.away,
      homeWinPct: Math.round(homeWin * 100),
      drawPct: Math.round(draw * 100),
      awayWinPct: Math.round(awayWin * 100),
      homeGoals: result.homeGoals,
      awayGoals: result.awayGoals,
      actual,
      brierScore: Number(brier.toFixed(4)),
      matchday: match.matchday,
      homeEloDelta: Math.round(updated.home - beforeHomeElo),
      awayEloDelta: Math.round(updated.away - beforeAwayElo),
      homeEloAfter: Math.round(updated.home),
      awayEloAfter: Math.round(updated.away),
    });
  }

  return log;
}

export interface KnockoutMatchLogEntry {
  id: string;
  round: string;
  homeCode: TeamCode;
  awayCode: TeamCode;
  homeName: string;
  awayName: string;
  homeAdvancePct: number; // 0-100, predicted BEFORE this match
  awayAdvancePct: number;
  homeGoals: number;
  awayGoals: number;
  penaltyWinner: "home" | "away" | null;
  winnerCode: TeamCode;
  isUpset: boolean;
  homeElo: number;
  awayElo: number;
}

/**
 * Every played knockout match with its predicted advancement probability
 * (as of right before that match) alongside the real result — the
 * knockout-stage counterpart to getGroupStageMatchLog. Walks matches in
 * bracket order (Round of 32 -> Final) using resolveKnockoutMatch, same
 * as scoreKnockoutStage, so results stay consistent with the aggregate
 * accuracy numbers shown elsewhere.
 */
export function getKnockoutMatchLog(stored: StoredResults): KnockoutMatchLogEntry[] {
  const playedGroupMatches = GROUP_MATCHES.map((m) => {
    const r = stored.matches[m.id];
    return r ? { ...m, played: true, homeGoals: r.homeGoals, awayGoals: r.awayGoals } : m;
  });
  const elos = computeElosFromResults(playedGroupMatches, DEFAULT_SETTINGS);

  const ROUND_ORDER = ["Round of 32", "Round of 16", "Quarterfinal", "Semifinal", "Final"];
  const entries: Array<{ id: string; round: string }> = Object.entries(KNOCKOUT_STRUCTURE)
    .map(([id, def]) => ({ id, round: def.round }))
    .filter(({ id }) => stored.knockoutMatches?.[id])
    .sort((a, b) => ROUND_ORDER.indexOf(a.round) - ROUND_ORDER.indexOf(b.round));

  const log: KnockoutMatchLogEntry[] = [];

  for (const { id, round } of entries) {
    const result = stored.knockoutMatches![id];
    const { home, away } = resolveKnockoutMatch(id, stored);
    if (!home || !away) continue;

    const { home: homeAdvance } = toAdvancementProbabilities(elos[home] ?? 1500, elos[away] ?? 1500, 0);
    const homeWon = result.homeGoals > result.awayGoals || result.penaltyWinner === "home";
    const winnerCode: TeamCode = homeWon ? home : away;
    const winnerPct = homeWon ? homeAdvance : 1 - homeAdvance;

    log.push({
      id,
      round,
      homeCode: home,
      awayCode: away,
      homeName: TEAM_BY_CODE[home]?.name ?? home,
      awayName: TEAM_BY_CODE[away]?.name ?? away,
      homeAdvancePct: Math.round(homeAdvance * 100),
      awayAdvancePct: Math.round((1 - homeAdvance) * 100),
      homeGoals: result.homeGoals,
      awayGoals: result.awayGoals,
      penaltyWinner: result.penaltyWinner ?? null,
      winnerCode,
      isUpset: winnerPct < 0.5,
      homeElo: Math.round(elos[home] ?? 1500),
      awayElo: Math.round(elos[away] ?? 1500),
    });

    const updated = updateElo(elos[home], elos[away], result.homeGoals, result.awayGoals, DEFAULT_SETTINGS.kFactor, 0);
    elos[home] = updated.home;
    elos[away] = updated.away;
  }

  return log;
}

export interface UpsetEntry {
  winnerCode: TeamCode;
  loserCode: TeamCode;
  winner: string;
  loser: string;
  winnerPct: number; // pre-match win probability for the actual winner, 0-100
  stage: "Group Stage" | string; // "Group Stage" or a knockout round label
  score: string;
}

/**
 * The biggest upsets across the WHOLE tournament — group stage and
 * knockouts together, ranked by how surprising the result was (lowest
 * pre-match win probability for the actual winner). Unlike
 * scoreKnockoutStage's upsetExamples (knockout-only, capped at 5, built
 * for a compact accuracy-page callout), this is meant to be the complete
 * list for a dedicated "biggest upsets" page — group-stage blowout
 * upsets (a big underdog winning outright, not just drawing) count too,
 * which the knockout-only list never captured.
 */
export function getBiggestUpsets(stored: StoredResults, limit = 15): UpsetEntry[] {
  const upsets: UpsetEntry[] = [];
  const elos = buildInitialElos();

  const playedGroup = [...GROUP_MATCHES]
    .filter((m) => stored.matches[m.id])
    .sort((a, b) => a.date.localeCompare(b.date) || a.matchday - b.matchday);

  for (const match of playedGroup) {
    const result = stored.matches[match.id];
    const ha = match.isHostMatch ? DEFAULT_SETTINGS.homeAdvantage : 0;
    const { homeWin, awayWin } = matchOutcomeProbabilities(elos[match.home], elos[match.away], ha);

    if (result.homeGoals !== result.awayGoals) {
      const homeWon = result.homeGoals > result.awayGoals;
      const winnerCode = homeWon ? match.home : match.away;
      const loserCode = homeWon ? match.away : match.home;
      const winnerPct = homeWon ? homeWin : awayWin;
      if (winnerPct < 0.5) {
        upsets.push({
          winnerCode,
          loserCode,
          winner: TEAM_BY_CODE[winnerCode]?.name ?? winnerCode,
          loser: TEAM_BY_CODE[loserCode]?.name ?? loserCode,
          winnerPct: Math.round(winnerPct * 100),
          stage: "Group Stage",
          score: homeWon ? `${result.homeGoals}-${result.awayGoals}` : `${result.awayGoals}-${result.homeGoals}`,
        });
      }
    }

    const updated = updateElo(elos[match.home], elos[match.away], result.homeGoals, result.awayGoals, DEFAULT_SETTINGS.kFactor, ha);
    elos[match.home] = updated.home;
    elos[match.away] = updated.away;
  }

  const ROUND_ORDER = ["Round of 32", "Round of 16", "Quarterfinal", "Semifinal", "Final"];
  const knockoutEntries: Array<{ id: string; round: string }> = Object.entries(KNOCKOUT_STRUCTURE)
    .map(([id, def]) => ({ id, round: def.round }))
    .filter(({ id }) => stored.knockoutMatches?.[id])
    .sort((a, b) => ROUND_ORDER.indexOf(a.round) - ROUND_ORDER.indexOf(b.round));

  for (const { id, round } of knockoutEntries) {
    const result = stored.knockoutMatches![id];
    const { home, away } = resolveKnockoutMatch(id, stored);
    if (!home || !away) continue;

    const { home: homeAdvance } = toAdvancementProbabilities(elos[home] ?? 1500, elos[away] ?? 1500, 0);
    const homeWon = result.homeGoals > result.awayGoals || result.penaltyWinner === "home";
    const winnerCode: TeamCode = homeWon ? home : away;
    const loserCode: TeamCode = homeWon ? away : home;
    const winnerPct = homeWon ? homeAdvance : 1 - homeAdvance;

    if (winnerPct < 0.5) {
      const scoreStr = result.penaltyWinner
        ? `${result.homeGoals}-${result.awayGoals} (pens: ${result.penaltyWinner === "home" ? home : away})`
        : homeWon
        ? `${result.homeGoals}-${result.awayGoals}`
        : `${result.awayGoals}-${result.homeGoals}`;
      upsets.push({
        winnerCode,
        loserCode,
        winner: TEAM_BY_CODE[winnerCode]?.name ?? winnerCode,
        loser: TEAM_BY_CODE[loserCode]?.name ?? loserCode,
        winnerPct: Math.round(winnerPct * 100),
        stage: round,
        score: scoreStr,
      });
    }

    const updated = updateElo(elos[home], elos[away], result.homeGoals, result.awayGoals, DEFAULT_SETTINGS.kFactor, 0);
    elos[home] = updated.home;
    elos[away] = updated.away;
  }

  return upsets.sort((a, b) => a.winnerPct - b.winnerPct).slice(0, limit);
}

export function computeAccuracy(stored: StoredResults): AccuracyResult {
  return {
    group: scoreGroupStage(stored),
    knockout: scoreKnockoutStage(stored),
  };
}