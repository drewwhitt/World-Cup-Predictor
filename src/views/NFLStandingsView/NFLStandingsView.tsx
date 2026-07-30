import { useMemo } from "react";
import { buildNflStandings } from "../../data/nfl/nflLive";
import s from "./NFLStandingsView.module.css";

export function NFLStandingsView() {
  const divisions = useMemo(() => buildNflStandings(), []);

  return (
    <>
      <section className={s.header}>
        <h1>2026 Standings</h1>
        <p>
          Every team reads 0-0-0 today — there's no live NFL results pipeline yet (manual entry is the
          planned next step, same as the World Cup admin panel). Records will fill in by division as
          real scores come in.
        </p>
      </section>

      <div className={s.groupsGrid}>
        {divisions.map((div) => (
          <div className={s.groupCard} key={`${div.conference}-${div.division}`}>
            <div className={s.groupCardHeader}>{div.conference} {div.division}</div>
            <div className={s.groupTable}>
              <div className={s.groupTableHead}>
                <span className={s.groupTeamCol}>Team</span>
                <span>W</span><span>L</span><span>T</span><span>PCT</span>
              </div>
              {div.rows.map((row) => (
                <div className={s.groupRow} key={row.code}>
                  <span className={s.groupTeamCol}>
                    <span className={s.groupTeamName}>{row.code}</span>
                  </span>
                  <span>{row.wins}</span>
                  <span>{row.losses}</span>
                  <span>{row.ties}</span>
                  <span>{row.pct.toFixed(3).replace(/^0/, "")}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}