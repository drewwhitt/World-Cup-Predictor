/**
 * drivers.ts — attribution layer for probability changes
 *
 * Answers "why did this team's championship odds change?" by running
 * counterfactual simulations: what were the odds *before* the most
 * recent result, vs after? The difference is attributed to that result.
 *
 * This is the core of the "driver" concept — the thing that makes
 * Veridex feel like analysis rather than just a scoreboard.
 */
import { runSimulation, computeElosFromResults } from "./simulate";
import { GROUP_MATCHES, DEFAULT_SETTINGS, KNOCKOUT_MATCHES } from "../data";
import { toAdvancementProbabilities } from "./elo";
import { TEAM_BY_CODE } from "./teams";
import { KNOCKOUT_STRUCTURE, resolveKnockoutMatch } from "./bracketTree";
import type { StoredResults, TeamCode } from "./types";

function pct(v: number) { return Number((v * 100).toFixed(1)); }

export interface TeamDriver {
  code: TeamCode;
  name: string;
  currentPct: number;
  previousPct: number;   // before the most recent result
  delta: number;         // currentPct - previousPct
  primaryDriver: string; // human-readable explanation
  driverType: "result" | "path" | "neutral";
}

export interface UpcomingMatchOdds {
  homeCode: TeamCode;
  awayCode: TeamCode;
  homeName: string;
  awayName: string;
  homeAdvance: number;  // advancement probability 0-1
  awayAdvance: number;
  upsetRisk: number;    // how close to 50/50 (higher = more uncertain)
  label: string;
}

/**
 * Find the most recently entered result across group + knockout matches.
 * Returns { matchId, isKnockout } or null if no results yet.
 */
function getMostRecentResult(stored: StoredResults): {
  matchId: string;
  isKnockout: boolean;
} | null {
  // Knockout results take priority — they're always more recent than group
  const koIds = Object.keys(stored.knockoutMatches ?? {}).filter((id) => id in KNOCKOUT_STRUCTURE);
  if (koIds.length > 0) {
    // The last entered knockout match (highest ID number = most recent)
    const sorted = koIds.sort((a, b) => {
      const na = parseInt(a.replace("ko-", ""));
      const nb = parseInt(b.replace("ko-", ""));
      return nb - na;
    });
    return { matchId: sorted[0], isKnockout: true };
  }

  const groupIds = Object.keys(stored.matches);
  if (groupIds.length === 0) return null;

  // Group matches sorted by date — find the latest played one
  const playedMatches = GROUP_MATCHES.filter((m) => stored.matches[m.id])
    .sort((a, b) => b.date.localeCompare(a.date) || b.matchday - a.matchday);

  return playedMatches.length > 0
    ? { matchId: playedMatches[0].id, isKnockout: false }
    : null;
}

/**
 * Build previous state by removing the most recent result.
 */
function buildPreviousState(stored: StoredResults): StoredResults {
  const recent = getMostRecentResult(stored);
  if (!recent) return stored;

  if (recent.isKnockout) {
    const prevKO = { ...(stored.knockoutMatches ?? {}) };
    delete prevKO[recent.matchId];
    return { ...stored, knockoutMatches: prevKO };
  } else {
    const prevMatches = { ...stored.matches };
    delete prevMatches[recent.matchId];
    return { ...stored, matches: prevMatches };
  }
}

/**
 * Compute championship probability for every team given a StoredResults state.
 */
function computeChampionPcts(stored: StoredResults): Map<TeamCode, number> {
  const playedMatches = GROUP_MATCHES.map((m) => {
    const r = stored.matches[m.id];
    return r ? { ...m, played: true, homeGoals: r.homeGoals, awayGoals: r.awayGoals } : m;
  });
  const result = runSimulation(playedMatches, KNOCKOUT_MATCHES, DEFAULT_SETTINGS, 42, stored.knockoutMatches);
  return new Map(result.probabilities.map((r) => [r.code as TeamCode, pct(r.champion)]));
}

/**
 * Get the most recent result's match details for driver text.
 */
function getRecentMatchContext(stored: StoredResults): {
  homeCode: TeamCode;
  awayCode: TeamCode;
  winner: TeamCode | null;
  loser: TeamCode | null;
  wasKnockout: boolean;
} | null {
  const recent = getMostRecentResult(stored);
  if (!recent) return null;

  if (recent.isKnockout) {
    const { home, away } = resolveKnockoutMatch(recent.matchId, stored);
    if (!home || !away) return null;
    const result = stored.knockoutMatches![recent.matchId];
    let winner: TeamCode | null = null;
    let loser: TeamCode | null = null;
    if (result.homeGoals > result.awayGoals || result.penaltyWinner === "home") {
      winner = home; loser = away;
    } else if (result.awayGoals > result.homeGoals || result.penaltyWinner === "away") {
      winner = away; loser = home;
    }
    return { homeCode: home, awayCode: away, winner, loser, wasKnockout: true };
  }

  const match = GROUP_MATCHES.find((m) => m.id === recent.matchId);
  if (!match) return null;
  const result = stored.matches[recent.matchId];
  let winner: TeamCode | null = null;
  let loser: TeamCode | null = null;
  if (result.homeGoals > result.awayGoals) { winner = match.home; loser = match.away; }
  else if (result.awayGoals > result.homeGoals) { winner = match.away; loser = match.home; }
  return { homeCode: match.home, awayCode: match.away, winner, loser, wasKnockout: false };
}

