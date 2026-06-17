import type { GroupLetter, Team, TeamCode } from "./types";

/** FIFA-style rank → starting Elo (pre-tournament baseline). */
function eloFromRank(rank: number): number {
  return Math.round(2200 - rank * 9);
}

const RANKINGS: Record<string, number> = {
  Argentina: 1,
  Spain: 2,
  France: 3,
  England: 4,
  Brazil: 5,
  Portugal: 6,
  Netherlands: 7,
  Belgium: 8,
  Germany: 9,
  Croatia: 10,
  Morocco: 11,
  Colombia: 13,
  Uruguay: 15,
  USA: 16,
  Mexico: 17,
  Japan: 17,
  Senegal: 18,
  Switzerland: 19,
  Iran: 20,
  Austria: 22,
  Ecuador: 23,
  "South Korea": 23,
  Australia: 24,
  Turkey: 26,
  Canada: 30,
  Panama: 31,
  Egypt: 32,
  Norway: 33,
  Algeria: 38,
  Scotland: 39,
  "Ivory Coast": 40,
  Tunisia: 41,
  "Czech Republic": 43,
  Paraguay: 45,
  Qatar: 36,
  Uzbekistan: 53,
  "DR Congo": 56,
  "South Africa": 57,
  "Saudi Arabia": 58,
  Iraq: 58,
  Jordan: 62,
  "New Zealand": 89,
  "Cape Verde": 70,
  Ghana: 73,
  "Bosnia & Herzegovina": 74,
  Haiti: 86,
  "Curaçao": 90,
  Sweden: 28,
};

