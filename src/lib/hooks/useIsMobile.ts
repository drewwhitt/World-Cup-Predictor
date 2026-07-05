import { useEffect, useState } from "react";

/**
 * True when the viewport is narrow enough that the bracket should render
 * as a swipeable, one-round-per-page carousel instead of the desktop
 * side-by-side canvas. Matches the same breakpoint used elsewhere in the
 * app's mobile CSS (860px).
 */
export function useIsMobile(breakpoint = 860): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= breakpoint : false,
  );

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= breakpoint);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [breakpoint]);

  return isMobile;
}