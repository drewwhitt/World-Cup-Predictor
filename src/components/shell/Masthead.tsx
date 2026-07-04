import s from "./Masthead.module.css";

function liveDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).toUpperCase();
}

export function Masthead() {
  return (
    <>
      <div className={s.utility}>
        <span>{liveDate()}</span>
        <span className={s.utilityRight}>
          <span>Vol. III · No. 176</span>
          <span className={s.subscribe} title="Coming soon">✦ Premium (Coming Soon)</span>
        </span>
      </div>
      <div className={s.masthead}>
        <div>
          <div className={s.wordmark}>VERIDEX</div>
          <div className={s.tagline}>Predictive Sports Intelligence</div>
        </div>
      </div>
    </>
  );
}