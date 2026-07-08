import s from "./BreakingTicker.module.css";

type Props = {
  text: string;
};

export function BreakingTicker({ text }: Props) {
  return (
    <div className={s.ticker}>
      <span className={s.tag}>Breaking</span>
      <div className={s.window}>
        <div className={s.track}>
          <span>{text}</span>
          <span>{text}</span>
        </div>
      </div>
    </div>
  );
}