import type { Headline } from "../../data/worldCup";
import s from "./HeadlineCard.module.css";

type Props = {
  headline: Headline;
};

export function HeadlineCard({ headline }: Props) {
  return (
    <article className={s.card}>
      <div className={s.topline}>
        <div>{headline.metricLabel}</div>
        <strong className={headline.up ? s.up : s.down}>
          {headline.up ? "↗" : "↘"} {headline.metric}
        </strong>
      </div>
      <h3>{headline.title}</h3>
      <p>{headline.summary}</p>
      <time>{headline.time}</time>
    </article>
  );
}
