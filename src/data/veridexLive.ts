import baselineData from "./baseline.json";
import { DEFAULT_SETTINGS, GROUP_MATCHES, KNOCKOUT_MATCHES } from ".";
import { computeElosIncludingKnockouts, runSimulation } from "../lib/simulate";
import { TEAM_BY_CODE } from "../lib/teams";
import { computeDrivers, getUpcomingKnockoutOdds } from "../lib/drivers";
import { getTeamKnockoutStatus, resolveKnockoutMatch, KNOCKOUT_STRUCTURE } from "../lib/bracketTree";
import { toAdvancementProbabilities } from "../lib/elo";
import type { KnockoutMatchupProbability, StoredResults, TeamCode, TeamProbabilities } from "../lib/types";
import type { Headline, MorningForecast, Team } from "./worldCup";

type BaselineRow = TeamProbabilities;

const baselineRows = baselineData.probabilities as BaselineRow[];

function pct(probability: number): number {
  return Number((probability * 100).toFixed(1));
}

function formForTeam(code: TeamCode, stored: StoredResults): string {
  const played = GROUP_MATCHES
    .filter((match) => stored.matches[match.id] && (match.home === code || match.away === code))
    .sort((a, b) => b.date.localeCompare(a.date) || b.matchday - a.matchday)
    .slice(0, 5)
    .map((match) => {
      const result = stored.matches[match.id];
      const goalsFor = match.home === code ? result.homeGoals : result.awayGoals;
      const goalsAgainst = match.home === code ? result.awayGoals : result.homeGoals;
      if (goalsFor > goalsAgainst) return "W";
      if (goalsFor < goalsAgainst) return "L";
      return "D";
    });
  return [...played, "D", "D", "D", "D", "D"].slice(0, 5).join("");
}

function ratingFromElo(elo: number): number {
  return Number(Math.max(70, Math.min(94, (elo - 1350) / 10)).toFixed(1));
}

/**
 * Per-bracket-slot projections straight from the same 10,000-sim Monte
 * Carlo run that powers the championship odds elsewhere in the app (Home,
 * Forecasts). For each remaining knockout slot, this reports the pairing
 * that occurred there most often across all simulations, and — critically
 * — which of those two teams won *when that specific pairing happened*
 * (not either team's overall title odds).
 *
 * This is what BracketView should use to project future rounds, instead
 * of a raw pairwise Elo comparison. A raw two-team Elo check ignores how
 * a team actually got there across the branching bracket, which is why
 * the old bracket logic could show a different projected champion than
 * the Home/Forecasts tabs — this pulls from the exact same simulation.
 *
 * NOTE: this re-runs the same 10,000 simulations buildLiveTeams() already
 * runs (same fixed seed, so results are always identical, not just
 * similar). If both are called on the same page render, that's the full
 * Monte Carlo run happening twice — fine for now, but worth caching or
 * merging into a single call if it ever becomes a perf issue.
 */
export function buildLiveKnockoutMatchups(stored: StoredResults): KnockoutMatchupProbability[] {
  const playedMatches = GROUP_MATCHES.map((match) => {
    const result = stored.matches[match.id];
    return result
      ? { ...match, played: true, homeGoals: result.homeGoals, awayGoals: result.awayGoals }
      : match;
  });
  const current = runSimulation(playedMatches, KNOCKOUT_MATCHES, DEFAULT_SETTINGS, 42, stored.knockoutMatches);
  return current.knockoutMatchups;
}

/**
 * Elimination-risk fields for a single team — who they play next in the
 * real knockout bracket (not what-if), and their probability of advancing,
 * but ONLY when that match is fully resolved (both sides known from real
 * results). If the opponent slot isn't decided yet, this deliberately
 * returns nulls rather than guessing at a "most likely" opponent — that
 * kind of probabilistic opponent projection already lives in ForecastsView
 * and re-implementing a simplified version of it here would risk drifting
 * out of sync with it (see Known Bug Class #1 re: bracket logic living in
 * more than one place).
 */
