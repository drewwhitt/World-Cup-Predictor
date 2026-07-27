import type { Headline } from "../../data/worldCup";
import s from "./ConfidenceAlert.module.css";

type Props = {
  headline?: Headline;
  onNavigate?: () => void;
};

export function ConfidenceAlert({ headline, onNavigate }: Props) {
  if (!headline) {
    return (
      <aside className={s.card}>
        <div className={s.label}>Confidence Alert</div>
        <h3>Model Warming Up</h3>
        <p>Divergence alerts appear here once results start coming in and the model has enough signal to flag them.</p>
      </aside>
    );
  }

  return (
    <aside className={s.card}>
      <div className={s.label}>Confidence Alert</div>
      <h3>{headline.title}</h3>
      <p>{headline.summary}</p>
      {onNavigate && (
        <button type="button" className={s.link} onClick={onNavigate}>
          Read Analysis
        </button>
      )}
    </aside>
  );
}