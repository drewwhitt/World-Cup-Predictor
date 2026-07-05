import { forwardRef, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import s from "./RoundCarousel.module.css";

export interface RoundCarouselHandle {
  scrollToRound: (index: number) => void;
}

export const RoundCarousel = forwardRef<RoundCarouselHandle, { roundLabels: string[]; children: ReactNode[] }>(
  function RoundCarousel({ roundLabels, children }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [currentRound, setCurrentRound] = useState(0);

    function scrollToRound(index: number) {
      const el = containerRef.current;
      if (!el) return;
      el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
      setCurrentRound(index);
    }

    useImperativeHandle(ref, () => ({ scrollToRound }));

    function handleScroll() {
      const el = containerRef.current;
      if (!el || el.clientWidth === 0) return;
      const rounded = Math.round(el.scrollLeft / el.clientWidth);
      if (rounded !== currentRound) setCurrentRound(rounded);
    }

    return (
      <div className={s.wrap}>
        <div className={s.tabs}>
          {roundLabels.map((label, i) => (
            <button
              key={label}
              type="button"
              className={i === currentRound ? s.tabActive : s.tab}
              onClick={() => scrollToRound(i)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={s.track} ref={containerRef} onScroll={handleScroll}>
          {children.map((child, i) => (
            <div className={s.page} key={roundLabels[i]}>
              {child}
            </div>
          ))}
        </div>
      </div>
    );
  },
);