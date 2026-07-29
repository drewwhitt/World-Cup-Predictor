import type { Headline } from "../../data/worldCup";
import { Carousel } from "../../components/carousel/Carousel";
import s from "./ConfidenceAlert.module.css";

type Props = {
  headlines: Headline[];
};

/**
 * Full-width home page highlight, rotating through several stories
 * rather than pinning one. This is the reusable slot for "moving
 * forward" insight types (most likely champion, highest-upset-risk
 * underdog, an against-the-grain pick) as that data comes online — each
 * would just be another slide alongside the headline-driven ones below.
 */
export function ConfidenceAlert({ headlines }: Props) {
  if (headlines.length === 0) {
    return (
      <aside className={s.card}>
        <div className={s.label}>Confidence Alert</div>
        <h3>Model Warming Up</h3>
        <p>Divergence alerts appear here once results start coming in and the model has enough signal to flag them.</p>
      </aside>
    );
  }

  const slides = headlines.map((headline) => (
    <div className={s.slide} key={headline.title}>
      <div className={s.label}>Confidence Alert</div>
      <h3>{headline.title}</h3>
      <p>{headline.summary}</p>
    </div>
  ));

  return (
    <aside className={s.card}>
      <Carousel items={slides} intervalMs={6500} />
    </aside>
  );
}