import { headlines } from "../../data/worldCup";
import { Hero } from "./Hero";
import { HeadlineCard } from "./HeadlineCard";
import { Leaderboard } from "./Leaderboard";
import { MorningForecast } from "./MorningForecast";
import { QuickStrip } from "./QuickStrip";
import s from "./HomeView.module.css";

export function HomeView() {
  return (
    <>
      <Hero />
      <QuickStrip />
      <section className={s.latestHeader}>
        <h2>Latest from the model</h2>
        <span>Updated continuously</span>
      </section>
      <section className={s.headlineGrid}>
        {headlines.map((headline) => (
          <HeadlineCard headline={headline} key={headline.title} />
        ))}
      </section>
      <MorningForecast />
      <Leaderboard />
    </>
  );
}
