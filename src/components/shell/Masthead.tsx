import s from "./Masthead.module.css";

export function Masthead() {
  return (
    <>
      <div className={s.utility}>
        <span>Tuesday, June 24, 2026</span>
        <span className={s.utilityRight}>
          <span>Vol. III · No. 176</span>
          <span className={s.subscribe}>✦ Subscribe to Premium</span>
        </span>
      </div>
      <div className={s.masthead}>
        <div>
          <div className={s.wordmark}>VERIDEX</div>
          <div className={s.tagline}>Predictive Sports Intelligence</div>
        </div>
        <div className={s.edition}>
          <span>Edition</span>
          <div className={s.segmented} aria-label="Edition">
            <button type="button">Desk</button>
            <button type="button" className={s.active}>
              Wire
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
