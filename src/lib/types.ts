export type TeamCode =
  | "MEX" | "RSA" | "KOR" | "CZE"
  | "CAN" | "BIH" | "QAT" | "SUI"
  | "BRA" | "MAR" | "HAI" | "SCO"
  | "USA" | "PAR" | "AUS" | "TUR"
  | "GER" | "CUW" | "CIV" | "ECU"
  | "NED" | "JPN" | "SWE" | "TUN"
  | "BEL" | "EGY" | "IRN" | "NZL"
  | "ESP" | "CPV" | "KSA" | "URU"
  | "FRA" | "SEN" | "IRQ" | "NOR"
  | "ARG" | "ALG" | "AUT" | "JOR"
  | "POR" | "COD" | "UZB" | "COL"
  | "ENG" | "CRO" | "GHA" | "PAN";

export type GroupLetter = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L";

export interface Team {
  code: TeamCode;
  name: string;
  group: GroupLetter;
  initialElo: number;
}

export interface GroupMatch {
  id: string;
  group: GroupLetter;
  home: TeamCode;
  away: TeamCode;
  date: string;
  matchday: number;
  played: boolean;
  homeGoals?: number;
  awayGoals?: number;
  /**
   * True only when the "home" team is an actual 2026 host nation
   * (USA/MEX/CAN) playing in one of their own host cities. Used to apply
   * genuine host-nation Elo advantage rather than a flat bonus for
   * whichever team happens to be listed first in the fixture.
   */
  isHostMatch?: boolean;
}

export interface KnockoutMatchDef {
  id: string;
  round: "Round of 32" | "Round of 16" | "Quarter-final" | "Semi-final" | "Final";
  homeSlot: string;
  awaySlot: string;
  date: string;
}

export interface SimulationSettings {
  kFactor: number;
  homeAdvantage: number;
  simulations: number;
}

export interface TeamProbabilities {
  code: TeamCode;
  name: string;

  groupWin: number;
  groupSecond: number;
  groupThird: number;
  advanceFromGroup: number;
  advanceAsThird: number;

  roundOf32: number;
  roundOf16: number;
  quarterFinal: number;
  semiFinal: number;
  final: number;
  champion: number;
}

export interface SimulationResult {
  probabilities: TeamProbabilities[];
  knockoutMatchups: KnockoutMatchupProbability[];
  simulations: number;
  playedMatches: number;
}

export interface MatchPrediction {
  id: string;
  home: TeamCode;
  away: TeamCode;
  homeWin: number;
  draw: number;
  awayWin: number;
  label: string;
}

export interface MatchScore {
  homeGoals: number;
  awayGoals: number;
  /**
   * Set only for knockout matches that finished level after 90 (or extra time)
   * and were decided on penalties. "home" or "away" — whichever side won the
   * shootout. Leave undefined for matches with a clear winner in regulation.
   */
  penaltyWinner?: "home" | "away";
}

export interface StoredResults {
  matches: Record<string, MatchScore>;           // group stage: key = match id
  knockoutMatches?: Record<string, MatchScore>;  // knockout: key = "ko-73" etc
}
export interface KnockoutMatchupProbability {
  id: string;
  round: KnockoutMatchDef["round"];
  teamA: TeamCode;
  teamB: TeamCode;
  /** How often teamA and teamB specifically met in this bracket slot, across all simulations. */
  probability: number;
  /** Whichever team won most often *when teamA and teamB met in this exact slot* (not their overall title odds). */
  projectedWinner: TeamCode;
  /** projectedWinner's win rate conditional on this exact pairing occurring, i.e. wins / timesTheyMet. */
  winnerProbability: number;
}