/**
 * Generate a human-readable driver explanation for a team's probability change.
 */
function buildDriverText(
  code: TeamCode,
  delta: number,
  context: ReturnType<typeof getRecentMatchContext>,
): { text: string; type: "result" | "path" | "neutral" } {
  // "Not significant" specifically means the number itself barely moved —
  // anything at or above 0.1pp is treated as a real change and must never
  // be labeled "no change," even if we can't pin it to one specific match.
  if (Math.abs(delta) < 0.1) {
    return { text: "No significant change from latest result", type: "neutral" };
  }

  if (!context) {
    // The odds genuinely moved, just not attributable to one specific
    // match context (e.g. a bracket-wide ripple effect from a result
    // elsewhere) — say so honestly instead of defaulting to "no change,"
    // which would directly contradict the nonzero delta shown alongside it.
    return {
      text: delta > 0
        ? "Odds improved based on other recent tournament results"
        : "Odds declined based on other recent tournament results",
      type: "path",
    };
  }

  const teamName = TEAM_BY_CODE[code]?.name ?? code;
  const { winner, loser, wasKnockout } = context;

  // Direct result driver — team played and won or lost
  if (winner === code) {
    return {
      text: wasKnockout
        ? `Advanced to next round, Elo rating updated upward — path to title now clearer`
        : `Won latest group match, Elo rating updated upward`,
      type: "result",
    };
  }
  if (loser === code) {
    return {
      text: wasKnockout
        ? `Eliminated from the tournament`
        : `Lost latest group match, Elo rating updated downward`,
      type: "result",
    };
  }

  // Path driver — a rival was eliminated or a strong team won
  if (delta > 0.5 && loser) {
    const loserName = TEAM_BY_CODE[loser]?.name ?? loser;
    return {
      text: `${loserName} eliminated — ${teamName}'s projected path to the final became easier`,
      type: "path",
    };
  }
  if (delta < -0.5 && winner) {
    const winnerName = TEAM_BY_CODE[winner]?.name ?? winner;
    return {
      text: `${winnerName} advanced — a tougher potential opponent remains in the draw`,
      type: "path",
    };
  }

  return {
    text: delta > 0
      ? "Benefited from latest bracket result"
      : "Slightly impacted by latest bracket result",
    type: "path",
  };
}

/**
 * Main export: compute drivers for all teams, sorted by absolute delta.
 */
export function computeDrivers(stored: StoredResults): TeamDriver[] {
  const current = computeChampionPcts(stored);
  const previous = computeChampionPcts(buildPreviousState(stored));
  const context = getRecentMatchContext(stored);

  const drivers: TeamDriver[] = [];
  for (const [code, currentPct] of current) {
    const previousPct = previous.get(code) ?? currentPct;
    const delta = Number((currentPct - previousPct).toFixed(1));
    const { text, type } = buildDriverText(code, delta, context);
    drivers.push({
      code,
      name: TEAM_BY_CODE[code]?.name ?? code,
      currentPct,
      previousPct,
      delta,
      primaryDriver: text,
      driverType: type,
    });
  }

  return drivers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/**
 * Get upcoming unplayed knockout matches with advancement probabilities.
 * Used by Morning Forecast for "Most Important Match" and "Biggest Upset Risk".
 */
export function getUpcomingKnockoutOdds(stored: StoredResults): UpcomingMatchOdds[] {
  const playedMatches = GROUP_MATCHES.map((m) => {
    const r = stored.matches[m.id];
    return r ? { ...m, played: true, homeGoals: r.homeGoals, awayGoals: r.awayGoals } : m;
  });
  const elos = computeElosFromResults(playedMatches, DEFAULT_SETTINGS);

  // Every knockout match at any round whose two participants are already
  // known (via real results) but hasn't been played yet itself — not just
  // R32. Previously this stopped at R32, so an already-decided R16+
  // matchup (e.g. the winners of two confirmed R32 games) never showed up
  // here even though both teams — and the match itself — were real.
  return Object.keys(KNOCKOUT_STRUCTURE)
    .filter((id) => !stored.knockoutMatches?.[id]) // only unplayed
    .map((id) => {
      const { home, away } = resolveKnockoutMatch(id, stored);
      if (!home || !away) return null;
      const { home: h, away: a } = toAdvancementProbabilities(elos[home] ?? 1500, elos[away] ?? 1500, 0);
      const upsetRisk = 1 - Math.abs(h - a);
      return {
        homeCode: home,
        awayCode: away,
        homeName: TEAM_BY_CODE[home]?.name ?? home,
        awayName: TEAM_BY_CODE[away]?.name ?? away,
        homeAdvance: h,
        awayAdvance: a,
        upsetRisk,
        label: `${TEAM_BY_CODE[home]?.name} vs ${TEAM_BY_CODE[away]?.name}`,
      };
    })
    .filter((m): m is UpcomingMatchOdds => m !== null)
    .sort((a, b) => b.upsetRisk - a.upsetRisk); // most uncertain first
}