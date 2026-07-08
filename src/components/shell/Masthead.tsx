import s from "./Masthead.module.css";

function liveDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).toUpperCase();
}

/**
 * Issue number computed live from the actual date (day of year), so it
 * genuinely increments day to day like a real publication would, instead
 * of a frozen number that never changes no matter when the page loads.
 * "Volume III" stays a fixed cosmetic constant — there's no real
 * publication history to derive a volume-per-year count from, so making
 * that dynamic would just be inventing a fake founding date.
 */
function issueNumber(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function Masthead() {
  return (
    <>
      <div className={s.utility}>
        <span>{liveDate()}</span>
        <span className={s.utilityRight}>
          <span>Vol. I · No. {issueNumber()}</span>
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