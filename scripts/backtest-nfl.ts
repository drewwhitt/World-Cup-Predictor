/**
 * Backtests the NFL engine (lib/engine/sports/NFL.ts) against every real,
 * played NFL game from 1999–2025 (src/data/nfl/historical-games.json,
 * sourced from nflverse/nfldata — https://github.com/nflverse/nfldata).
 *
 * For each game, in chronological order:
 *   1. Predict pre-game win probabilities from each team's current Elo.
 *   2. Score that prediction against the real final score (Brier score).
 *   3. Update both teams' Elo from the real result.
 *   4. Apply season-start mean reversion when a new season begins.
 *
 * Also compares against the closing market moneyline (vig removed) where
 * available, since that's the sharpest real benchmark to calibrate
 * against — a well-built model won't beat the market, but knowing the
 * gap tells you how much signal is left on the table.
 *
 * Known limitation: NFL's home-field advantage is currently applied
 * unconditionally (SportConfig.homeIsAlwaysAdvantage = true), so the ~8
 * neutral-site games per season (London/Madrid/Munich/etc.) are scored
 * as if the "home" team in the schedule had a normal home-field edge.
 * Minor at this sample size, but worth fixing in the engine before
 * relying on neutral-site predictions specifically.
 *
 * Usage: npx tsx scripts/backtest-nfl.ts
 */
import historicalGames from "../src/data/nfl/historical-games.json";
import { predictNFLMatch, updateNFLElo, nflSeasonReset } from "../src/lib/engine/sports/NFL";
import { brierScore } from "../src/lib/engine/core/EloEngine";

interface HistGame {
  id: string;
  season: number;
  type: string;
  week: number;
  date: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  neutral: boolean;
  div: boolean;
  homeRest: number | null;
  awayRest: number | null;
  homeML: number | null;
  awayML: number | null;
}

const games = historicalGames as HistGame[];

function moneylineToImplied(ml: number): number {
  return ml > 0 ? 100 / (ml + 100) : -ml / (-ml + 100);
}

/** Removes the vig by normalizing both sides' implied probabilities to sum to 1. */
function marketProbs(homeML: number | null, awayML: number | null): { home: number; away: number } | null {
  if (homeML === null || awayML === null) return null;
  const h = moneylineToImplied(homeML);
  const a = moneylineToImplied(awayML);
  const total = h + a;
  return { home: h / total, away: a / total };
}

interface SeasonStats {
  season: number;
  games: number;
  modelBrierSum: number;
  modelCorrect: number;
  marketGames: number;
  marketBrierSum: number;
  marketCorrect: number;
}

function newSeasonStats(season: number): SeasonStats {
  return { season, games: 0, modelBrierSum: 0, modelCorrect: 0, marketGames: 0, marketBrierSum: 0, marketCorrect: 0 };
}

function main() {
  const sorted = [...games].sort((a, b) => a.season - b.season || a.week - b.week || a.date.localeCompare(b.date));

  const elos: Record<string, number> = {};
  const bySeason = new Map<number, SeasonStats>();
  let currentSeason: number | null = null;

  for (const game of sorted) {
    if (currentSeason !== null && game.season !== currentSeason) {
      const reverted = nflSeasonReset(elos);
      for (const code of Object.keys(reverted)) elos[code] = reverted[code];
    }
    currentSeason = game.season;

    if (!(game.home in elos)) elos[game.home] = 1500;
    if (!(game.away in elos)) elos[game.away] = 1500;

    const stats = bySeason.get(game.season) ?? newSeasonStats(game.season);
    bySeason.set(game.season, stats);

    const ctx = {
      homeRestDays: game.homeRest ?? undefined,
      awayRestDays: game.awayRest ?? undefined,
      isDivisional: game.div,
      isPlayoff: game.type !== "REG",
    };

    const probs = predictNFLMatch(elos[game.home], elos[game.away], ctx);
    const brier = brierScore(probs, game.homeScore, game.awayScore);
    const actualHomeWin = game.homeScore > game.awayScore;
    const modelPickedHome = probs.homeWin >= probs.awayWin;

    stats.games += 1;
    stats.modelBrierSum += brier;
    if (game.homeScore !== game.awayScore && modelPickedHome === actualHomeWin) stats.modelCorrect += 1;

    const market = marketProbs(game.homeML, game.awayML);
    if (market) {
      const marketBrier = brierScore({ homeWin: market.home, draw: 0, awayWin: market.away }, game.homeScore, game.awayScore);
      const marketPickedHome = market.home >= market.away;
      stats.marketGames += 1;
      stats.marketBrierSum += marketBrier;
      if (game.homeScore !== game.awayScore && marketPickedHome === actualHomeWin) stats.marketCorrect += 1;
    }

    const updated = updateNFLElo(elos[game.home], elos[game.away], game.homeScore, game.awayScore, ctx);
    elos[game.home] = updated.home;
    elos[game.away] = updated.away;
  }

  const seasons = [...bySeason.values()].sort((a, b) => a.season - b.season);

  console.log("season  games  model_brier  model_acc  market_brier  market_acc  market_games");
  let totalGames = 0, totalModelBrier = 0, totalModelCorrect = 0;
  let totalMarketGames = 0, totalMarketBrier = 0, totalMarketCorrect = 0;

  for (const s of seasons) {
    const modelBrier = s.modelBrierSum / s.games;
    const modelAcc = (s.modelCorrect / s.games) * 100;
    const marketBrier = s.marketGames > 0 ? s.marketBrierSum / s.marketGames : null;
    const marketAcc = s.marketGames > 0 ? (s.marketCorrect / s.marketGames) * 100 : null;

    console.log(
      `${s.season}   ${String(s.games).padStart(3)}    ${modelBrier.toFixed(4)}       ${modelAcc.toFixed(1)}%     ` +
      (marketBrier !== null ? `${marketBrier.toFixed(4)}        ${marketAcc!.toFixed(1)}%       ${s.marketGames}` : "  n/a           n/a          0"),
    );

    totalGames += s.games;
    totalModelBrier += s.modelBrierSum;
    totalModelCorrect += s.modelCorrect;
    totalMarketGames += s.marketGames;
    totalMarketBrier += s.marketBrierSum;
    totalMarketCorrect += s.marketCorrect;
  }

  console.log("\n── Overall (1999–2025) ──");
  console.log(`Games:           ${totalGames}`);
  console.log(`Model Brier:     ${(totalModelBrier / totalGames).toFixed(4)}  (lower is better; 0.222 = random 3-class guess)`);
  console.log(`Model accuracy:  ${((totalModelCorrect / totalGames) * 100).toFixed(1)}%`);
  if (totalMarketGames > 0) {
    console.log(`Market Brier:    ${(totalMarketBrier / totalMarketGames).toFixed(4)}  (${totalMarketGames} games with odds)`);
    console.log(`Market accuracy: ${((totalMarketCorrect / totalMarketGames) * 100).toFixed(1)}%`);
  }
}

main();