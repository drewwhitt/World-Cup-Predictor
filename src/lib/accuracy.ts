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

const RANDOM_BASELINE_BRIER = 0.2222;
const COIN_FLIP_BRIER = 0.1667;
const BACKTESTED_BRIER = 0.1877; // v9, validated across 2010/2014/2018/2022 — see MODEL_HISTORY.md

export { RANDOM_BASELINE_BRIER, COIN_FLIP_BRIER, BACKTESTED_BRIER };

/**
 * Group-stage Brier score using the same 3-way formula documented in
 * MODEL_HISTORY.md, so this is directly comparable to the 0.1877
 * historical backtest figure — walks matches in chronological order,
 * scoring each one on the Elo ratings as they stood BEFORE that match
 * (not after), same as the live model actually predicts.
 */
function scoreGroupStage(stored: StoredResults): { matchesScored: number; brierScore: number | null } {
  const elos = buildInitialElos();
  const played = [...GROUP_MATCHES]
    .filter((m) => stored.matches[m.id])
    .sort((a, b) => a.date.localeCompare(b.date) || a.matchday - b.matchday);

  let totalBrier = 0;
  let count = 0;

  for (const match of played) {
    const result = stored.matches[match.id];
    const ha = match.isHostMatch ? DEFAULT_SETTINGS.homeAdvantage : 0;

    const { homeWin, draw, awayWin } = matchOutcomeProbabilities(elos[match.home], elos[match.away], ha);
    const actual = result.homeGoals > result.awayGoals ? "home" : result.homeGoals < result.awayGoals ? "away" : "draw";
    const outcome = { home: actual === "home" ? 1 : 0, draw: actual === "draw" ? 1 : 0, away: actual === "away" ? 1 : 0 };
    const brier = (homeWin - outcome.home) ** 2 + (draw - outcome.draw) ** 2 + (awayWin - outcome.away) ** 2;
    totalBrier += brier;
    count += 1;

    const updated = updateElo(elos[match.home], elos[match.away], result.homeGoals, result.awayGoals, DEFAULT_SETTINGS.kFactor, ha);
    elos[match.home] = updated.home;
    elos[match.away] = updated.away;
  }

  return { matchesScored: count, brierScore: count > 0 ? Number((totalBrier / count).toFixed(4)) : null };
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

export function computeAccuracy(stored: StoredResults): AccuracyResult {
  return {
    group: scoreGroupStage(stored),
    knockout: scoreKnockoutStage(stored),
  };
}