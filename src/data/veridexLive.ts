import baselineData from "./baseline.json";
import { DEFAULT_SETTINGS, GROUP_MATCHES, KNOCKOUT_MATCHES } from ".";
import { computeElosFromResults, runSimulation } from "../lib/simulate";
import { computeStandings } from "../lib/groups";
import { TEAM_BY_CODE } from "../lib/teams";
import { computeDrivers, getUpcomingKnockoutOdds } from "../lib/drivers";
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

function timeAgo(index: number): string {
  const times = ["Just now", "12 min ago", "34 min ago", "1 hr ago", "2 hr ago", "3 hr ago"];
  return times[index] ?? "Today";
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

export function buildLiveTeams(stored: StoredResults): Team[] {
  const playedMatches = GROUP_MATCHES.map((match) => {
    const result = stored.matches[match.id];
    return result
      ? { ...match, played: true, homeGoals: result.homeGoals, awayGoals: result.awayGoals }
      : match;
  });
  const current = runSimulation(playedMatches, KNOCKOUT_MATCHES, DEFAULT_SETTINGS, 42, stored.knockoutMatches);
  const elos = computeElosFromResults(playedMatches, DEFAULT_SETTINGS);
  const baselineByCode = new Map(baselineRows.map((row) => [row.code, row]));

  return current.probabilities.map((row) => {
    const team = TEAM_BY_CODE[row.code];
    const baseline = baselineByCode.get(row.code);
    const baseChampion = pct(baseline?.champion ?? 0);
    const currentChampion = pct(row.champion);

    return {
      name: row.name,
      code: row.code,
      group: `Group ${team.group}`,
      baseline: baseChampion,
      current: currentChampion,
      rating: ratingFromElo(elos[row.code]),
      formStr: formForTeam(row.code, stored),
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
    champNote: `most likely champion · ${rows[1]?.name ?? ""} at ${rows[1]?.current.toFixed(1) ?? ""}% is nearest rival`,
    upset: upsetTeam,
    upsetVal: `${upsetOdds}%`,
    upsetNote: upsetFavName
      ? `${upsetOdds}% advancement odds vs ${upsetFavName} — closest to a coin flip in the current bracket`
      : "no upcoming matches",
    insight,
  };
}

export function buildLiveHeadlines(liveTeams: Team[], stored: StoredResults): Headline[] {
  const playedCount = Object.keys(stored.matches).length;
  if (playedCount === 0) return [];

  const byDelta = [...liveTeams]
    .map((t) => ({ ...t, delta: Number((t.current - t.baseline).toFixed(1)) }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const sorted = [...liveTeams].sort((a, b) => b.current - a.current);

  // Compute group standings to find group leaders
  const playedMatches = GROUP_MATCHES.map((m) => {
    const r = stored.matches[m.id];
    return r ? { ...m, played: true, homeGoals: r.homeGoals, awayGoals: r.awayGoals } : m;
  });
  const standings = computeStandings(playedMatches);
  const groupLeaders: string[] = [];
  for (const group of Object.values(standings)) {
    const sorted_g = [...group].sort((a, b) => b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga));
    if (sorted_g[0]) groupLeaders.push(TEAM_BY_CODE[sorted_g[0].team]?.name ?? "");
  }

  const headlines: Headline[] = [];

  // Headline 1 — biggest riser
  const riser = byDelta.find((t) => t.delta > 0);
  if (riser) {
    headlines.push({
      title: `${riser.name} Makes Biggest Move In Latest Model Update`,
      summary: `A strong run of results has pushed ${riser.name} up ${riser.delta.toFixed(1)} percentage points in title probability since the pre-tournament baseline.`,
      metric: `+${riser.delta.toFixed(1)} pp`,
      metricLabel: "CHANGE",
      time: timeAgo(0),
      up: true,
    });
  }

  // Headline 2 — current leader
  const leader = sorted[0];
  if (leader) {
    headlines.push({
      title: `${leader.name} Holds Top Spot With ${leader.current.toFixed(1)}% Championship Odds`,
      summary: `The Veridex model rates ${leader.name} as the most likely champion after ${playedCount} group stage results recorded.`,
      metric: `${leader.current.toFixed(1)}%`,
      metricLabel: "TITLE ODDS",
      time: timeAgo(1),
      up: leader.current > leader.baseline,
    });
  }

  // Headline 3 — biggest faller
  const faller = byDelta.filter((t) => t.delta < 0).sort((a, b) => a.delta - b.delta)[0];
  if (faller) {
    headlines.push({
      title: `${faller.name}'s Title Hopes Fade After Group Stage Results`,
      summary: `Results so far have knocked ${faller.name} down ${Math.abs(faller.delta).toFixed(1)} percentage points from their pre-tournament probability.`,
      metric: `${faller.delta.toFixed(1)} pp`,
      metricLabel: "CHANGE",
      time: timeAgo(2),
      up: false,
    });
  }

  // Headline 4 — #2 team
  const second = sorted[1];
  if (second) {
    headlines.push({
      title: `${second.name} Sits Second In Championship Race`,
      summary: `With ${second.current.toFixed(1)}% title probability, ${second.name} trail the leader but remain firmly in contention heading into the knockout rounds.`,
      metric: `${second.current.toFixed(1)}%`,
      metricLabel: "TITLE ODDS",
      time: timeAgo(3),
      up: second.current > second.baseline,
    });
  }

  // Headline 5 — group stage completion
  headlines.push({
    title: `Model Refreshed: ${playedCount} Group Stage Results Recorded`,
    summary: `The Veridex model has processed ${playedCount} of 72 group stage matches. Probabilities reflect ${DEFAULT_SETTINGS.simulations.toLocaleString()} Monte Carlo simulations of the remaining tournament.`,
    metric: `${playedCount}/72`,
    metricLabel: "RESULTS IN",
    time: timeAgo(4),
    up: true,
  });

  // Headline 6 — surprise team
  const surprise = byDelta.filter((t) => t.delta > 0).sort((a, b) => {
    // highest current % relative to baseline
    const aRatio = a.current / Math.max(0.1, a.baseline);
    const bRatio = b.current / Math.max(0.1, b.baseline);
    return bRatio - aRatio;
  })[1]; // [0] is already the riser headline
  if (surprise) {
    headlines.push({
      title: `${surprise.name} Emerging As Quiet Contender`,
      summary: `Often overlooked, ${surprise.name} have outperformed their pre-tournament projection — the model now gives them ${surprise.current.toFixed(1)}% championship probability.`,
      metric: `${surprise.current.toFixed(1)}%`,
      metricLabel: "TITLE ODDS",
      time: timeAgo(5),
      up: true,
    });
  }

  return headlines.slice(0, 6);
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