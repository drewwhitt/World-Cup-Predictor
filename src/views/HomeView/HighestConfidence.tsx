import { useMemo } from "react";
import { getUpcomingKnockoutOdds } from "../../lib/drivers";
import type { StoredResults } from "../../lib/types";
import s from "./HighestConfidence.module.css";

type Props = {
  stored: StoredResults;
};

export function HighestConfidence({ stored }: Props) {
  // Only real, already-resolved matchups (both participants known from
  // actual results) — never a hypothetical or projected-forward pairing.
  const items = useMemo(() => {
    return getUpcomingKnockoutOdds(stored)
      .map((m) => {
        const favoredHome = m.homeAdvance >= m.awayAdvance;
        const prob = Number(((favoredHome ? m.homeAdvance : m.awayAdvance) * 100).toFixed(1));
        const favoredName = favoredHome ? m.homeName : m.awayName;
        return {
          key: `${m.homeCode}-${m.awayCode}`,
          matchup: m.label,
          prob,
          favoredName,
          note: `Veridex projects ${favoredName} to advance in ${prob}% of the 10,000 simulated outcomes for this matchup.`,
        };
      })
      .sort((a, b) => b.prob - a.prob)
      .slice(0, 2);
  }, [stored]);

  if (items.length === 0) return null;

  return (
    <section className={s.section}>
      <div className={s.header}>
        <h2>Today's Highest Confidence</h2>
        <span>Top Tier Forecasts</span>
      </div>
      <div className={s.grid}>
        {items.map((item) => (
          <article className={s.card} key={item.key}>
            <div className={s.top}>
              <div className={s.context}>Knockout Stage</div>
              <div className={s.matchup}>{item.matchup}</div>
            </div>
            <div className={s.probRow}>
              <div className={s.prob}>{item.prob}%</div>
              <div className={s.probLabel}>Win Prob.</div>
            </div>
            <div className={s.bar}>
              <div className={s.barFill} style={{ width: `${item.prob}%` }} />
            </div>
            <p className={s.note}>{item.note}</p>
          </article>
        ))}
      </div>
    </section>
  );
}