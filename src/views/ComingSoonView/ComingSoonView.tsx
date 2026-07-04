import type { TabId } from "../../data/worldCup";
import s from "./ComingSoonView.module.css";

export function ComingSoonView({
  title,
  onNavigate,
}: {
  title: string;
  onNavigate: (tab: TabId) => void;
}) {
  return (
    <div className={s.wrap}>
      <div className={s.eyebrow}>Coming Soon</div>
      <h1>{title}</h1>
      <p>This part of Veridex is still being built. In the meantime, check out:</p>
      <div className={s.links}>
        <button type="button" onClick={() => onNavigate("home")}>Home</button>
        <button type="button" onClick={() => onNavigate("forecasts")}>Forecasts</button>
        <button type="button" onClick={() => onNavigate("bracket")}>Bracket</button>
      </div>
    </div>
  );
}