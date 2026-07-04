import { TEAM_BY_CODE } from "../../lib/teams";
import { toAdvancementProbabilities } from "../../lib/elo";
import { computeElosFromResults } from "../../lib/simulate";
import { GROUP_MATCHES, DEFAULT_SETTINGS } from "../../data";
import { KNOCKOUT_STRUCTURE, resolveKnockoutMatch } from "../../lib/bracketTree";
import type { StoredResults, TeamCode } from "../../lib/types";
import s from "./UpsetFeed.module.css";

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

  // Every knockout match, R32 through Final — not just R32 — so R16 onward
  // (which start once the Round of 32 wraps up) actually get scored here
  // instead of being silently invisible in this feed.
  for (const id of Object.keys(KNOCKOUT_STRUCTURE)) {
    const result = stored.knockoutMatches?.[id];
    if (!result) continue;

    const { home, away, round } = resolveKnockoutMatch(id, stored);
    if (!home || !away || !round) continue; // shouldn't happen if a result was actually recorded

    // Same advancement probability the bracket uses — model base + penalty redistribution
    const { home: homeWinPct } = toAdvancementProbabilities(elos[home] ?? 1500, elos[away] ?? 1500, 0);

    let winner: TeamCode, loser: TeamCode;
    let winnerGoals: number, loserGoals: number;
    if (result.homeGoals > result.awayGoals || result.penaltyWinner === "home") {
      winner = home; loser = away;
      winnerGoals = result.homeGoals; loserGoals = result.awayGoals;
    } else {
      winner = away; loser = home;
      winnerGoals = result.awayGoals; loserGoals = result.homeGoals;
    }

    const winnerPct = winner === home ? homeWinPct : 1 - homeWinPct;
    const isUpset = winnerPct < 0.5;
    const upsetSeverity = isUpset ? Math.round((0.5 - winnerPct) * 200) : 0;
    const score = result.penaltyWinner
      ? `${winnerGoals}–${loserGoals} (pens)`
      : `${winnerGoals}–${loserGoals}`;

    results.push({
      id, winner, loser,
      winnerPct: Math.round(winnerPct * 100),
      score, isUpset, upsetSeverity,
      round,
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