export const TEAMS: Team[] = [
  { code: "MEX", name: "Mexico", group: "A", initialElo: eloFromRank(RANKINGS.Mexico) },
  { code: "RSA", name: "South Africa", group: "A", initialElo: eloFromRank(RANKINGS["South Africa"]) },
  { code: "KOR", name: "South Korea", group: "A", initialElo: eloFromRank(RANKINGS["South Korea"]) },
  { code: "CZE", name: "Czech Republic", group: "A", initialElo: eloFromRank(RANKINGS["Czech Republic"]) },
  { code: "CAN", name: "Canada", group: "B", initialElo: eloFromRank(RANKINGS.Canada) },
  { code: "BIH", name: "Bosnia & Herzegovina", group: "B", initialElo: eloFromRank(RANKINGS["Bosnia & Herzegovina"]) },
  { code: "QAT", name: "Qatar", group: "B", initialElo: eloFromRank(RANKINGS.Qatar) },
  { code: "SUI", name: "Switzerland", group: "B", initialElo: eloFromRank(RANKINGS.Switzerland) },
  { code: "BRA", name: "Brazil", group: "C", initialElo: eloFromRank(RANKINGS.Brazil) },
  { code: "MAR", name: "Morocco", group: "C", initialElo: eloFromRank(RANKINGS.Morocco) },
  { code: "HAI", name: "Haiti", group: "C", initialElo: eloFromRank(RANKINGS.Haiti) },
  { code: "SCO", name: "Scotland", group: "C", initialElo: eloFromRank(RANKINGS.Scotland) },
  { code: "USA", name: "USA", group: "D", initialElo: eloFromRank(RANKINGS.USA) },
  { code: "PAR", name: "Paraguay", group: "D", initialElo: eloFromRank(RANKINGS.Paraguay) },
  { code: "AUS", name: "Australia", group: "D", initialElo: eloFromRank(RANKINGS.Australia) },
  { code: "TUR", name: "Turkey", group: "D", initialElo: eloFromRank(RANKINGS.Turkey) },
  { code: "GER", name: "Germany", group: "E", initialElo: eloFromRank(RANKINGS.Germany) },
  { code: "CUW", name: "Curaçao", group: "E", initialElo: eloFromRank(RANKINGS["Curaçao"]) },
  { code: "CIV", name: "Ivory Coast", group: "E", initialElo: eloFromRank(RANKINGS["Ivory Coast"]) },
  { code: "ECU", name: "Ecuador", group: "E", initialElo: eloFromRank(RANKINGS.Ecuador) },
  { code: "NED", name: "Netherlands", group: "F", initialElo: eloFromRank(RANKINGS.Netherlands) },
  { code: "JPN", name: "Japan", group: "F", initialElo: eloFromRank(RANKINGS.Japan) },
  { code: "SWE", name: "Sweden", group: "F", initialElo: eloFromRank(RANKINGS.Sweden) },
  { code: "TUN", name: "Tunisia", group: "F", initialElo: eloFromRank(RANKINGS.Tunisia) },
  { code: "BEL", name: "Belgium", group: "G", initialElo: eloFromRank(RANKINGS.Belgium) },
  { code: "EGY", name: "Egypt", group: "G", initialElo: eloFromRank(RANKINGS.Egypt) },
  { code: "IRN", name: "Iran", group: "G", initialElo: eloFromRank(RANKINGS.Iran) },
  { code: "NZL", name: "New Zealand", group: "G", initialElo: eloFromRank(RANKINGS["New Zealand"]) },
  { code: "ESP", name: "Spain", group: "H", initialElo: eloFromRank(RANKINGS.Spain) },
  { code: "CPV", name: "Cape Verde", group: "H", initialElo: eloFromRank(RANKINGS["Cape Verde"]) },
  { code: "KSA", name: "Saudi Arabia", group: "H", initialElo: eloFromRank(RANKINGS["Saudi Arabia"]) },
  { code: "URU", name: "Uruguay", group: "H", initialElo: eloFromRank(RANKINGS.Uruguay) },
  { code: "FRA", name: "France", group: "I", initialElo: eloFromRank(RANKINGS.France) },
  { code: "SEN", name: "Senegal", group: "I", initialElo: eloFromRank(RANKINGS.Senegal) },
  { code: "IRQ", name: "Iraq", group: "I", initialElo: eloFromRank(RANKINGS.Iraq) },
  { code: "NOR", name: "Norway", group: "I", initialElo: eloFromRank(RANKINGS.Norway) },
  { code: "ARG", name: "Argentina", group: "J", initialElo: eloFromRank(RANKINGS.Argentina) },
  { code: "ALG", name: "Algeria", group: "J", initialElo: eloFromRank(RANKINGS.Algeria) },
  { code: "AUT", name: "Austria", group: "J", initialElo: eloFromRank(RANKINGS.Austria) },
  { code: "JOR", name: "Jordan", group: "J", initialElo: eloFromRank(RANKINGS.Jordan) },
  { code: "POR", name: "Portugal", group: "K", initialElo: eloFromRank(RANKINGS.Portugal) },
  { code: "COD", name: "DR Congo", group: "K", initialElo: eloFromRank(RANKINGS["DR Congo"]) },
  { code: "UZB", name: "Uzbekistan", group: "K", initialElo: eloFromRank(RANKINGS.Uzbekistan) },
  { code: "COL", name: "Colombia", group: "K", initialElo: eloFromRank(RANKINGS.Colombia) },
  { code: "ENG", name: "England", group: "L", initialElo: eloFromRank(RANKINGS.England) },
  { code: "CRO", name: "Croatia", group: "L", initialElo: eloFromRank(RANKINGS.Croatia) },
  { code: "GHA", name: "Ghana", group: "L", initialElo: eloFromRank(RANKINGS.Ghana) },
  { code: "PAN", name: "Panama", group: "L", initialElo: eloFromRank(RANKINGS.Panama) },
];

export const TEAM_BY_CODE = Object.fromEntries(
  TEAMS.map((t) => [t.code, t]),
) as Record<TeamCode, Team>;

export const TEAMS_BY_GROUP = TEAMS.reduce(
  (acc, team) => {
    (acc[team.group] ??= []).push(team.code);
    return acc;
  },
  {} as Record<GroupLetter, TeamCode[]>,
);

export function teamName(code: TeamCode): string {
  return TEAM_BY_CODE[code].name;
}
