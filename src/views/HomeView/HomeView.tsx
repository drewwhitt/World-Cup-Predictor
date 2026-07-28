import { type Headline, type MorningForecast as MorningForecastData, type Team, type TabId } from "../../data/worldCup";
import { TournamentMovers } from "./TournamentMovers";
import { TEAM_BY_CODE } from "../../lib/teams";
import type { StoredResults } from "../../lib/types";
import { NflPreview } from "../../components/nfl/NflPreview";
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
  onNavigate?: (tab: TabId) => void;
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
  onNavigate,
}: Props) {
  // The Confidence Alert card reuses the top story from the same
  // deterministic headline rotation everywhere else in the app reads from —
  // no separate "most notable" logic to keep in sync. The rest of the
  // headline grid below shows what's left so nothing is duplicated.
  const [alertHeadline, ...restHeadlines] = headlines;
  const isComplete = teams.some((t) => t.isChampion);

  return (
    <>
      <Hero teams={teams} playedCount={playedCount} stored={stored} />

      {onNavigate && <NflPreview onNavigate={onNavigate} />}

      {!isComplete && (
        <QuickStrip teams={teams} onNavigate={onNavigate ? () => onNavigate("rankings") : undefined} />
      )}
      <FavoritesStrip teams={teams} teamNames={TEAM_NAMES} />

      <HighestConfidence stored={stored} />

      <section className={s.lowerGrid}>
        <div className={s.moversCol}>
          <TournamentMovers forecast={morning} />
        </div>
        <div className={s.alertCol}>
          <ConfidenceAlert headline={alertHeadline} onNavigate={onNavigate ? () => onNavigate("rankings") : undefined} />
        </div>
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