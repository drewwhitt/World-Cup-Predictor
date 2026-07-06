import { GROUP_MATCHES, DEFAULT_SETTINGS } from "../data";
import { buildInitialElos, computeElosFromResults } from "./simulate";
import { matchOutcomeProbabilities, toAdvancementProbabilities, updateElo } from "./elo";
import { KNOCKOUT_STRUCTURE, resolveKnockoutMatch } from "./bracketTree";
import { TEAM_BY_CODE } from "./teams";
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

    log.push({
      id: match.id,
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
    });

    const updated = updateElo(elos[match.home], elos[match.away], result.homeGoals, result.awayGoals, DEFAULT_SETTINGS.kFactor, ha);
    elos[match.home] = updated.home;
    elos[match.away] = updated.away;
  }

  return log;
}

export function computeAccuracy(stored: StoredResults): AccuracyResult {
  return {
    group: scoreGroupStage(stored),
    knockout: scoreKnockoutStage(stored),
  };
}