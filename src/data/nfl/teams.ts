/**
 * teams.ts (NFL)
 * The 32 current NFL franchises, as of the 2026 season. Team codes match
 * nflverse's convention (LA = Rams, LAC = Chargers, LV = Raiders) so this
 * lines up directly with historical-games.json and schedule-2026.json
 * without any code remapping.
 */

export type Conference = "AFC" | "NFC";
export type Division = "East" | "North" | "South" | "West";

export interface NFLTeam {
  code: string;
  name: string;
  city: string;
  conference: Conference;
  division: Division;
}

export const NFL_TEAMS: NFLTeam[] = [
  // AFC East
  { code: "BUF", name: "Bills", city: "Buffalo", conference: "AFC", division: "East" },
  { code: "MIA", name: "Dolphins", city: "Miami", conference: "AFC", division: "East" },
  { code: "NE", name: "Patriots", city: "New England", conference: "AFC", division: "East" },
  { code: "NYJ", name: "Jets", city: "New York", conference: "AFC", division: "East" },
  // AFC North
  { code: "BAL", name: "Ravens", city: "Baltimore", conference: "AFC", division: "North" },
  { code: "CIN", name: "Bengals", city: "Cincinnati", conference: "AFC", division: "North" },
  { code: "CLE", name: "Browns", city: "Cleveland", conference: "AFC", division: "North" },
  { code: "PIT", name: "Steelers", city: "Pittsburgh", conference: "AFC", division: "North" },
  // AFC South
  { code: "HOU", name: "Texans", city: "Houston", conference: "AFC", division: "South" },
  { code: "IND", name: "Colts", city: "Indianapolis", conference: "AFC", division: "South" },
  { code: "JAX", name: "Jaguars", city: "Jacksonville", conference: "AFC", division: "South" },
  { code: "TEN", name: "Titans", city: "Tennessee", conference: "AFC", division: "South" },
  // AFC West
  { code: "DEN", name: "Broncos", city: "Denver", conference: "AFC", division: "West" },
  { code: "KC", name: "Chiefs", city: "Kansas City", conference: "AFC", division: "West" },
  { code: "LV", name: "Raiders", city: "Las Vegas", conference: "AFC", division: "West" },
  { code: "LAC", name: "Chargers", city: "Los Angeles", conference: "AFC", division: "West" },
  // NFC East
  { code: "DAL", name: "Cowboys", city: "Dallas", conference: "NFC", division: "East" },
  { code: "NYG", name: "Giants", city: "New York", conference: "NFC", division: "East" },
  { code: "PHI", name: "Eagles", city: "Philadelphia", conference: "NFC", division: "East" },
  { code: "WAS", name: "Commanders", city: "Washington", conference: "NFC", division: "East" },
  // NFC North
  { code: "CHI", name: "Bears", city: "Chicago", conference: "NFC", division: "North" },
  { code: "DET", name: "Lions", city: "Detroit", conference: "NFC", division: "North" },
  { code: "GB", name: "Packers", city: "Green Bay", conference: "NFC", division: "North" },
  { code: "MIN", name: "Vikings", city: "Minnesota", conference: "NFC", division: "North" },
  // NFC South
  { code: "ATL", name: "Falcons", city: "Atlanta", conference: "NFC", division: "South" },
  { code: "CAR", name: "Panthers", city: "Carolina", conference: "NFC", division: "South" },
  { code: "NO", name: "Saints", city: "New Orleans", conference: "NFC", division: "South" },
  { code: "TB", name: "Buccaneers", city: "Tampa Bay", conference: "NFC", division: "South" },
  // NFC West
  { code: "ARI", name: "Cardinals", city: "Arizona", conference: "NFC", division: "West" },
  { code: "LA", name: "Rams", city: "Los Angeles", conference: "NFC", division: "West" },
  { code: "SF", name: "49ers", city: "San Francisco", conference: "NFC", division: "West" },
  { code: "SEA", name: "Seahawks", city: "Seattle", conference: "NFC", division: "West" },
];

export const NFL_TEAM_BY_CODE: Record<string, NFLTeam> = Object.fromEntries(
  NFL_TEAMS.map((t) => [t.code, t]),
);