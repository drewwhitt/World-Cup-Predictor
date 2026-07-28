import { useMemo, useState } from "react";
import { buildNflMatchCenter, buildNflPeriodStatuses, NFL_PERIODS } from "../../data/nfl/nflLive";
import { getCurrentPeriodId } from "../../lib/periods";
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

  // Completion-based, same convention as Match Center: the "current" week
  // is the first one that isn't fully played out yet, not whatever the
  // calendar date says — matches the admin's sometimes-delayed result entry.
  const statuses = useMemo(() => buildNflPeriodStatuses(entries), [entries]);
  const currentPeriodId = useMemo(() => getCurrentPeriodId(NFL_PERIODS, statuses), [statuses]);

  // Only the current week starts open; every other week is collapsed so
  // the page isn't 272 games long by default. Toggling is manual after that.
  const [openPeriodId, setOpenPeriodId] = useState<string>(currentPeriodId);

  return (
    <>
      <section className={s.header}>
        <h1>2026 Schedule</h1>
        <p>All 272 games, as announced. Scores will appear here once results are entered.</p>
      </section>

      {NFL_PERIODS.map((period) => {
        const games = byPeriod.get(period.id) ?? [];
        if (games.length === 0) return null;
        const isOpen = openPeriodId === period.id;
        return (
          <section className={s.period} key={period.id}>
            <button
              type="button"
              className={s.periodToggle}
              aria-expanded={isOpen}
              onClick={() => setOpenPeriodId(isOpen ? "" : period.id)}
            >
              <h2>{period.label}</h2>
              <span className={s.chevron}>{isOpen ? "▾" : "▸"}</span>
            </button>
            {isOpen && (
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
            )}
          </section>
        );
      })}
    </>
  );
}