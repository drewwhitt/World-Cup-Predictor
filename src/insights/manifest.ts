import type { InsightPage } from "./types";
import { page as whatIsEloRating } from "./pages/what-is-elo-rating";
import { page as franceVsSpain } from "./pages/france-vs-spain-semifinal-odds";
import { page as howAccurate } from "./pages/how-accurate-is-veridex.tsx";
import { page as groupStageMatchLog } from "./pages/group-stage-predictions-vs-results";

/**
 * Every /insights page, in one place. Add a new page by:
 *   1. Creating a new file in src/insights/pages/
 *   2. Exporting a `page: InsightPage` from it (see existing pages for the shape)
 *   3. Importing and adding it to this array
 *
 * Run `npm run build` (or `npm run generate-insights` on its own) to
 * regenerate the static HTML files.
 */
export const INSIGHT_PAGES: InsightPage[] = [
  whatIsEloRating,
  franceVsSpain,
  howAccurate,
  groupStageMatchLog,
];