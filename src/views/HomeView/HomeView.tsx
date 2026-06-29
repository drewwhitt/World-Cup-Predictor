import { headlines, morningForecast, teams as mockTeams, type MorningForecast as MorningForecastData, type Team } from "../../data/worldCup";
import { Hero } from "./Hero";
import { HeadlineCard } from "./HeadlineCard";
import { Leaderboard } from "./Leaderboard";
import { MorningForecast } from "./MorningForecast";
import { QuickStrip } from "./QuickStrip";
import s from "./HomeView.module.css";

type Props = {
  teams?: Team[];
  morning?: MorningForecastData;
  playedCount?: number;
};

export function HomeView({ teams = mockTeams, morning = morningForecast, playedCount = 0 }: Props) {
  return (
    <>
      <Hero teams={teams} playedCount={playedCount} />
      <QuickStrip teams={teams} />
      <section className={s.latestHeader}>
        <h2>Latest from the model</h2>
        <span>Updated continuously</span>
      </section>
      <section className={s.headlineGrid}>
        {headlines.map((headline) => (
          <HeadlineCard headline={headline} key={headline.title} />
        ))}
      </section>
      <MorningForecast forecast={morning} />
      <Leaderboard teams={teams} />
    </>
  );
}
