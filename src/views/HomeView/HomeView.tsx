import { headlines as mockHeadlines, morningForecast, teams as mockTeams, type Headline, type MorningForecast as MorningForecastData, type Team } from "../../data/worldCup";
import { DailyMovers } from "../../components/movers/DailyMovers";
import { TEAM_BY_CODE } from "../../lib/teams";
import type { StoredResults } from "../../lib/types";
import { Hero } from "./Hero";
import { HeadlineCard } from "./HeadlineCard";
import { Leaderboard } from "./Leaderboard";
import { MorningForecast } from "./MorningForecast";
import { QuickStrip } from "./QuickStrip";
import s from "./HomeView.module.css";

type Props = {
  teams?: Team[];
  morning?: MorningForecastData;
  headlines?: Headline[];
  playedCount?: number;
  stored?: StoredResults;
};

const TEAM_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(TEAM_BY_CODE).map(([code, t]) => [code, t.name]),
);

export function HomeView({ teams = mockTeams, morning = morningForecast, headlines = mockHeadlines, playedCount = 0, stored }: Props) {
  return (
    <>
      <Hero teams={teams} playedCount={playedCount} />
      <QuickStrip teams={teams} />
      <MorningForecast forecast={morning} />
      <DailyMovers sport="world_cup" teamNames={TEAM_NAMES} limit={6} title="Today's Movers — World Cup" />
      <section className={s.latestHeader}>
        <h2>Latest from the model</h2>
        <span>Updated continuously</span>
      </section>
      <section className={s.headlineGrid}>
        {headlines.map((headline) => (
          <HeadlineCard headline={headline} key={headline.title} />
        ))}
      </section>
      <Leaderboard teams={teams} stored={stored} />
    </>
  );
}