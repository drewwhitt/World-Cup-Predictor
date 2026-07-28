import { type Headline, type MorningForecast as MorningForecastData, type Team, type TabId } from "../../data/worldCup";
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
  // Confidence Alert rotates through the top of the same deterministic
  // headline rotation everywhere else in the app reads from — no separate
  // "most notable" logic to keep in sync. The rest of the headline grid
  // below shows what's left so nothing is duplicated. As other insight
  // types come online (most-likely-champion, highest-upset-risk
  // underdog, an against-the-grain pick) they'd join this same rotation
  // rather than needing their own slot.
  const ALERT_SLIDE_COUNT = 3;
  const alertHeadlines = headlines.slice(0, ALERT_SLIDE_COUNT);
  const restHeadlines = headlines.slice(ALERT_SLIDE_COUNT);
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

      <MorningForecast forecast={morning} />

      <ConfidenceAlert headlines={alertHeadlines} onNavigate={onNavigate ? () => onNavigate("rankings") : undefined} />

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