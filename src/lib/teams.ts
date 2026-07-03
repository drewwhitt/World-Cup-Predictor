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

export type Confederation = "UEFA" | "CONMEBOL" | "CAF" | "AFC" | "CONCACAF" | "OFC";

/**
 * Confederation strength offsets, validated via backtesting on the 2010-2022
 * World Cups (see model v6-v8 notes). Applied as a flat Elo adjustment on
 * top of each team's base rating — corrects for the fact that regional
 * qualifying strength varies systematically by confederation.
 */
export const CONFEDERATION_OFFSETS: Record<Confederation, number> = {
  UEFA: 0,
  CONMEBOL: 10,
  CAF: -15,
  AFC: -45,
  CONCACAF: -45,
  OFC: 0,
};

export const TEAM_CONFEDERATION: Record<string, Confederation> = {
  MEX: "CONCACAF", RSA: "CAF",      KOR: "AFC",      CZE: "UEFA",
  CAN: "CONCACAF", BIH: "UEFA",     QAT: "AFC",      SUI: "UEFA",
  BRA: "CONMEBOL", MAR: "CAF",      HAI: "CONCACAF", SCO: "UEFA",
  USA: "CONCACAF", PAR: "CONMEBOL", AUS: "AFC",      TUR: "UEFA",
  GER: "UEFA",     CUW: "CONCACAF",CIV: "CAF",       ECU: "CONMEBOL",
  NED: "UEFA",     JPN: "AFC",      SWE: "UEFA",     TUN: "CAF",
  BEL: "UEFA",     EGY: "CAF",      IRN: "AFC",      NZL: "OFC",
  ESP: "UEFA",     CPV: "CAF",      KSA: "AFC",      URU: "CONMEBOL",
  FRA: "UEFA",     SEN: "CAF",      IRQ: "AFC",      NOR: "UEFA",
  ARG: "CONMEBOL", ALG: "CAF",      AUT: "UEFA",     JOR: "AFC",
  POR: "UEFA",     COD: "CAF",      UZB: "AFC",      COL: "CONMEBOL",
  ENG: "UEFA",     CRO: "UEFA",     GHA: "CAF",      PAN: "CONCACAF",
};

/**
 * ── PRE-TOURNAMENT ELO — fill in real calibrated values here ──────────────
 * These currently fall back to a simple FIFA-rank-derived formula. Replace
 * any value below with your real pre-tournament Elo (e.g. from the same
 * calibration process used for the 2010-2022 backtests) as you have them.
 * Confederation offset is applied automatically — do NOT bake it into
 * these numbers, enter the team's raw strength rating only.
 */
/**
 * Pre-tournament Elo values sourced from eloratings.net — the same calibrated
 * values used in the v3–v9 backtesting sessions. Teams that appeared in the
 * 2022 World Cup use those validated Elos as the closest real baseline.
 * New 2026 qualifiers (Sweden, Bosnia, etc.) fall back to the rank formula.
 * Confederation offsets are applied ON TOP of these values automatically.
 * Do NOT bake confederation offsets into these numbers.
 */
const PRE_TOURNAMENT_ELO: Record<string, number | null> = {
  // Group A
  MEX: 1853, RSA: 1517, KOR: 1779, CZE: 1740,
  // Group B
  CAN: 1773, BIH: 1595, QAT: 1421, SUI: 1879,
  // Group C
  BRA: 2169, MAR: 1768, HAI: 1548, SCO: 1782,
  // Group D
  USA: 1856, PAR: 1834, AUS: 1753, TUR: 1911,
  // Group E
  GER: 1922, CUW: 1434, CIV: 1695, ECU: 1764,
  // Group F
  NED: 1940, JPN: 1762, SWE: 1712, TUN: 1726,
  // Group G
  BEL: 1931, EGY: 1696, IRN: 1739, NZL: 1562,
  // Group H
  ESP: 1954, CPV: 1578, KSA: 1650, URU: 1887,
  // Group I
  FRA: 2005, SEN: 1845, IRQ: 1607, NOR: 1914,
  // Group J
  ARG: 2141, ALG: 1772, AUT: 1830, JOR: 1680,
  // Group K
  POR: 1942, COD: 1652, UZB: 1714, COL: 1834,
  // Group L
  ENG: 1975, CRO: 1877, GHA: 1718, PAN: 1730,
};

function resolveInitialElo(code: string, rank: number): number {
  const manual = PRE_TOURNAMENT_ELO[code];
  const base = manual !== null && manual !== undefined ? manual : eloFromRank(rank);
  const confederation = TEAM_CONFEDERATION[code] ?? "UEFA";
  return base + CONFEDERATION_OFFSETS[confederation];
}

