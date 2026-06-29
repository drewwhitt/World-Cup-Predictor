import { headlines as mockHeadlines, morningForecast, teams as mockTeams, type Headline, type MorningForecast as MorningForecastData, type Team } from "../../data/worldCup";
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
};

export function HomeView({ teams = mockTeams, morning = morningForecast, headlines = mockHeadlines, playedCount = 0 }: Props) {
  return (
    <>
      <Hero teams={teams} playedCount={playedCount} />
      <QuickStrip teams={teams} />
      <MorningForecast forecast={morning} />
      <section className={s.latestHeader}>
        <h2>Latest from the model</h2>
        <span>Updated continuously</span>
      </section>
      <section className={s.headlineGrid}>
        {headlines.map((headline) => (
          <HeadlineCard headline={headline} key={headline.title} />
        ))}
      </section>
      <Leaderboard teams={teams} />
    </>
  );
}
