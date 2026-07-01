import { useEffect, useState } from "react";
import { getMoversForSport, type Mover, type SportKey } from "../../lib/snapshots";
import s from "./DailyMovers.module.css";

type Props = {
  sport: SportKey;
  teamNames: Record<string, string>;
  limit?: number;        // 1 for home page card, 6 for sport-tab view
  title?: string;
  compact?: boolean;      // smaller styling for home page single-card use
};

export function DailyMovers({ sport, teamNames, limit = 6, title = "Today's Movers", compact = false }: Props) {
  const [movers, setMovers] = useState<Mover[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    getMoversForSport(sport, teamNames, "champion_pct", limit)
      .then((m) => { if (active) setMovers(m); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [sport, limit]);

  if (error) return null;
  if (movers === null) return <div className={s.loading}>Loading movers...</div>;
  if (movers.length === 0) {
    return (
      <div className={compact ? s.compactEmpty : s.empty}>
        Not enough history yet — check back tomorrow.
      </div>
    );
  }

  if (compact) {
    // Single biggest mover, home page card style
    const m = movers[0];
    const isUp = m.delta >= 0;
    return (
      <div className={s.compactCard}>
        <div className={s.compactLabel}>{title}</div>
        <div className={s.compactTeam}>{m.teamName}</div>
        <div className={`${s.compactDelta} ${isUp ? s.up : s.down}`}>
          {isUp ? "↑" : "↓"} {Math.abs(m.delta).toFixed(1)} pp
        </div>
        {m.reason && <div className={s.compactReason}>{m.reason}</div>}
      </div>
    );
  }

  return (
    <section className={s.panel}>
      <div className={s.header}>
        <h2>{title}</h2>
        <span>Since last update</span>
      </div>
      <div className={s.list}>
        {movers.map((m) => {
          const isUp = m.delta >= 0;
          return (
            <div className={s.row} key={m.teamCode}>
              <span className={s.teamName}>{m.teamName}</span>
              <span className={s.values}>
                <span className={s.prevVal}>{m.previousValue.toFixed(1)}%</span>
                <span className={s.arrow}>→</span>
                <span className={s.currVal}>{m.currentValue.toFixed(1)}%</span>
              </span>
              <span className={`${s.delta} ${isUp ? s.up : s.down}`}>
                {isUp ? "+" : ""}{m.delta.toFixed(1)} pp
              </span>
              {m.reason && <span className={s.reason}>{m.reason}</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}