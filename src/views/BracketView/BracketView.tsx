import { useMemo } from "react";
import { DEFAULT_SETTINGS, GROUP_MATCHES, KNOCKOUT_MATCHES } from "../../data";
import { computeElosFromResults, runSimulation } from "../../lib/simulate";
import { TEAM_BY_CODE } from "../../lib/teams";
import type { StoredResults, TeamCode } from "../../lib/types";
import s from "./BracketView.module.css";

type Props = { stored: StoredResults };



type MatchResult = {
  homeCode: TeamCode | null;
  awayCode: TeamCode | null;
  homeWin: number;
  awayWin: number;
  predCode: TeamCode | null; // predicted winner
};

export function BracketView({ stored }: Props) {
  const { matchPreds, champCode, champPct } = useMemo(() => {
    const playedMatches = GROUP_MATCHES.map((m) => {
      const r = stored.matches[m.id];
      return r ? { ...m, played: true, homeGoals: r.homeGoals, awayGoals: r.awayGoals } : m;
    });

    const sim = runSimulation(playedMatches, KNOCKOUT_MATCHES, DEFAULT_SETTINGS);
    const elos = computeElosFromResults(playedMatches, DEFAULT_SETTINGS);

    // Build a map: sorted team pair + round → most frequent matchup probability
    // knockoutMatchups gives us (teamA, teamB, round, probability)
    // We use this to find the most likely teams per bracket slot
    type MU = { teamA: TeamCode; teamB: TeamCode; probability: number };
    const byRound: Record<string, MU[]> = {
      "Round of 32": [], "Round of 16": [], "Quarter-final": [], "Semi-final": [], "Final": []
    };
    for (const mu of sim.knockoutMatchups) {
      if (byRound[mu.round]) byRound[mu.round].push(mu);
    }

    // Sort each round by probability descending (most likely matchups first)
    for (const r of Object.keys(byRound)) {
      byRound[r].sort((a, b) => b.probability - a.probability);
    }

    function getWinProb(home: TeamCode, away: TeamCode): { homeWin: number; awayWin: number } {
      const diff = (elos[home] ?? 1500) - (elos[away] ?? 1500);
      const homeWin = 1 / (1 + Math.pow(10, -diff / 400));
      return { homeWin, awayWin: 1 - homeWin };
    }

    // For each bracket position, find the most likely teams from simulation
    // R32: use top matchup from simulation for that bracket pair
    // We assign matchups to bracket slots by matching probability rank to position
    const r32Sorted = [...byRound["Round of 32"]].sort((a, b) => b.probability - a.probability);
    const r16Sorted = [...byRound["Round of 16"]].sort((a, b) => b.probability - a.probability);
    const qfSorted  = [...byRound["Quarter-final"]].sort((a, b) => b.probability - a.probability);
    const sfSorted  = [...byRound["Semi-final"]].sort((a, b) => b.probability - a.probability);
    const finSorted = [...byRound["Final"]].sort((a, b) => b.probability - a.probability);

    function muToResult(mu: MU | undefined): MatchResult {
      if (!mu) return { homeCode: null, awayCode: null, homeWin: 0.5, awayWin: 0.5, predCode: null };
      const { homeWin, awayWin } = getWinProb(mu.teamA, mu.teamB);
      return {
        homeCode: mu.teamA,
        awayCode: mu.teamB,
        homeWin,
        awayWin,
        predCode: homeWin >= awayWin ? mu.teamA : mu.teamB,
      };
    }

    // Assign 16 R32 matches to the 8 bracket pairs (2 R32 → 1 R16 → 1 QF)
    // Left half uses slots 0–7, right half 8–15
    const r32Results = r32Sorted.slice(0, 16).map(muToResult);
    const r16Results = r16Sorted.slice(0, 8).map(muToResult);
    const qfResults  = qfSorted.slice(0, 4).map(muToResult);
    const sfResults  = sfSorted.slice(0, 2).map(muToResult);
    const finResult  = muToResult(finSorted[0]);

    const champRow = [...sim.probabilities].sort((a, b) => b.champion - a.champion)[0];

    return {
      matchPreds: { r32: r32Results, r16: r16Results, qf: qfResults, sf: sfResults, fin: finResult },
      champCode: champRow?.code ?? null,
      champPct: champRow ? (champRow.champion * 100).toFixed(1) : "0",
    };
  }, [stored]);

  const { r32, r16, qf, sf, fin } = matchPreds;

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

      <div className={s.bracketOuter}>
        {/* ── LEFT HALF ─────────────────────────── */}
        <div className={s.halfLeft}>
          <div className={s.roundCol}>
            <div className={s.roundLabel}>Round of 32</div>
            <div className={s.r32col}>
              {r32.slice(0, 8).map((m, i) => (
                <MatchSlot key={i} match={m} size="sm" />
              ))}
            </div>
          </div>
          <div className={s.roundCol}>
            <div className={s.roundLabel}>Round of 16</div>
            <div className={s.r16col}>
              {r16.slice(0, 4).map((m, i) => (
                <MatchSlot key={i} match={m} size="sm" />
              ))}
            </div>
          </div>
          <div className={s.roundCol}>
            <div className={s.roundLabel}>Quarterfinals</div>
            <div className={s.qfcol}>
              {qf.slice(0, 2).map((m, i) => (
                <MatchSlot key={i} match={m} size="md" />
              ))}
            </div>
          </div>
          <div className={s.roundCol}>
            <div className={s.roundLabel}>Semifinals</div>
            <div className={s.sfcol}>
              <MatchSlot match={sf[0]} size="md" />
            </div>
          </div>
        </div>

        {/* ── FINAL ─────────────────────────────── */}
        <div className={s.finalCol}>
          <div className={s.roundLabel}>Final</div>
          <div className={s.finalWrap}>
            <MatchSlot match={fin} size="lg" />
            {champCode && (
              <div className={s.champTeam}>
                🏆 {TEAM_BY_CODE[champCode]?.name}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT HALF ────────────────────────── */}
        <div className={s.halfRight}>
          <div className={s.roundCol}>
            <div className={s.roundLabel}>Semifinals</div>
            <div className={s.sfcol}>
              <MatchSlot match={sf[1]} size="md" />
            </div>
          </div>
          <div className={s.roundCol}>
            <div className={s.roundLabel}>Quarterfinals</div>
            <div className={s.qfcol}>
              {qf.slice(2, 4).map((m, i) => (
                <MatchSlot key={i} match={m} size="md" />
              ))}
            </div>
          </div>
          <div className={s.roundCol}>
            <div className={s.roundLabel}>Round of 16</div>
            <div className={s.r16col}>
              {r16.slice(4, 8).map((m, i) => (
                <MatchSlot key={i} match={m} size="sm" />
              ))}
            </div>
          </div>
          <div className={s.roundCol}>
            <div className={s.roundLabel}>Round of 32</div>
            <div className={s.r32col}>
              {r32.slice(8, 16).map((m, i) => (
                <MatchSlot key={i} match={m} size="sm" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MatchSlot({ match, size }: { match: MatchResult; size: "sm" | "md" | "lg" }) {
  const home = match.homeCode ? TEAM_BY_CODE[match.homeCode] : null;
  const away = match.awayCode ? TEAM_BY_CODE[match.awayCode] : null;
  const homePct = (match.homeWin * 100).toFixed(0);
  const awayPct = (match.awayWin * 100).toFixed(0);
  const homeFav = match.homeWin >= match.awayWin;

  return (
    <div className={`${s.matchCard} ${s[size]}`}>
      <div className={`${s.team} ${homeFav ? s.fav : ""}`}>
        <span className={s.teamName}>{home?.name ?? "TBD"}</span>
        <span className={s.pct}>{home ? `${homePct}%` : "—"}</span>
      </div>
      <div className={s.divider} />
      <div className={`${s.team} ${!homeFav ? s.fav : ""}`}>
        <span className={s.teamName}>{away?.name ?? "TBD"}</span>
        <span className={s.pct}>{away ? `${awayPct}%` : "—"}</span>
      </div>
      <div className={s.bar}>
        <div className={s.barFill} style={{ width: `${homePct}%` }} />
      </div>
    </div>
  );
}