function buildEliminationRisk(
  code: TeamCode,
  stored: StoredResults,
  elos: Record<TeamCode, number>,
): Pick<Team, "eliminated" | "isChampion" | "nextOpponentCode" | "nextOpponentName" | "advancingProb"> {
  const status = getTeamKnockoutStatus(code, stored);

  if (!status.isRealParticipant || status.eliminated) {
    return { eliminated: true, isChampion: false, nextOpponentCode: null, nextOpponentName: null, advancingProb: null };
  }
  if (status.isChampion) {
    return { eliminated: false, isChampion: true, nextOpponentCode: null, nextOpponentName: null, advancingProb: null };
  }
  if (!status.currentMatchId) {
    return { eliminated: false, isChampion: false, nextOpponentCode: null, nextOpponentName: null, advancingProb: null };
  }

  const { home, away } = resolveKnockoutMatch(status.currentMatchId, stored);
  const opponent = home === code ? away : away === code ? home : null;
  if (!opponent || !home || !away) {
    // Opponent slot not decided by a real result yet.
    return { eliminated: false, isChampion: false, nextOpponentCode: null, nextOpponentName: null, advancingProb: null };
  }

  const probs = toAdvancementProbabilities(elos[home] ?? 1500, elos[away] ?? 1500, 0);
  const advancingProb = code === home ? probs.home : probs.away;

  return {
    eliminated: false,
    isChampion: false,
    nextOpponentCode: opponent,
    nextOpponentName: TEAM_BY_CODE[opponent]?.name ?? opponent,
    advancingProb,
  };
}

export function buildLiveTeams(stored: StoredResults): Team[] {
  const playedMatches = GROUP_MATCHES.map((match) => {
    const result = stored.matches[match.id];
    return result
      ? { ...match, played: true, homeGoals: result.homeGoals, awayGoals: result.awayGoals }
      : match;
  });
  const current = runSimulation(playedMatches, KNOCKOUT_MATCHES, DEFAULT_SETTINGS, 42, stored.knockoutMatches);
  const elos = computeElosIncludingKnockouts(playedMatches, stored, DEFAULT_SETTINGS);
  const baselineByCode = new Map(baselineRows.map((row) => [row.code, row]));

  return current.probabilities.map((row) => {
    const team = TEAM_BY_CODE[row.code];
    const baseline = baselineByCode.get(row.code);
    const baseChampion = pct(baseline?.champion ?? 0);
    const currentChampion = pct(row.champion);
    const risk = buildEliminationRisk(row.code, stored, elos);

    return {
      name: row.name,
      code: row.code,
      group: `Group ${team.group}`,
      baseline: baseChampion,
      current: currentChampion,
      rating: ratingFromElo(elos[row.code]),
      formStr: formForTeam(row.code, stored),
      initialElo: team.initialElo,
      ...risk,
      trend: [
        baseChampion,
        Number((baseChampion * 0.7 + currentChampion * 0.3).toFixed(1)),
        Number((baseChampion * 0.35 + currentChampion * 0.65).toFixed(1)),
        currentChampion,
      ],
    };
  });
}


