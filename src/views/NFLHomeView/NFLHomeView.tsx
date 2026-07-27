import { useMemo } from "react";
import { buildNflTeams, fullTeamName, NFL_SCHEDULE } from "../../data/nfl/nflLive";
import { predictNFLMatch } from "../../lib/engine/sports/NFL";
import s from "./NFLHomeView.module.css";

export function NFLHomeView() {
  const teams = useMemo(() => buildNflTeams(), []);

  const week1Projections = useMemo(() => {
    const eloByCode = new Map(teams.map((t) => [t.code, t.elo]));
    return NFL_SCHEDULE.filter((g) => g.type === "REG" && g.week === 1)
      .map((g) => {
        const homeElo = eloByCode.get(g.home) ?? 1505;
        const awayElo = eloByCode.get(g.away) ?? 1505;
        const probs = predictNFLMatch(homeElo, awayElo, { isDivisional: g.div });
        return { ...g, homeWin: probs.homeWin };
      })
      .sort((a, b) => Math.abs(a.homeWin - 0.5) - Math.abs(b.homeWin - 0.5));
  }, [teams]);

  return (
    <>
      <section className={s.hero}>
        <div className={s.kicker}>NFL · 2026 Season</div>
        <h1>Season Kicks Off September 9</h1>
        <p>
          These are preseason projections — derived from real 1999–2025 results (via nflverse), with
          each team's rating reverted toward the league mean for a new season. Nothing here reflects
          a 2026 game that's actually been played yet.
        </p>
      </section>

      <section className={s.section}>
        <div className={s.header}>
          <h2>Preseason Power Rankings</h2>
          <span>By Elo</span>
        </div>
        <ol className={s.rankings}>
          {teams.slice(0, 10).map((t, i) => (
            <li key={t.code}>
              <span className={s.rank}>{i + 1}</span>
              <span className={s.team}>{t.city} {t.name}</span>
              <span className={s.rating}>{t.rating}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className={s.section}>
        <div className={s.header}>
          <h2>Week 1 — Closest Projections</h2>
          <span>Preseason model</span>
        </div>
        <div className={s.games}>
          {week1Projections.slice(0, 6).map((g) => {
            const homePct = Math.round(g.homeWin * 100);
            const favoredHome = g.homeWin >= 0.5;
            return (
              <article className={s.game} key={g.id}>
                <div className={s.matchup}>
                  {fullTeamName(g.away)} <span className={s.at}>at</span> {fullTeamName(g.home)}
                </div>
                <div className={s.date}>{g.date}{g.neutral ? " · Neutral site" : ""}{g.div ? " · Divisional" : ""}</div>
                <div className={s.prob}>
                  {favoredHome ? fullTeamName(g.home) : fullTeamName(g.away)} favored, {favoredHome ? homePct : 100 - homePct}%
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}