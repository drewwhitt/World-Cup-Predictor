import { sports } from "../../data/worldCup";
import s from "./SportSelector.module.css";

export function SportSelector() {
  return (
    <div className={s.sports} aria-label="Sports">
      {sports.map((sport) => (
        <span
          key={sport}
          className={sport === "World Cup" ? s.active : s.inactive}
          title={sport === "World Cup" ? undefined : `${sport} — coming soon`}
        >
          {sport}
        </span>
      ))}
    </div>
  );
}