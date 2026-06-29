import { useMemo } from "react";
import { DEFAULT_SETTINGS, GROUP_MATCHES, KNOCKOUT_MATCHES } from "../../data";
import { computeElosFromResults, runSimulation } from "../../lib/simulate";
import { TEAM_BY_CODE } from "../../lib/teams";
import type { StoredResults, TeamCode } from "../../lib/types";
import s from "./BracketView.module.css";

type Props = {
  stored: StoredResults;
};

type BracketMatch = {
  id: string;
  round: string;
  homeCode: TeamCode | null;
  awayCode: TeamCode | null;
  homeWin: number;   // probability 0–1
  awayWin: number;
  draw: number;
  isConfirmed: boolean;
  winnerCode: TeamCode | null;
};

const ROUND_ORDER = [
  "Round of 32",
  "Round of 16",
  "Quarter-final",
  "Semi-final",
  "Final",
];

const ROUND_LABELS: Record<string, string> = {
  "Round of 32": "Round of 32",
  "Round of 16": "Round of 16",
  "Quarter-final": "Quarterfinals",
  "Semi-final": "Semifinals",
  "Final": "Final",
};

function flag(code: string): string {
  // Convert team code to a readable abbreviation for display
  return code;
}

export function BracketView({ stored }: Props) {
  const { matchesByRound, champCode, champPct } = useMemo(() => {
    const playedMatches = GROUP_MATCHES.map((m) => {
      const r = stored.matches[m.id];
      return r ? { ...m, played: true, homeGoals: r.homeGoals, awayGoals: r.awayGoals } : m;
    });

    const sim = runSimulation(playedMatches, KNOCKOUT_MATCHES, DEFAULT_SETTINGS);
    const elos = computeElosFromResults(playedMatches, DEFAULT_SETTINGS);

    // Build most-likely bracket from simulation matchups
    // Group matchups by round
    const byRound: Record<string, BracketMatch[]> = {};
    for (const round of ROUND_ORDER) byRound[round] = [];

    // For each knockout matchup probability, pick most likely matchup per slot
    // Group by round, deduplicate by team pair
    const seen = new Set<string>();
    for (const mu of sim.knockoutMatchups) {
      const key = [mu.teamA, mu.teamB].sort().join("_") + "_" + mu.round;
      if (seen.has(key)) continue;
      seen.add(key);

      const homeElo = elos[mu.teamA] ?? 1500;
      const awayElo = elos[mu.teamB] ?? 1500;
      const diff = homeElo - awayElo;
      const homeWin = 1 / (1 + Math.pow(10, -diff / 400));
      const draw = 0.05; // small draw chance in knockout (pens)
      const awayWin = 1 - homeWin - draw;

      if (byRound[mu.round]) {
        byRound[mu.round].push({
          id: key,
          round: mu.round,
          homeCode: mu.teamA,
          awayCode: mu.teamB,
          homeWin,
          awayWin: Math.max(0, awayWin),
          draw,
          isConfirmed: false,
          winnerCode: homeWin > 0.5 ? mu.teamA : mu.teamB,
        });
      }
    }

    // Limit to expected match counts per round
    const counts: Record<string, number> = {
      "Round of 32": 16,
      "Round of 16": 8,
      "Quarter-final": 4,
      "Semi-final": 2,
      "Final": 1,
    };
    for (const round of ROUND_ORDER) {
      byRound[round] = byRound[round]
        .sort((a, b) => b.homeWin + b.awayWin - a.homeWin - a.awayWin)
        .slice(0, counts[round]);
    }

    // Find champion
    const champRow = [...sim.probabilities].sort((a, b) => b.champion - a.champion)[0];
    const champCode = champRow?.code ?? null;
    const champPct = champRow ? (champRow.champion * 100).toFixed(1) : "0";

    return { matchesByRound: byRound, champCode, champPct };
  }, [stored]);

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div className={s.eyebrow}>Veridex Model · 10,000 Simulations</div>
        <h1 className={s.title}>Tournament Bracket</h1>
        {champCode && (
          <div className={s.champBanner}>
            <span className={s.champLabel}>Most likely champion</span>
            <span className={s.champName}>{TEAM_BY_CODE[champCode]?.name ?? champCode}</span>
            <span className={s.champOdds}>{champPct}%</span>
          </div>
        )}
      </div>

      <div className={s.bracket}>
        {ROUND_ORDER.map((round) => {
          const matches = matchesByRound[round] ?? [];
          if (matches.length === 0) return null;
          return (
            <div key={round} className={s.roundCol}>
              <div className={s.roundLabel}>{ROUND_LABELS[round]}</div>
              <div className={s.matchList}>
                {matches.map((match) => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatchCard({ match }: { match: BracketMatch }) {
  const home = match.homeCode ? TEAM_BY_CODE[match.homeCode] : null;
  const away = match.awayCode ? TEAM_BY_CODE[match.awayCode] : null;
  const homePct = (match.homeWin * 100).toFixed(0);
  const awayPct = (match.awayWin * 100).toFixed(0);
  const homeFav = match.homeWin >= match.awayWin;

  return (
    <div className={s.matchCard}>
      <div className={`${s.team} ${homeFav ? s.favorite : ""}`}>
        <span className={s.code}>{home ? flag(home.code) : "TBD"}</span>
        <span className={s.teamName}>{home?.name ?? "TBD"}</span>
        <span className={s.pct}>{home ? `${homePct}%` : "—"}</span>
      </div>
      <div className={s.vs}>vs</div>
      <div className={`${s.team} ${!homeFav ? s.favorite : ""}`}>
        <span className={s.code}>{away ? flag(away.code) : "TBD"}</span>
        <span className={s.teamName}>{away?.name ?? "TBD"}</span>
        <span className={s.pct}>{away ? `${awayPct}%` : "—"}</span>
      </div>
      <div className={s.bar}>
        <div
          className={s.barHome}
          style={{ width: `${homePct}%` }}
        />
      </div>
    </div>
  );
}
