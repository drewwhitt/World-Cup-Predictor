import { type Headline, type MorningForecast as MorningForecastData, type Team } from "../../data/worldCup";
import { DailyMovers } from "../../components/movers/DailyMovers";
import { TEAM_BY_CODE } from "../../lib/teams";
import type { StoredResults } from "../../lib/types";
import { Hero } from "./Hero";
import { HeadlineCard } from "./HeadlineCard";
import { MorningForecast } from "./MorningForecast";
import { QuickStrip } from "./QuickStrip";
import { FavoritesStrip } from "./FavoritesStrip";
import { HighestConfidence } from "./HighestConfidence";
import { ConfidenceAlert } from "./ConfidenceAlert";
import s from "./HomeView.module.css";

type Props = {
  teams: Team[];
  morning: MorningForecastData;
  headlines: Headline[];
  playedCount: number;
  stored: StoredResults;
  onNavigateToRankings?: () => void;
};

const TEAM_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(TEAM_BY_CODE).map(([code, t]) => [code, t.name]),
);

export function HomeView({
  teams,
  morning,
  headlines,
  playedCount,
  stored,
  onNavigateToRankings,
}: Props) {
  // The Confidence Alert card reuses the top story from the same
  // deterministic headline rotation everywhere else in the app reads from —
  // no separate "most notable" logic to keep in sync. The rest of the
  // headline grid below shows what's left so nothing is duplicated.
  const [alertHeadline, ...restHeadlines] = headlines;

  return (
    <>
      <Hero teams={teams} playedCount={playedCount} stored={stored} />
      <QuickStrip teams={teams} onNavigate={onNavigateToRankings} />
      <FavoritesStrip teams={teams} teamNames={TEAM_NAMES} />

      <HighestConfidence stored={stored} />

      <section className={s.lowerGrid}>
        <div className={s.moversCol}>
          <DailyMovers sport="world_cup" teamNames={TEAM_NAMES} limit={6} title="Biggest Movers — World Cup" />
        </div>
        <div className={s.alertCol}>
          <ConfidenceAlert headline={alertHeadline} onNavigate={onNavigateToRankings} />
        </div>
      </section>

      <section className={s.latestHeader}>
        <h2>Today's Briefing</h2>
        <span>Updated continuously</span>
      </section>
      <MorningForecast forecast={morning} />

      {restHeadlines.length > 0 && (
        <>
          <section className={s.latestHeader}>
            <h2>Latest from the model</h2>
            <span>Updated continuously</span>
          </section>
          <section className={s.headlineGrid}>
            {restHeadlines.map((headline) => (
              <HeadlineCard headline={headline} key={headline.title} />
            ))}
          </section>
        </>
      )}
    </>
  );
}