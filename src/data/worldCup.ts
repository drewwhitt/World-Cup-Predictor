export type Edition = "wire" | "desk";
export type TabId = "home" | "forecasts" | "rankings" | "match" | "sim" | "lab";
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

export const teams: Team[] = [
  { name: "Brazil", code: "BRA", group: "Group A", baseline: 23.2, current: 24.5, rating: 92.4, formStr: "WWWDW", trend: [21.0, 22.4, 23.2, 24.5] },
  { name: "France", code: "FRA", group: "Group B", baseline: 19.1, current: 18.9, rating: 91.0, formStr: "WWDWL", trend: [20.2, 19.6, 19.1, 18.9] },
  { name: "Argentina", code: "ARG", group: "Group C", baseline: 16.4, current: 16.7, rating: 90.2, formStr: "WDWWW", trend: [17.1, 16.0, 16.4, 16.7] },
  { name: "Spain", code: "ESP", group: "Group D", baseline: 9.6, current: 9.8, rating: 87.5, formStr: "WWWWD", trend: [8.4, 9.1, 9.6, 9.8] },
  { name: "Portugal", code: "POR", group: "Group A", baseline: 10.9, current: 9.3, rating: 86.1, formStr: "WLDWL", trend: [11.5, 11.2, 10.9, 9.3] },
  { name: "England", code: "ENG", group: "Group E", baseline: 6.8, current: 7.1, rating: 85.0, formStr: "DWWDW", trend: [6.1, 6.5, 6.8, 7.1] },
  { name: "Germany", code: "GER", group: "Group F", baseline: 4.9, current: 5.2, rating: 83.8, formStr: "WDWWW", trend: [4.2, 4.6, 4.9, 5.2] },
  { name: "Netherlands", code: "NED", group: "Group C", baseline: 3.6, current: 3.4, rating: 82.9, formStr: "DWLDW", trend: [3.9, 3.7, 3.6, 3.4] },
  { name: "USA", code: "USA", group: "Group B", baseline: 1.8, current: 2.1, rating: 79.4, formStr: "WWDWW", trend: [1.3, 1.5, 1.8, 2.1] },
  { name: "Belgium", code: "BEL", group: "Group F", baseline: 2.0, current: 1.8, rating: 80.1, formStr: "LWDWL", trend: [2.4, 2.2, 2.0, 1.8] },
  { name: "Uruguay", code: "URU", group: "Group D", baseline: 1.1, current: 1.2, rating: 78.6, formStr: "DWWLD", trend: [1.0, 1.1, 1.1, 1.2] },
  { name: "Croatia", code: "CRO", group: "Group E", baseline: 0.9, current: 1.0, rating: 77.9, formStr: "WDDWL", trend: [0.8, 0.9, 0.9, 1.0] },
  { name: "Colombia", code: "COL", group: "Group G", baseline: 0.8, current: 0.9, rating: 77.2, formStr: "WWDLW", trend: [0.7, 0.8, 0.8, 0.9] },
  { name: "Morocco", code: "MAR", group: "Group H", baseline: 0.7, current: 0.8, rating: 76.8, formStr: "DWWWD", trend: [0.6, 0.7, 0.7, 0.8] },
  { name: "Mexico", code: "MEX", group: "Group A", baseline: 0.5, current: 0.5, rating: 74.3, formStr: "DDWLD", trend: [0.6, 0.5, 0.5, 0.5] },
  { name: "Japan", code: "JPN", group: "Group G", baseline: 0.4, current: 0.5, rating: 73.9, formStr: "WDWWD", trend: [0.3, 0.4, 0.4, 0.5] },
];

export const hero = {
  title: "Brazil Reclaims World Cup Favorite Status After Matchday 2",
  sub: "The Veridex model ran 50,000 fresh simulations after Tuesday's results and now rates Brazil the tournament's most likely champion - its first time atop the table since the group-stage draw.",
  byline: "VERIDEX Analytics Desk · June 24, 2026 · 6:45 AM",
};

export const headlines: Headline[] = [
  { title: "Brazil Reclaims Favorite Status After Matchday 2 Surge", summary: "A clinical 3-0 over Serbia lifts Brazil to a tournament-high 24.5% title probability.", metric: "24.5%", metricLabel: "TITLE ODDS", time: "12 min ago", up: true },
  { title: "Portugal's Title Hopes Dip As Group A Tightens", summary: "A surprise draw drops Portugal 1.7 points - the field's biggest faller this update.", metric: "-1.7 pp", metricLabel: "CHANGE", time: "34 min ago", up: false },
  { title: "USA's Path To The Quarterfinals Widens", summary: "The model now gives the hosts a 61% chance of advancing from Group B.", metric: "61%", metricLabel: "ADVANCE", time: "1 hr ago", up: true },
  { title: "Spain Climbs Into The Top Four", summary: "Back-to-back clean sheets push Spain past Portugal into fourth on title odds.", metric: "9.8%", metricLabel: "TITLE ODDS", time: "2 hr ago", up: true },
  { title: "England's Defensive Concerns Persist Despite Win", summary: "Underlying xGA suggests England's back line remains a model liability.", metric: "7.1%", metricLabel: "TITLE ODDS", time: "3 hr ago", up: false },
  { title: "Germany Quietly Builds Momentum In Group F", summary: "Three straight overperformances on xG lift Germany into the top seven.", metric: "5.2%", metricLabel: "TITLE ODDS", time: "4 hr ago", up: true },
];

export const morningForecast: MorningForecast = {
  riser: "Brazil",
  riserVal: "+1.3 pp",
  riserNote: "to 24.5% title odds",
  faller: "Portugal",
  fallerVal: "-1.7 pp",
  fallerNote: "to 9.3% title odds",
  matchName: "France vs Brazil",
  matchNote: "Group B decider · 3:00 PM ET",
  champ: "Brazil",
  champVal: "24.5%",
  champNote: "most likely champion",
  upset: "USA over Spain",
  upsetVal: "19%",
  upsetNote: "highest-leverage upset risk today",
  insight: "Brazil's rise is driven less by results than by xG: it leads the field in expected goals while conceding the fewest big chances. The model treats that profile as more repeatable than France's narrow wins.",
};

export const breakingText = "Brazil reclaims #1 at 24.5% · Portugal slides 1.7pp after Group A draw · France vs Brazil kicks off 3:00 PM ET · Veridex model refreshed with 50,000 new simulations · USA's advance odds climb to 61%";

export const navItems: Array<{ id: TabId; label: string }> = [
  { id: "home", label: "Home" },
  { id: "forecasts", label: "Forecasts" },
  { id: "rankings", label: "Rankings" },
  { id: "match", label: "Match Center" },
  { id: "sim", label: "Simulations" },
  { id: "lab", label: "Model Lab" },
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

export function contenderRows() {
  const sorted = [...teams].sort((a, b) => b.current - a.current);
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
