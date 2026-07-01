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
  const koIds = Object.keys(stored.knockoutMatches ?? {});
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
    // Find match in R32 definitions
    const R32 = [
      { id: "ko-73", home: "GER" as TeamCode, away: "PAR" as TeamCode },
      { id: "ko-74", home: "FRA" as TeamCode, away: "SWE" as TeamCode },
      { id: "ko-75", home: "RSA" as TeamCode, away: "CAN" as TeamCode },
      { id: "ko-76", home: "NED" as TeamCode, away: "MAR" as TeamCode },
      { id: "ko-77", home: "POR" as TeamCode, away: "CRO" as TeamCode },
      { id: "ko-78", home: "ESP" as TeamCode, away: "AUT" as TeamCode },
      { id: "ko-79", home: "USA" as TeamCode, away: "BIH" as TeamCode },
      { id: "ko-80", home: "BEL" as TeamCode, away: "SEN" as TeamCode },
      { id: "ko-81", home: "BRA" as TeamCode, away: "JPN" as TeamCode },
      { id: "ko-82", home: "CIV" as TeamCode, away: "NOR" as TeamCode },
      { id: "ko-83", home: "MEX" as TeamCode, away: "ECU" as TeamCode },
      { id: "ko-84", home: "ENG" as TeamCode, away: "COD" as TeamCode },
      { id: "ko-85", home: "ARG" as TeamCode, away: "CPV" as TeamCode },
      { id: "ko-86", home: "AUS" as TeamCode, away: "EGY" as TeamCode },
      { id: "ko-87", home: "SUI" as TeamCode, away: "ALG" as TeamCode },
      { id: "ko-88", home: "COL" as TeamCode, away: "GHA" as TeamCode },
    ];
    const def = R32.find((m) => m.id === recent.matchId);
    if (!def) return null;
    const result = stored.knockoutMatches![recent.matchId];
    let winner: TeamCode | null = null;
    let loser: TeamCode | null = null;
    if (result.homeGoals > result.awayGoals || result.penaltyWinner === "home") {
      winner = def.home; loser = def.away;
    } else if (result.awayGoals > result.homeGoals || result.penaltyWinner === "away") {
      winner = def.away; loser = def.home;
    }
    return { homeCode: def.home, awayCode: def.away, winner, loser, wasKnockout: true };
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
  if (!context || Math.abs(delta) < 0.1) {
    return { text: "No significant change from latest result", type: "neutral" };
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

  // All knockout matchups we know about — R32 hardcoded, R16+ TBD as we enter results
  const R32 = [
    { id: "ko-73", home: "GER" as TeamCode, away: "PAR" as TeamCode },
    { id: "ko-74", home: "FRA" as TeamCode, away: "SWE" as TeamCode },
    { id: "ko-75", home: "RSA" as TeamCode, away: "CAN" as TeamCode },
    { id: "ko-76", home: "NED" as TeamCode, away: "MAR" as TeamCode },
    { id: "ko-77", home: "POR" as TeamCode, away: "CRO" as TeamCode },
    { id: "ko-78", home: "ESP" as TeamCode, away: "AUT" as TeamCode },
    { id: "ko-79", home: "USA" as TeamCode, away: "BIH" as TeamCode },
    { id: "ko-80", home: "BEL" as TeamCode, away: "SEN" as TeamCode },
    { id: "ko-81", home: "BRA" as TeamCode, away: "JPN" as TeamCode },
    { id: "ko-82", home: "CIV" as TeamCode, away: "NOR" as TeamCode },
    { id: "ko-83", home: "MEX" as TeamCode, away: "ECU" as TeamCode },
    { id: "ko-84", home: "ENG" as TeamCode, away: "COD" as TeamCode },
    { id: "ko-85", home: "ARG" as TeamCode, away: "CPV" as TeamCode },
    { id: "ko-86", home: "AUS" as TeamCode, away: "EGY" as TeamCode },
    { id: "ko-87", home: "SUI" as TeamCode, away: "ALG" as TeamCode },
    { id: "ko-88", home: "COL" as TeamCode, away: "GHA" as TeamCode },
  ];

  return R32
    .filter((m) => !stored.knockoutMatches?.[m.id]) // only unplayed
    .map((m) => {
      const { home, away } = toAdvancementProbabilities(
        elos[m.home] ?? 1500,
        elos[m.away] ?? 1500,
        0,
      );
      // Upset risk: how close to 50/50 (max at exactly 50/50)
      const upsetRisk = 1 - Math.abs(home - away);
      return {
        homeCode: m.home,
        awayCode: m.away,
        homeName: TEAM_BY_CODE[m.home]?.name ?? m.home,
        awayName: TEAM_BY_CODE[m.away]?.name ?? m.away,
        homeAdvance: home,
        awayAdvance: away,
        upsetRisk,
        label: `${TEAM_BY_CODE[m.home]?.name} vs ${TEAM_BY_CODE[m.away]?.name}`,
      };
    })
    .sort((a, b) => b.upsetRisk - a.upsetRisk); // most uncertain first
}