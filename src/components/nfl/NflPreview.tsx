import { useMemo } from "react";
import { buildNflTeams, fullTeamName } from "../../data/nfl/nflLive";
import forecastData from "../../data/nfl/forecast-2026.json";
import type { TabId } from "../../data/worldCup";
import s from "./NflPreview.module.css";

type Props = {
  onNavigate: (tab: TabId) => void;
};

export function NflPreview({ onNavigate }: Props) {
  const topTeams = useMemo(() => buildNflTeams().slice(0, 3), []);
  const topForecast = useMemo(
    () => [...forecastData.forecasts].sort((a, b) => b.superBowlPct - a.superBowlPct)[0],
    [],
  );

  return (
    <section className={s.card}>
      <div className={s.header}>
        <div className={s.kicker}>NFL · Preseason</div>
        <button type="button" className={s.link} onClick={() => onNavigate("nflForecasts")}>
          See full coverage →
        </button>
      </div>
      <h3>Season Kicks Off September 9</h3>
      <div className={s.stat}>
        {fullTeamName(topForecast.code)} leads early Super Bowl odds at {topForecast.superBowlPct}%
        ({topForecast.projectedWins} projected wins).
      </div>
      <ol className={s.rankings}>
        {topTeams.map((t, i) => (
          <li key={t.code}>
            <span className={s.rank}>{i + 1}</span>
            <span>{t.city} {t.name}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}