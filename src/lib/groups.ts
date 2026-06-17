import { TEAM_BY_CODE, TEAMS_BY_GROUP } from "./teams";
import type { GroupLetter, GroupMatch, TeamCode } from "./types";

export interface StandingRow {
  team: TeamCode;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

export interface GroupStanding {
  group: GroupLetter;
  rows: StandingRow[];
  winner: TeamCode;
  runnerUp: TeamCode;
  third: TeamCode;
}

function emptyStanding(team: TeamCode): StandingRow {
  return { team, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
}

export function computeStandings(
  matches: GroupMatch[],
): Record<GroupLetter, StandingRow[]> {
  const tables = {} as Record<GroupLetter, Partial<Record<TeamCode, StandingRow>>>;

  for (const group of Object.keys(TEAMS_BY_GROUP) as GroupLetter[]) {
    tables[group] = {};
    for (const code of TEAMS_BY_GROUP[group]) {
      tables[group][code] = emptyStanding(code);
    }
  }

  for (const match of matches) {
    if (!match.played || match.homeGoals === undefined || match.awayGoals === undefined) {
      continue;
    }
    const home = tables[match.group][match.home];
    const away = tables[match.group][match.away];
    home.played += 1;
    away.played += 1;
    home.gf += match.homeGoals;
    home.ga += match.awayGoals;
    away.gf += match.awayGoals;
    away.ga += match.homeGoals;

    if (match.homeGoals > match.awayGoals) {
      home.won += 1;
      away.lost += 1;
      home.points += 3;
    } else if (match.homeGoals < match.awayGoals) {
      away.won += 1;
      home.lost += 1;
      away.points += 3;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  for (const group of Object.keys(tables) as GroupLetter[]) {
    for (const row of Object.values(tables[group])) {
      row.gd = row.gf - row.ga;
    }
  }

  const result = {} as Record<GroupLetter, StandingRow[]>;
  for (const group of Object.keys(tables) as GroupLetter[]) {
    result[group] = Object.values(tables[group]).sort(compareRows);
  }
  return result;
}

function compareRows(a: StandingRow, b: StandingRow): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.gd !== a.gd) return b.gd - a.gd;
  if (b.gf !== a.gf) return b.gf - a.gf;
  return TEAM_BY_CODE[a.team].name.localeCompare(TEAM_BY_CODE[b.team].name);
}

export function summarizeGroups(standings: Record<GroupLetter, StandingRow[]>): GroupStanding[] {
  return (Object.keys(standings) as GroupLetter[]).map((group) => {
    const rows = standings[group];
    return {
      group,
      rows,
      winner: rows[0].team,
      runnerUp: rows[1].team,
      third: rows[2].team,
    };
  });
}

export interface ThirdPlaceCandidate {
  group: GroupLetter;
  team: TeamCode;
  points: number;
  gd: number;
  gf: number;
}

export function rankThirdPlaceTeams(groups: GroupStanding[]): ThirdPlaceCandidate[] {
  return groups
    .map((g) => {
      const row = g.rows[2];
      return {
        group: g.group,
        team: row.team,
        points: row.points,
        gd: row.gd,
        gf: row.gf,
      };
    })
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.gd !== a.gd) return b.gd - a.gd;
      return b.gf - a.gf;
    });
}

export function qualifyingThirdGroups(thirdRanked: ThirdPlaceCandidate[]): GroupLetter[] {
  return thirdRanked.slice(0, 8).map((t) => t.group);
}

export function isThirdPlaceQualified(group: GroupLetter, qualifiedGroups: GroupLetter[]): boolean {
  return qualifiedGroups.includes(group);
}

export function isGroupComplete(
  group: GroupLetter,
  matches: GroupMatch[],
): boolean {
  const groupMatches = matches.filter((m) => m.group === group);
  return groupMatches.length > 0 && groupMatches.every((m) => m.played);
}
