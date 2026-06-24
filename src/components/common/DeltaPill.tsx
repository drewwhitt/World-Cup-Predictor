import s from "./DeltaPill.module.css";

type Props = {
  value: number;
};

export function DeltaPill({ value }: Props) {
  if (value === 0) return <span className={s.flat}>-</span>;

  const className = value > 0 ? s.up : s.down;
  const sign = value > 0 ? "+" : "-";

  return (
    <span className={className}>
      {sign}
      {Math.abs(value).toFixed(1)} pp
    </span>
  );
}
