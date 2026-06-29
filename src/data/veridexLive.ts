import baselineData from "./baseline.json";
import { DEFAULT_SETTINGS, GROUP_MATCHES, KNOCKOUT_MATCHES } from ".";
import { computeElosFromResults, runSimulation } from "../lib/simulate";
import { TEAM_BY_CODE } from "../lib/teams";
import type { StoredResults, TeamCode, TeamProbabilities } from "../lib/types";
import type { MorningForecast, Team } from "./worldCup";

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

export function buildLiveTeams(stored: StoredResults): Team[] {
  const playedMatches = GROUP_MATCHES.map((match) => {
    const result = stored.matches[match.id];
    return result
      ? { ...match, played: true, homeGoals: result.homeGoals, awayGoals: result.awayGoals }
      : match;
  });
  const current = runSimulation(playedMatches, KNOCKOUT_MATCHES, DEFAULT_SETTINGS);
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

export function buildLiveMorningForecast(liveTeams: Team[]): MorningForecast {
  const rows = [...liveTeams].sort((a, b) => b.current - a.current);
  const byDelta = [...liveTeams].map((team) => ({
    ...team,
    delta: Number((team.current - team.baseline).toFixed(1)),
  }));
  const riser = [...byDelta].sort((a, b) => b.delta - a.delta)[0];
  const faller = [...byDelta].sort((a, b) => a.delta - b.delta)[0];
  const champ = rows[0];

  return {
    riser: riser.name,
    riserVal: `+${Math.max(0, riser.delta).toFixed(1)} pp`,
    riserNote: `to ${riser.current.toFixed(1)}% title odds`,
    faller: faller.name,
    fallerVal: `-${Math.abs(Math.min(0, faller.delta)).toFixed(1)} pp`,
    fallerNote: `to ${faller.current.toFixed(1)}% title odds`,
    matchName: "Next recorded result",
    matchNote: `${DEFAULT_SETTINGS.simulations.toLocaleString()} simulations refreshed`,
    champ: champ.name,
    champVal: `${champ.current.toFixed(1)}%`,
    champNote: "most likely champion",
    upset: rows[8]?.name ?? rows[rows.length - 1].name,
    upsetVal: `${(rows[8]?.current ?? rows[rows.length - 1].current).toFixed(1)}%`,
    upsetNote: "highest long-tail contender in current table",
    insight: `${champ.name} leads the current model after your manually entered results. The largest move belongs to ${riser.name}, up ${Math.max(0, riser.delta).toFixed(1)} percentage points from the pre-tournament baseline.`,
  };
}
