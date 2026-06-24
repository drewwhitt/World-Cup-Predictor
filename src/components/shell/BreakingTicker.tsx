import { breakingText } from "../../data/worldCup";
import s from "./BreakingTicker.module.css";

export function BreakingTicker() {
  return (
    <div className={s.ticker}>
      <span className={s.tag}>Breaking</span>
      <div className={s.window}>
        <div className={s.track}>
          <span>{breakingText}</span>
          <span>{breakingText}</span>
        </div>
      </div>
    </div>
  );
}
