import { useMemo } from "react";
import { buildNflMatchCenter, NFL_PERIODS } from "../../data/nfl/nflLive";
import s from "./NFLScheduleView.module.css";

export function NFLScheduleView() {
  const entries = useMemo(() => buildNflMatchCenter(), []);

  const byPeriod = useMemo(() => {
    const map = new Map<string, typeof entries>();
    for (const entry of entries) {
      const list = map.get(entry.periodId) ?? [];
      list.push(entry);
      map.set(entry.periodId, list);
    }
    return map;
  }, [entries]);

  return (
    <>
      <section className={s.header}>
        <h1>2026 Schedule</h1>
        <p>All 272 games, as announced. Scores will appear here once results are entered.</p>
      </section>

      {NFL_PERIODS.map((period) => {
        const games = byPeriod.get(period.id) ?? [];
        if (games.length === 0) return null;
        return (
          <section className={s.period} key={period.id}>
            <h2>{period.label}</h2>
            <div className={s.list}>
              {games.map((g) => (
                <div className={s.row} key={g.id}>
                  <div className={s.date}>{g.date}</div>
                  <div className={s.matchup}>
                    {g.awayName} <span className={s.at}>at</span> {g.homeName}
                  </div>
                  <div className={s.tags}>
                    {g.div && <span className={s.tag}>Div</span>}
                    {g.neutral && <span className={s.tag}>Neutral</span>}
                  </div>
                  <div className={s.status}>
                    {g.played ? `${g.awayScore}–${g.homeScore}` : "Scheduled"}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}