import { useEffect, useState, type ReactNode } from "react";
import s from "./Carousel.module.css";

type Props = {
  items: ReactNode[];
  /** How long each item stays on screen before advancing, in ms. */
  intervalMs?: number;
  /** Show the small dot indicators + let the person jump to a slide directly. */
  showDots?: boolean;
};

/**
 * Streaming-trailer-style rotation: shows one item at a time, auto-advances
 * on a timer, pauses while the person's mouse is over it so they can
 * actually finish reading, and loops back to the start after the last item.
 *
 * Deliberately generic — no sport-specific types or data shape. A future
 * NFL/NBA "weekly movers" widget (or anything else that needs to show N
 * things in the space of one) can pass its own array of rendered cards
 * here rather than each sport reinventing rotation/timing/pause-on-hover.
 */
export function Carousel({ items, intervalMs = 5000, showDots = true }: Props) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = items.length;

  // Clamp in case the item count shrinks out from under an active index
  // (e.g. going from 3 movers down to 2 on a data refresh).
  const safeIndex = Math.min(index, Math.max(0, count - 1));

  useEffect(() => {
    if (count <= 1 || paused) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [count, intervalMs, paused]);

  if (count === 0) return null;

  return (
    <div
      className={s.wrap}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className={s.stage}>
        {items.map((item, i) => (
          <div
            key={i}
            className={i === safeIndex ? s.slideActive : s.slide}
            aria-hidden={i !== safeIndex}
          >
            {item}
          </div>
        ))}
      </div>
      {showDots && count > 1 && (
        <div className={s.dots} role="tablist">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === safeIndex}
              aria-label={`Show item ${i + 1} of ${count}`}
              className={i === safeIndex ? s.dotActive : s.dot}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}