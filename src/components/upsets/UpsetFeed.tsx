import { TEAM_BY_CODE } from "../../lib/teams";
import { matchOutcomeProbabilities } from "../../lib/elo";
import { computeElosFromResults } from "../../lib/simulate";
import { GROUP_MATCHES, DEFAULT_SETTINGS } from "../../data";
import type { StoredResults, TeamCode } from "../../lib/types";
import s from "./UpsetFeed.module.css";

const R32_MATCHUPS: Array<{ id: string; home: TeamCode; away: TeamCode }> = [
  { id: "ko-73", home: "GER", away: "PAR" },
  { id: "ko-74", home: "FRA", away: "SWE" },
  { id: "ko-75", home: "RSA", away: "CAN" },
  { id: "ko-76", home: "NED", away: "MAR" },
  { id: "ko-77", home: "POR", away: "CRO" },
  { id: "ko-78", home: "ESP", away: "AUT" },
  { id: "ko-79", home: "USA", away: "BIH" },
  { id: "ko-80", home: "BEL", away: "SEN" },
  { id: "ko-81", home: "BRA", away: "JPN" },
  { id: "ko-82", home: "CIV", away: "NOR" },
  { id: "ko-83", home: "MEX", away: "ECU" },
  { id: "ko-84", home: "ENG", away: "COD" },
  { id: "ko-85", home: "ARG", away: "CPV" },
  { id: "ko-86", home: "AUS", away: "EGY" },
  { id: "ko-87", home: "SUI", away: "ALG" },
  { id: "ko-88", home: "COL", away: "GHA" },
];

function getRound(id: string): string {
  const n = parseInt(id.replace("ko-", ""));
  if (n <= 88) return "Round of 32";
  if (n <= 96) return "Round of 16";
  if (n <= 100) return "Quarterfinals";
  if (n <= 102) return "Semifinals";
  return "Final";
}

type Props = { stored: StoredResults; limit?: number };

export function UpsetFeed({ stored, limit = 5 }: Props) {
  const playedMatches = GROUP_MATCHES.map((m) => {
    const r = stored.matches[m.id];
    return r ? { ...m, played: true, homeGoals: r.homeGoals, awayGoals: r.awayGoals } : m;
  });
  const elos = computeElosFromResults(playedMatches, DEFAULT_SETTINGS);

  const results: Array<{
    id: string;
    winner: TeamCode;
    loser: TeamCode;
    winnerPct: number;
    score: string;
    isUpset: boolean;
    upsetSeverity: number;
    round: string;
  }> = [];

  for (const m of R32_MATCHUPS) {
    const result = stored.knockoutMatches?.[m.id];
    if (!result) continue;

    const probs = matchOutcomeProbabilities(
      elos[m.home] ?? 1500,
      elos[m.away] ?? 1500,
      0,
    );
    const total = probs.homeWin + probs.awayWin + probs.draw;
    const homeWinPct = probs.homeWin / total;

    let winner: TeamCode, loser: TeamCode;
    if (result.homeGoals > result.awayGoals || result.penaltyWinner === "home") {
      winner = m.home; loser = m.away;
    } else {
      winner = m.away; loser = m.home;
    }

    const winnerPct = winner === m.home ? homeWinPct : 1 - homeWinPct;
    const isUpset = winnerPct < 0.5;
    const upsetSeverity = isUpset ? Math.round((0.5 - winnerPct) * 200) : 0;
    const score = result.penaltyWinner
      ? `${result.homeGoals}–${result.awayGoals} (pens)`
      : `${result.homeGoals}–${result.awayGoals}`;

    results.push({
      id: m.id, winner, loser,
      winnerPct: Math.round(winnerPct * 100),
      score, isUpset, upsetSeverity,
      round: getRound(m.id),
    });
  }

  const upsets  = results.filter((r) => r.isUpset).sort((a, b) => b.upsetSeverity - a.upsetSeverity);
  const correct = results.filter((r) => !r.isUpset);

  if (results.length === 0) return null;

  const display = [...upsets, ...correct].slice(0, limit);

  return (
    <section className={s.panel}>
      <header className={s.header}>
        <div className={s.eyebrow}>Model Transparency</div>
        <div className={s.titleRow}>
          <h2>Predictions vs Results</h2>
          <div className={s.summary}>
            <span className={s.correctCount}>✓ {correct.length} correct</span>
            <span className={s.dot}>·</span>
            <span className={s.upsetCount}>{upsets.length} upset{upsets.length !== 1 ? "s" : ""}</span>
            <span className={s.dot}>·</span>
            <span className={s.acc}>{Math.round((correct.length / results.length) * 100)}% accuracy</span>
          </div>
        </div>
      </header>
      <div className={s.list}>
        {display.map((r) => (
          <div key={r.id} className={`${s.row} ${r.isUpset ? s.upsetRow : s.correctRow}`}>
            <div className={s.badge}>
              {r.isUpset
                ? <span className={s.upsetBadge}>UPSET</span>
                : <span className={s.correctBadge}>✓</span>}
            </div>
            <div className={s.info}>
              <div className={s.teams}>
                <strong>{TEAM_BY_CODE[r.winner]?.name}</strong>
                <span className={s.score}>{r.score}</span>
                <span className={s.loser}>{TEAM_BY_CODE[r.loser]?.name}</span>
              </div>
              <div className={s.sub}>
                <span className={s.round}>{r.round}</span>
                <span className={s.dot}>·</span>
                <span className={r.isUpset ? s.upsetSub : s.correctSub}>
                  {TEAM_BY_CODE[r.winner]?.name} had {r.winnerPct}% pre-match
                  {r.isUpset && (r.winnerPct < 25 ? " — major upset" : r.winnerPct < 40 ? " — upset" : " — mild upset")}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}