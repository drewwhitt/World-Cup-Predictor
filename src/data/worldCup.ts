export type Edition = "wire" | "desk";
export type TabId = "home" | "forecasts" | "rankings" | "bracket" | "match" | "sim" | "lab" | "insights";
export type SimOutcome = "home" | "draw" | "away";

export type Team = {
  name: string;
  code: string;
  group: string;
  baseline: number;
  current: number;
  rating: number;
  formStr: string;
  trend: number[];
};

export type Headline = {
  title: string;
  summary: string;
  metric: string;
  metricLabel: string;
  time: string;
  up: boolean;
};

export type MorningForecast = {
  riser: string;
  riserVal: string;
  riserNote: string;
  faller: string;
  fallerVal: string;
  fallerNote: string;
  matchName: string;
  matchNote: string;
  champ: string;
  champVal: string;
  champNote: string;
  upset: string;
  upsetVal: string;
  upsetNote: string;
  insight: string;
};

export type MatchCenterFactor = {
  title: string;
  favors: string;
  metric: string;
  explanation: string;
};

export type MatchCenter = {
  home: string;
  away: string;
  homeCode: string;
  awayCode: string;
  time: string;
  venue: string;
  homePct: string;
  drawPct: string;
  awayPct: string;
  homeOdd: string;
  drawOdd: string;
  awayOdd: string;
  xScore: string;
  upset: string;
  factors: MatchCenterFactor[];
  preview: string;
};

export type SimMatch = {
  id: string;
  label: string;
  home: string;
  away: string;
  eff: Record<SimOutcome, Record<string, number>>;
};

export type LabStep = {
  id: string;
  title: string;
  description: string;
};

export const navItems: Array<{ id: TabId; label: string; href?: string }> = [
  { id: "home", label: "Home" },
  { id: "forecasts", label: "Forecasts" },
  { id: "rankings", label: "Rankings" },
  { id: "bracket", label: "Bracket" },
  { id: "match", label: "Match Center" },
  { id: "sim", label: "What If?" },
  { id: "lab", label: "Model Lab" },
  { id: "insights", label: "Insights", href: "/insights/" },
];

export const sports = ["World Cup", "NFL", "NBA", "NHL", "MLB", "MLS", "Premier League", "Champions League"];

export const matchCenter: MatchCenter = {
  home: "France",
  away: "Brazil",
  homeCode: "FRA",
  awayCode: "BRA",
  time: "Today · 3:00 PM ET",
  venue: "MetLife Stadium, New Jersey · Group Stage MD 3",
  homePct: "32%",
  drawPct: "27%",
  awayPct: "41%",
  homeOdd: "32.4",
  drawOdd: "26.8",
  awayOdd: "40.8",
  xScore: "1.4 - 1.6",
  upset: "Moderate",
  factors: [
    { title: "Rest advantage", favors: "Brazil", metric: "+0.4 xG", explanation: "Brazil had one extra recovery day after Tuesday's early kickoff." },
    { title: "Squad availability", favors: "France", metric: "-0.6 xGA", explanation: "France missing first-choice center-back; back line reshuffled." },
    { title: "Recent xG trend", favors: "Brazil", metric: "+0.3 xG", explanation: "Brazil averaging 2.1 xG across the group stage, league-best." },
    { title: "Venue & travel", favors: "Neutral", metric: "-", explanation: "Neutral venue; both squads on equivalent travel load." },
  ],
  preview: "The Veridex model gives Brazil the edge in a marquee Group Stage finale, projecting a 41% win probability against France's 32%, with a 27% chance of a draw. Brazil's league-best expected-goals output and an extra day of rest tilt a tight matchup, though France's reshuffled defense remains the model's largest source of uncertainty. A French win would vault them past Brazil into the projected top two and reopen the race at the summit of Group B. Expect a cagey opening 30 minutes before Brazil's press begins to tell.",
};

export const simMatches: SimMatch[] = [
  { id: "m1", label: "France vs Brazil", home: "France", away: "Brazil", eff: { home: { France: 2.4, Brazil: -2.6 }, draw: { France: 0.4, Brazil: -0.6 }, away: { Brazil: 1.8, France: -1.6 } } },
  { id: "m2", label: "Spain vs USA", home: "Spain", away: "USA", eff: { home: { Spain: 0.6, USA: -0.4 }, draw: { Spain: -0.1, USA: 0.3 }, away: { USA: 1.9, Spain: -1.4 } } },
  { id: "m3", label: "England vs Germany", home: "England", away: "Germany", eff: { home: { England: 1.2, Germany: -1.0 }, draw: { England: 0.1, Germany: 0.1 }, away: { Germany: 1.3, England: -0.9 } } },
  { id: "m4", label: "Argentina vs Netherlands", home: "Argentina", away: "Netherlands", eff: { home: { Argentina: 1.1, Netherlands: -0.5 }, draw: { Argentina: -0.2, Netherlands: 0.4 }, away: { Netherlands: 1.6, Argentina: -1.3 } } },
];

export const labStats = [
  { label: "Brier score", value: "0.187" },
  { label: "Calibration", value: "96%" },
  { label: "Tournaments tested", value: "8" },
  { label: "Favorite hit rate", value: "71%" },
];

export const labSteps: LabStep[] = [
  { id: "01", title: "Ingest every result", description: "Final scores, expected goals, shot quality and lineup data flow in within minutes of full-time." },
  { id: "02", title: "Rate every team", description: "A blended power rating updates from Elo, xG differential, schedule strength and squad availability." },
  { id: "03", title: "Simulate the tournament", description: "The remaining schedule is played out 50,000 times, sampling each match from the rating-implied distribution." },
  { id: "04", title: "Calibrate & publish", description: "Probabilities are checked against historical calibration curves before the page updates." },
];

export const labInputs = ["Match results", "Expected goals (xG / xGA)", "Squad availability", "Travel & rest", "Historical form", "Market priors", "Set-piece efficiency", "Home advantage"];

export const labFaq = [
  { question: "Why don't the odds add up to 100%?", answer: "Probability is spread across all 48 entrants. The 16 contenders shown here account for roughly 95% of championship outcomes; the long tail holds the rest." },
  { question: "How often do the numbers change?", answer: "After every completed match, and on lineup news. Most updates move a favorite by less than a point - large swings are flagged in the Morning Forecast." },
  { question: "Is this a betting product?", answer: "No. Veridex publishes probabilistic forecasts and analysis. We don't offer odds, lines, or wagering of any kind." },
];

export const calibrationPoints = {
  predicted: [10, 20, 30, 40, 50, 60, 70, 80, 90],
  observed: [8, 19, 33, 38, 52, 58, 73, 79, 91],
};

export function contenderRows(source: Team[]) {
  const sorted = [...source].sort((a, b) => b.current - a.current);
  const maxCurrent = sorted[0]?.current ?? 1;

  return sorted.map((team, index) => {
    const delta = Number((team.current - team.baseline).toFixed(1));
    return {
      ...team,
      rank: String(index + 1).padStart(2, "0"),
      delta,
      baselineStr: `${team.baseline.toFixed(1)}%`,
      currentStr: `${team.current.toFixed(1)}%`,
      deltaStr: delta === 0 ? "-" : `${delta > 0 ? "+" : "-"}${Math.abs(delta).toFixed(1)} pp`,
      barPct: `${((team.current / maxCurrent) * 100).toFixed(1)}%`,
    };
  });
}