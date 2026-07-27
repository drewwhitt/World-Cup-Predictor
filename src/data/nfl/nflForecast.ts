import { NFL_TEAMS } from "./teams";
import { NFL_SCHEDULE, buildNflTeams } from "./nflLive";
import { runNflMonteCarlo, type NflTeamForecast, type SimTeam, type SimGame } from "../../lib/engine/sports/nflSeasonSim";

const SIM_TEAMS: SimTeam[] = NFL_TEAMS.map((t) => ({ code: t.code, conference: t.conference, division: t.division }));
const SIM_SCHEDULE: SimGame[] = NFL_SCHEDULE.map((g) => ({ id: g.id, week: g.week, home: g.home, away: g.away, neutral: g.neutral, div: g.div }));

export function buildNflSeasonForecast(simulations = 2000): NflTeamForecast[] {
  const eloByCode = new Map(buildNflTeams().map((t) => [t.code, t.elo]));
  const initialElos = Object.fromEntries(SIM_TEAMS.map((t) => [t.code, eloByCode.get(t.code) ?? 1505]));
  return runNflMonteCarlo(SIM_TEAMS, SIM_SCHEDULE, initialElos, simulations);
}