export const TEAMS: Team[] = [
  { code: "MEX", name: "Mexico", group: "A", initialElo: resolveInitialElo("MEX", RANKINGS.Mexico) },
  { code: "RSA", name: "South Africa", group: "A", initialElo: resolveInitialElo("RSA", RANKINGS["South Africa"]) },
  { code: "KOR", name: "South Korea", group: "A", initialElo: resolveInitialElo("KOR", RANKINGS["South Korea"]) },
  { code: "CZE", name: "Czech Republic", group: "A", initialElo: resolveInitialElo("CZE", RANKINGS["Czech Republic"]) },
  { code: "CAN", name: "Canada", group: "B", initialElo: resolveInitialElo("CAN", RANKINGS.Canada) },
  { code: "BIH", name: "Bosnia & Herzegovina", group: "B", initialElo: resolveInitialElo("BIH", RANKINGS["Bosnia & Herzegovina"]) },
  { code: "QAT", name: "Qatar", group: "B", initialElo: resolveInitialElo("QAT", RANKINGS.Qatar) },
  { code: "SUI", name: "Switzerland", group: "B", initialElo: resolveInitialElo("SUI", RANKINGS.Switzerland) },
  { code: "BRA", name: "Brazil", group: "C", initialElo: resolveInitialElo("BRA", RANKINGS.Brazil) },
  { code: "MAR", name: "Morocco", group: "C", initialElo: resolveInitialElo("MAR", RANKINGS.Morocco) },
  { code: "HAI", name: "Haiti", group: "C", initialElo: resolveInitialElo("HAI", RANKINGS.Haiti) },
  { code: "SCO", name: "Scotland", group: "C", initialElo: resolveInitialElo("SCO", RANKINGS.Scotland) },
  { code: "USA", name: "USA", group: "D", initialElo: resolveInitialElo("USA", RANKINGS.USA) },
  { code: "PAR", name: "Paraguay", group: "D", initialElo: resolveInitialElo("PAR", RANKINGS.Paraguay) },
  { code: "AUS", name: "Australia", group: "D", initialElo: resolveInitialElo("AUS", RANKINGS.Australia) },
  { code: "TUR", name: "Turkey", group: "D", initialElo: resolveInitialElo("TUR", RANKINGS.Turkey) },
  { code: "GER", name: "Germany", group: "E", initialElo: resolveInitialElo("GER", RANKINGS.Germany) },
  { code: "CUW", name: "Curaçao", group: "E", initialElo: resolveInitialElo("CUW", RANKINGS["Curaçao"]) },
  { code: "CIV", name: "Ivory Coast", group: "E", initialElo: resolveInitialElo("CIV", RANKINGS["Ivory Coast"]) },
  { code: "ECU", name: "Ecuador", group: "E", initialElo: resolveInitialElo("ECU", RANKINGS.Ecuador) },
  { code: "NED", name: "Netherlands", group: "F", initialElo: resolveInitialElo("NED", RANKINGS.Netherlands) },
  { code: "JPN", name: "Japan", group: "F", initialElo: resolveInitialElo("JPN", RANKINGS.Japan) },
  { code: "SWE", name: "Sweden", group: "F", initialElo: resolveInitialElo("SWE", RANKINGS.Sweden) },
  { code: "TUN", name: "Tunisia", group: "F", initialElo: resolveInitialElo("TUN", RANKINGS.Tunisia) },
  { code: "BEL", name: "Belgium", group: "G", initialElo: resolveInitialElo("BEL", RANKINGS.Belgium) },
  { code: "EGY", name: "Egypt", group: "G", initialElo: resolveInitialElo("EGY", RANKINGS.Egypt) },
  { code: "IRN", name: "Iran", group: "G", initialElo: resolveInitialElo("IRN", RANKINGS.Iran) },
  { code: "NZL", name: "New Zealand", group: "G", initialElo: resolveInitialElo("NZL", RANKINGS["New Zealand"]) },
  { code: "ESP", name: "Spain", group: "H", initialElo: resolveInitialElo("ESP", RANKINGS.Spain) },
  { code: "CPV", name: "Cape Verde", group: "H", initialElo: resolveInitialElo("CPV", RANKINGS["Cape Verde"]) },
  { code: "KSA", name: "Saudi Arabia", group: "H", initialElo: resolveInitialElo("KSA", RANKINGS["Saudi Arabia"]) },
  { code: "URU", name: "Uruguay", group: "H", initialElo: resolveInitialElo("URU", RANKINGS.Uruguay) },
  { code: "FRA", name: "France", group: "I", initialElo: resolveInitialElo("FRA", RANKINGS.France) },
  { code: "SEN", name: "Senegal", group: "I", initialElo: resolveInitialElo("SEN", RANKINGS.Senegal) },
  { code: "IRQ", name: "Iraq", group: "I", initialElo: resolveInitialElo("IRQ", RANKINGS.Iraq) },
  { code: "NOR", name: "Norway", group: "I", initialElo: resolveInitialElo("NOR", RANKINGS.Norway) },
  { code: "ARG", name: "Argentina", group: "J", initialElo: resolveInitialElo("ARG", RANKINGS.Argentina) },
  { code: "ALG", name: "Algeria", group: "J", initialElo: resolveInitialElo("ALG", RANKINGS.Algeria) },
  { code: "AUT", name: "Austria", group: "J", initialElo: resolveInitialElo("AUT", RANKINGS.Austria) },
  { code: "JOR", name: "Jordan", group: "J", initialElo: resolveInitialElo("JOR", RANKINGS.Jordan) },
  { code: "POR", name: "Portugal", group: "K", initialElo: resolveInitialElo("POR", RANKINGS.Portugal) },
  { code: "COD", name: "DR Congo", group: "K", initialElo: resolveInitialElo("COD", RANKINGS["DR Congo"]) },
  { code: "UZB", name: "Uzbekistan", group: "K", initialElo: resolveInitialElo("UZB", RANKINGS.Uzbekistan) },
  { code: "COL", name: "Colombia", group: "K", initialElo: resolveInitialElo("COL", RANKINGS.Colombia) },
  { code: "ENG", name: "England", group: "L", initialElo: resolveInitialElo("ENG", RANKINGS.England) },
  { code: "CRO", name: "Croatia", group: "L", initialElo: resolveInitialElo("CRO", RANKINGS.Croatia) },
  { code: "GHA", name: "Ghana", group: "L", initialElo: resolveInitialElo("GHA", RANKINGS.Ghana) },
  { code: "PAN", name: "Panama", group: "L", initialElo: resolveInitialElo("PAN", RANKINGS.Panama) },
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