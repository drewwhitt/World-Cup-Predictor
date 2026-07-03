import type { ReactElement } from "react";

/**
 * A single /insights page. `slug` becomes the URL: /insights/<slug>/
 *
 * Two kinds of pages share this same shape:
 *   - Evergreen pages you write by hand (glossary terms, methodology).
 *   - Auto-generated pages (match/team explainers) produced by a script
 *     from live model data. Same type, same rendering pipeline — the only
 *     difference is who/what wrote the `Content` component.
 */
export interface InsightPage {
  slug: string;
  title: string;
  /** Shown in Google search results and social previews. Keep it under ~155 characters. */
  description: string;
  /** Optional — groups pages on the /insights hub page (e.g. "Glossary", "Methodology", "Match Analysis"). */
  category?: string;
  /** ISO date string. Used for sorting the feed and for the visible "updated" date on the page. */
  publishedAt: string;
  Content: () => ReactElement;
}