import { useMemo } from "react";
import { GROUP_MATCHES } from "../../data";
import { TEAM_BY_CODE, TEAMS_BY_GROUP } from "../../lib/teams";
import { computeStandings, type StandingRow } from "../../lib/groups";
import { getRealR32Qualifiers } from "../../lib/bracketTree";
import type { StoredResults, GroupLetter } from "../../lib/types";
import s from "./StandingsView.module.css";

type Props = { stored: StoredResults };

/**
 * All 12 group tables, sorted by the same tie-break rules used everywhere
 * else in the app (computeStandings). Q marks the 8 best third-place
 * teams too, not just the automatic top-2 — matching the real 48-team
 * qualification rule, not a naive "top 2 per group" assumption.
 *
 * This is the World Cup's group-stage standings — separate from the
 * knockout Bracket tab, and separate from the Elo-based power Rankings
 * tab. As other leagues come online this is where their league tables
 * would live too.
 */
export function StandingsView({ stored }: Props) {
  const standings = useMemo(() => {
    const playedMatches = GROUP_MATCHES.map((m) => {
      const r = stored.matches[m.id];
      return r ? { ...m, played: true, homeGoals: r.homeGoals, awayGoals: r.awayGoals } : m;
    });
    return computeStandings(playedMatches);
  }, [stored]);

  const qualifiers = useMemo(() => getRealR32Qualifiers(), []);
  const groupLetters = Object.keys(TEAMS_BY_GROUP) as GroupLetter[];

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div className={s.eyebrow}>Veridex Model · Group Stage</div>
        <h1 className={s.title}>Standings</h1>
      </div>

      <div className={s.groupsGrid}>
        {groupLetters.map((letter) => {
          const rows = [...standings[letter]].sort(
            (a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf,
          );
          return (
            <div className={s.groupCard} key={letter}>
              <div className={s.groupCardHeader}>Group {letter}</div>
              <div className={s.groupTable}>
                <div className={s.groupTableHead}>
                  <span className={s.groupTeamCol}>Team</span>
                  <span>P</span><span>W</span><span>D</span><span>L</span><span>GD</span><span>Pts</span>
                </div>
                {rows.map((row: StandingRow) => (
                  <div
                    key={row.team}
                    className={qualifiers.has(row.team) ? `${s.groupRow} ${s.groupRowQualified}` : s.groupRow}
                  >
                    <span className={s.groupTeamCol}>
                      <span className={s.groupTeamName}>{TEAM_BY_CODE[row.team]?.name ?? row.team}</span>
                      {qualifiers.has(row.team) && <span className={s.qTag}>Q</span>}
                    </span>
                    <span>{row.played}</span>
                    <span>{row.won}</span>
                    <span>{row.drawn}</span>
                    <span>{row.lost}</span>
                    <span>{row.gd > 0 ? "+" : ""}{row.gd}</span>
                    <span>{row.points}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}