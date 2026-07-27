import { useMemo } from "react";
import type { TabId } from "../../data/worldCup";
import { fullTeamName } from "../../data/nfl/nflLive";
import forecastData from "../../data/nfl/forecast-2026.json";
import { NflSubNav } from "../../components/nfl/NflSubNav";
import s from "./NFLForecastsView.module.css";

type Props = {
  onNavigate: (tab: TabId) => void;
};

export function NFLForecastsView({ onNavigate }: Props) {
  const forecasts = useMemo(() => [...forecastData.forecasts].sort((a, b) => b.superBowlPct - a.superBowlPct), []);

  return (
    <>
      <NflSubNav active="nflForecasts" onNavigate={onNavigate} />

      <section className={s.header}>
        <h1>2026 Season Forecast</h1>
        <p>
          {forecastData.simulations.toLocaleString()} simulated seasons, including real playoff seeding (division
          winners, wildcards, tiebreakers) and the actual bracket. Built from the preseason Elo baseline — there's
          no real 2026 result in here yet, so treat this as a starting point that will move once games are played.
        </p>
      </section>

      <section className={s.section}>
        <div className={s.tableHeader}>
          <span className={s.colTeam}>Team</span>
          <span>Proj. Wins</span>
          <span>Playoffs</span>
          <span>Division</span>
          <span>Conf. Champ</span>
          <span>Super Bowl</span>
        </div>
        {forecasts.map((f, i) => (
          <div className={s.row} key={f.code}>
            <span className={s.colTeam}>
              <span className={s.rank}>{i + 1}</span>
              {fullTeamName(f.code)}
            </span>
            <span className={s.num}>{f.projectedWins}</span>
            <span className={s.num}>{f.playoffPct}%</span>
            <span className={s.num}>{f.divisionPct}%</span>
            <span className={s.num}>{f.conferencePct}%</span>
            <span className={s.numStrong}>{f.superBowlPct}%</span>
          </div>
        ))}
      </section>
    </>
  );
}