export function buildLiveMorningForecast(liveTeams: Team[], stored: StoredResults): MorningForecast {
  const rows = [...liveTeams].sort((a, b) => b.current - a.current);
  const champ = rows[0];

  // Use driver attribution for riser/faller — compares current vs pre-last-result
  const drivers = computeDrivers(stored);
  const riserDriver = drivers.find((d) => d.delta > 0);
  const fallerDriver = [...drivers].reverse().find((d) => d.delta < 0);

  // Fallback to baseline delta if no drivers yet
  const byDelta = [...liveTeams].map((t) => ({
    ...t, delta: Number((t.current - t.baseline).toFixed(1)),
  }));
  const baseRiser = [...byDelta].sort((a, b) => b.delta - a.delta)[0];
  const baseFaller = [...byDelta].sort((a, b) => a.delta - b.delta)[0];

  const riser = riserDriver ?? { name: baseRiser.name, currentPct: baseRiser.current, delta: baseRiser.delta, primaryDriver: "from pre-tournament baseline" };
  const faller = fallerDriver ?? { name: baseFaller.name, currentPct: baseFaller.current, delta: Math.abs(baseFaller.delta), primaryDriver: "from pre-tournament baseline" };

  // Live upcoming match odds — most uncertain match = most important
  const upcoming = getUpcomingKnockoutOdds(stored);
  const mostImportant = upcoming[0]; // sorted by upset risk (closest to 50/50)
  const biggestUpset = upcoming[0];  // same — highest upset risk IS the biggest upset threat

  const matchName = mostImportant
    ? mostImportant.label
    : "All matches complete";

  const matchNote = mostImportant
    ? `${Math.round(mostImportant.homeAdvance * 100)}% vs ${Math.round(mostImportant.awayAdvance * 100)}% advancement odds · ${DEFAULT_SETTINGS.simulations.toLocaleString()} simulations`
    : `${DEFAULT_SETTINGS.simulations.toLocaleString()} simulations refreshed`;

  const upsetTeam = biggestUpset
    ? (biggestUpset.homeAdvance < 0.5 ? biggestUpset.homeName : biggestUpset.awayName)
    : rows[8]?.name ?? "";
  const upsetFavName = biggestUpset
    ? (biggestUpset.homeAdvance >= 0.5 ? biggestUpset.homeName : biggestUpset.awayName)
    : "";
  const upsetOdds = biggestUpset
    ? Math.round(Math.min(biggestUpset.homeAdvance, biggestUpset.awayAdvance) * 100)
    : 0;

  // Build insight sentence using actual driver data
  const riserDelta = Math.abs(riser.delta).toFixed(1);
  const insight = riserDriver
    ? `${riser.name} is the biggest mover since the last result (+${riserDelta} pp). ${riser.primaryDriver}.${champ.name !== riser.name ? ` ${champ.name} remains the model's most likely champion at ${champ.current.toFixed(1)}%.` : ""}`
    : `${champ.name} leads with ${champ.current.toFixed(1)}% championship odds after ${Object.keys(stored.matches).length} group + ${Object.keys(stored.knockoutMatches ?? {}).length} knockout results. ${riser.name} has gained the most ground from the pre-tournament baseline (+${riserDelta} pp).`;

  return {
    riser: riser.name,
    riserVal: `+${Math.abs(riser.delta).toFixed(1)} pp`,
    riserNote: `to ${riser.currentPct.toFixed(1)}% title odds · ${riser.primaryDriver}`,
    faller: faller.name,
    fallerVal: `-${Math.abs(faller.delta).toFixed(1)} pp`,
    fallerNote: `to ${faller.currentPct.toFixed(1)}% title odds · ${faller.primaryDriver}`,
    matchName,
    matchNote,
    champ: champ.name,
    champVal: `${champ.current.toFixed(1)}%`,
    champNote: `${rows[1]?.name ?? "No other team"} at ${rows[1]?.current.toFixed(1) ?? "0"}% is the nearest rival`,
    upset: upsetTeam,
    upsetVal: `${upsetOdds}%`,
    upsetNote: upsetFavName
      ? `${upsetOdds}% advancement odds vs ${upsetFavName} — closest to a coin flip in the current bracket`
      : "no upcoming matches",
    insight,
  };
}

/**
 * Deterministic-but-varied phrase selection — same team/situation always
 * gets the same phrasing within one build (so it doesn't flicker between
 * renders), but different teams/situations land on different phrasings
 * instead of every headline reading like the same mail-merge template.
 */
function pickVariant<T>(options: T[], seed: string): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return options[Math.abs(hash) % options.length];
}

const ROUND_LABEL: Record<string, string> = {
  "Round of 32": "Round of 32",
  "Round of 16": "Round of 16",
  Quarterfinal: "Quarterfinals",
  Semifinal: "Semifinals",
  Final: "Final",
};

