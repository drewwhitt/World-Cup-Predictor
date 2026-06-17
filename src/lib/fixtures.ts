import type { GroupLetter, KnockoutMatchDef } from "./types";
import type { TeamCode } from "./types";

const NAME_TO_CODE: Record<string, TeamCode> = {
  Mexico: "MEX",
  "South Africa": "RSA",
  "South Korea": "KOR",
  "Czech Republic": "CZE",
  Canada: "CAN",
  "Bosnia & Herzegovina": "BIH",
  Qatar: "QAT",
  Switzerland: "SUI",
  Brazil: "BRA",
  Morocco: "MAR",
  Haiti: "HAI",
  Scotland: "SCO",
  USA: "USA",
  Paraguay: "PAR",
  Australia: "AUS",
  Turkey: "TUR",
  Germany: "GER",
  "Curaçao": "CUW",
  "Ivory Coast": "CIV",
  Ecuador: "ECU",
  Netherlands: "NED",
  Japan: "JPN",
  Sweden: "SWE",
  Tunisia: "TUN",
  Belgium: "BEL",
  Egypt: "EGY",
  Iran: "IRN",
  "New Zealand": "NZL",
  Spain: "ESP",
  "Cape Verde": "CPV",
  "Saudi Arabia": "KSA",
  Uruguay: "URU",
  France: "FRA",
  Senegal: "SEN",
  Iraq: "IRQ",
  Norway: "NOR",
  Argentina: "ARG",
  Algeria: "ALG",
  Austria: "AUT",
  Jordan: "JOR",
  Portugal: "POR",
  "DR Congo": "COD",
  Uzbekistan: "UZB",
  Colombia: "COL",
  England: "ENG",
  Croatia: "CRO",
  Ghana: "GHA",
  Panama: "PAN",
};

function groupFromLabel(label: string): GroupLetter {
  const match = label.match(/Group ([A-L])/);
  return (match?.[1] ?? "A") as GroupLetter;
}

function matchdayFromRound(round: string): number {
  const n = round.match(/\d+/);
  return n ? Number(n[0]) : 0;
}

export function buildGroupFixtures(raw: {
  matches: Array<{
    round: string;
    date: string;
    team1: string;
    team2: string;
    group?: string;
  }>;
}) {
  return raw.matches
    .filter((m) => m.group?.startsWith("Group"))
    .map((m, i) => {
      const home = NAME_TO_CODE[m.team1];
      const away = NAME_TO_CODE[m.team2];
      const group = groupFromLabel(m.group);
      return {
        id: `g-${group}-${i}`,
        group,
        home,
        away,
        date: m.date,
        matchday: matchdayFromRound(m.round),
        played: false,
      };
    });
}

export function buildKnockoutFixtures(raw: {
  matches: Array<{
    round: string;
    date: string;
    team1: string;
    team2: string;
    num?: number;
  }>;
}): KnockoutMatchDef[] {
  const rounds = ["Round of 32", "Round of 16", "Quarter-final", "Semi-final", "Final"] as const;
  return raw.matches
    .filter((m) => rounds.includes(m.round as (typeof rounds)[number]))
    .map((m) => ({
      id: m.num ? `ko-${m.num}` : `ko-${m.round.replace(/\s+/g, "-").toLowerCase()}`,
      round: m.round as KnockoutMatchDef["round"],
      homeSlot: m.team1,
      awaySlot: m.team2,
      date: m.date,
    }));
}