export function buildLiveHeadlines(liveTeams: Team[], stored: StoredResults): Headline[] {
  const playedCount = Object.keys(stored.matches).length;
  const knockoutPlayedCount = Object.keys(stored.knockoutMatches ?? {}).length;
  if (playedCount === 0) return [];

  const byDelta = [...liveTeams]
    .map((t) => ({ ...t, delta: Number((t.current - t.baseline).toFixed(1)) }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const sorted = [...liveTeams].sort((a, b) => b.current - a.current);
  const statusByCode = new Map(liveTeams.map((t) => [t.code, getTeamKnockoutStatus(t.code as TeamCode, stored)]));

  const headlines: Headline[] = [];
  const usedCodes = new Set<string>(); // avoid the same team headlining twice in one refresh

  // ── Slot 1: biggest mover — eliminated, knockout advance, or group-stage riser, whichever is most newsworthy ──
  const biggestFaller = byDelta.filter((t) => t.delta < 0).sort((a, b) => a.delta - b.delta)[0];
  const fallerStatus = biggestFaller ? statusByCode.get(biggestFaller.code) : undefined;

  if (biggestFaller && fallerStatus?.eliminated && fallerStatus.eliminatedRound) {
    const round = ROUND_LABEL[fallerStatus.eliminatedRound] ?? fallerStatus.eliminatedRound;
    const opponent = fallerStatus.eliminatedBy ? TEAM_BY_CODE[fallerStatus.eliminatedBy]?.name ?? fallerStatus.eliminatedBy : "their opponent";
    const variants = [
      {
        title: `${biggestFaller.name} Eliminated: ${opponent} Ends Their Run in the ${round}`,
        summary: `${opponent} knocked ${biggestFaller.name} out of the tournament in the ${round}. Their championship odds fall to 0%, down ${Math.abs(biggestFaller.delta).toFixed(1)} points from their pre-tournament projection.`,
      },
      {
        title: `${biggestFaller.name}'s World Cup Is Over, Beaten By ${opponent} in the ${round}`,
        summary: `A ${round} loss to ${opponent} ends ${biggestFaller.name}'s tournament. The model had them as high as ${biggestFaller.baseline.toFixed(1)}% before the bracket caught up with them.`,
      },
      {
        title: `${opponent} Send ${biggestFaller.name} Home in the ${round}`,
        summary: `${biggestFaller.name}'s title hopes are finished — ${opponent} eliminated them in the ${round}, closing out a run that peaked at ${biggestFaller.baseline.toFixed(1)}% pre-tournament.`,
      },
    ];
    const v = pickVariant(variants, biggestFaller.code + fallerStatus.eliminatedRound);
    headlines.push({ ...v, metric: "OUT", metricLabel: "ELIMINATED", up: false });
    usedCodes.add(biggestFaller.code);
  } else if (biggestFaller) {
    const variants = [
      {
        title: `${biggestFaller.name}'s Title Hopes Fade After Group Stage Results`,
        summary: `Results so far have knocked ${biggestFaller.name} down ${Math.abs(biggestFaller.delta).toFixed(1)} percentage points from their pre-tournament probability.`,
      },
      {
        title: `${biggestFaller.name} Slipping After a Rough Group Stage`,
        summary: `${biggestFaller.name}'s championship odds have dropped ${Math.abs(biggestFaller.delta).toFixed(1)} points since the pre-tournament baseline, the steepest fall in the field right now.`,
      },
    ];
    const v = pickVariant(variants, biggestFaller.code);
    headlines.push({ ...v, metric: `${biggestFaller.delta.toFixed(1)} pp`, metricLabel: "CHANGE", up: false });
    usedCodes.add(biggestFaller.code);
  }

  // ── Slot 2: biggest riser — knockout advance vs group-stage improvement ──
  const biggestRiser = byDelta.filter((t) => t.delta > 0 && !usedCodes.has(t.code))[0];
  const riserStatus = biggestRiser ? statusByCode.get(biggestRiser.code) : undefined;
  const riserAdvancedInKnockout = riserStatus && !riserStatus.eliminated && riserStatus.currentRound && riserStatus.currentRound !== "Round of 32";

  if (biggestRiser && riserAdvancedInKnockout) {
    const round = ROUND_LABEL[riserStatus!.currentRound!] ?? riserStatus!.currentRound!;
    const variants = [
      {
        title: `${biggestRiser.name} Advances to the ${round}, Odds Climb to ${biggestRiser.current.toFixed(1)}%`,
        summary: `A knockout-stage win pushes ${biggestRiser.name} into the ${round} and lifts their title probability ${biggestRiser.delta.toFixed(1)} points to ${biggestRiser.current.toFixed(1)}%.`,
      },
      {
        title: `${biggestRiser.name} Powers Into the ${round} After Big Win`,
        summary: `${biggestRiser.name}'s knockout run continues — now into the ${round} with championship odds up ${biggestRiser.delta.toFixed(1)} points to ${biggestRiser.current.toFixed(1)}%.`,
      },
    ];
    const v = pickVariant(variants, biggestRiser.code + round);
    headlines.push({ ...v, metric: `+${biggestRiser.delta.toFixed(1)} pp`, metricLabel: "CHANGE", up: true });
    usedCodes.add(biggestRiser.code);
  } else if (biggestRiser) {
    const variants = [
      {
        title: `${biggestRiser.name} Makes Biggest Move In Latest Model Update`,
        summary: `A strong run of results has pushed ${biggestRiser.name} up ${biggestRiser.delta.toFixed(1)} percentage points in title probability since the pre-tournament baseline.`,
      },
      {
        title: `${biggestRiser.name} Surging After Group Stage Form`,
        summary: `${biggestRiser.name}'s title odds have climbed ${biggestRiser.delta.toFixed(1)} points since the pre-tournament baseline — the biggest gain in the field right now.`,
      },
    ];
    const v = pickVariant(variants, biggestRiser.code);
    headlines.push({ ...v, metric: `+${biggestRiser.delta.toFixed(1)} pp`, metricLabel: "CHANGE", up: true });
    usedCodes.add(biggestRiser.code);
  }

  // ── Slot 3: current leader — always the TRUE #1 team by championship odds,
  // never a lower-ranked team, even if that team was already featured in an
  // earlier slot for a different (also true) reason. A team being both the
  // "biggest riser" and "the leader" are two separate true facts; skipping
  // the real leader here to avoid repeating a name previously produced a
  // false "X Holds Top Spot" claim about a team that wasn't actually #1.
  const leader = sorted[0];
  if (leader) {
    const variants = [
      {
        title: `${leader.name} Holds Top Spot With ${leader.current.toFixed(1)}% Championship Odds`,
        summary: `The Veridex model rates ${leader.name} as the most likely champion after ${playedCount} group stage and ${knockoutPlayedCount} knockout results recorded.`,
      },
      {
        title: `${leader.name} Remains the Model's Favorite at ${leader.current.toFixed(1)}%`,
        summary: `No team has displaced ${leader.name} atop the championship odds, currently sitting at ${leader.current.toFixed(1)}% after the latest round of results.`,
      },
    ];
    const v = pickVariant(variants, leader.code + "leader");
    headlines.push({ ...v, metric: `${leader.current.toFixed(1)}%`, metricLabel: "TITLE ODDS", up: leader.current > leader.baseline });
    usedCodes.add(leader.code);
  }

  // ── Slot 4: next-most-notable team not already featured, labeled with their ACTUAL rank ──
  const second = sorted.find((t) => !usedCodes.has(t.code));
  if (second) {
    const actualRank = sorted.findIndex((t) => t.code === second.code) + 1;
    const ordinal = actualRank === 2 ? "Second" : actualRank === 3 ? "Third" : actualRank === 4 ? "Fourth" : `${actualRank}th`;
    headlines.push({
      title: `${second.name} Sits ${ordinal} In Championship Race`,
      summary: `With ${second.current.toFixed(1)}% title probability, ${second.name} trail the leader but remain firmly in contention.`,
      metric: `${second.current.toFixed(1)}%`,
      metricLabel: "TITLE ODDS",
      up: second.current > second.baseline,
    });
    usedCodes.add(second.code);
  }

  // ── Slot 5: model status, accurately reflecting the current stage ──
  const totalKnockoutMatches = Object.keys(KNOCKOUT_STRUCTURE).length;
  if (playedCount < 72) {
    headlines.push({
      title: `Model Refreshed: ${playedCount} Group Stage Results Recorded`,
      summary: `The Veridex model has processed ${playedCount} of 72 group stage matches. Probabilities reflect ${DEFAULT_SETTINGS.simulations.toLocaleString()} Monte Carlo simulations of the remaining tournament.`,
      metric: `${playedCount}/72`,
      metricLabel: "RESULTS IN",
      up: true,
    });
  } else {
    headlines.push({
      title: `Model Refreshed: ${knockoutPlayedCount} of ${totalKnockoutMatches} Knockout Matches Played`,
      summary: `The group stage is complete. The Veridex model has processed ${knockoutPlayedCount} of ${totalKnockoutMatches} knockout matches, reflecting ${DEFAULT_SETTINGS.simulations.toLocaleString()} Monte Carlo simulations of the remaining bracket.`,
      metric: `${knockoutPlayedCount}/${totalKnockoutMatches}`,
      metricLabel: "KNOCKOUT",
      up: true,
    });
  }

  // ── Slot 6: quiet contender — biggest riser NOT already featured, and NOT eliminated ──
  const surprise = byDelta
    .filter((t) => t.delta > 0 && !usedCodes.has(t.code) && !statusByCode.get(t.code)?.eliminated)
    .sort((a, b) => {
      const aRatio = a.current / Math.max(0.1, a.baseline);
      const bRatio = b.current / Math.max(0.1, b.baseline);
      return bRatio - aRatio;
    })[0];
  if (surprise) {
    headlines.push({
      title: `${surprise.name} Emerging As Quiet Contender`,
      summary: `Often overlooked, ${surprise.name} have outperformed their pre-tournament projection — the model now gives them ${surprise.current.toFixed(1)}% championship probability.`,
      metric: `${surprise.current.toFixed(1)}%`,
      metricLabel: "TITLE ODDS",
      up: true,
    });
  }

  // ── Slot 7: bracket path — a notable team's real next knockout matchup.
  // Reuses the same nextOpponentCode/nextOpponentName/advancingProb fields
  // buildLiveTeams already computes from the real bracket (bracketTree.ts),
  // which only ever resolve once BOTH sides of that match are decided by
  // an actual result — so, like the rest of the app, this never guesses
  // at an opponent that isn't confirmed yet. ──
  const pathTeam = sorted.find(
    (t) => !usedCodes.has(t.code) && t.nextOpponentCode && t.nextOpponentName && t.advancingProb !== null,
  );
  if (pathTeam) {
    const pathStatus = statusByCode.get(pathTeam.code);
    const round = pathStatus?.currentRound ? (ROUND_LABEL[pathStatus.currentRound] ?? pathStatus.currentRound) : "next round";
    const advancePct = Math.round((pathTeam.advancingProb ?? 0) * 100);
    const variants = [
      {
        title: `${pathTeam.name}'s Path Runs Through ${pathTeam.nextOpponentName} In The ${round}`,
        summary: `${pathTeam.name} face ${pathTeam.nextOpponentName} in the ${round}, with the model giving them a ${advancePct}% chance to advance and keep their title odds alive.`,
      },
      {
        title: `Next Up For ${pathTeam.name}: ${pathTeam.nextOpponentName} In The ${round}`,
        summary: `The model gives ${pathTeam.name} a ${advancePct}% chance to get past ${pathTeam.nextOpponentName} in the ${round} on their way toward the title.`,
      },
    ];
    const v = pickVariant(variants, pathTeam.code + "path");
    headlines.push({
      ...v,
      metric: `${advancePct}%`,
      metricLabel: "BRACKET PATH",
      up: advancePct >= 50,
    });
    usedCodes.add(pathTeam.code);
  }

  return headlines.slice(0, 7);
}

export function buildLiveBreakingText(liveTeams: Team[], stored: StoredResults): string {
  const playedCount = Object.keys(stored.matches).length;
  if (playedCount === 0) {
    return "World Cup 2026 is underway · Veridex model live · Enter results in admin mode to update predictions";
  }

  const sorted = [...liveTeams].sort((a, b) => b.current - a.current);
  const byDelta = liveTeams.map((t) => ({
    ...t,
    delta: Number((t.current - t.baseline).toFixed(1)),
  }));
  const riser = [...byDelta].sort((a, b) => b.delta - a.delta)[0];
  const faller = [...byDelta].sort((a, b) => a.delta - b.delta)[0];
  const leader = sorted[0];
  const second = sorted[1];

  const parts = [
    `${leader.name} leads at ${leader.current.toFixed(1)}%`,
    riser.delta > 0 ? `${riser.name} +${riser.delta.toFixed(1)}pp after group stage results` : null,
    faller.delta < 0 ? `${faller.name} -${Math.abs(faller.delta).toFixed(1)}pp` : null,
    `${second.name} at ${second.current.toFixed(1)}%`,
    `${playedCount} results recorded · ${DEFAULT_SETTINGS.simulations.toLocaleString()} simulations refreshed`,
    `Veridex model updated`,
  ].filter(Boolean) as string[];

  return parts.join(" · ");
}