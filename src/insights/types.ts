import type { ReactElement } from "react";

/**
 * A single /insights page. `slug` becomes the URL: /insights/<slug>/
 *
 * Three kinds of pages share this same shape:
 *   - Evergreen pages you write by hand (glossary terms, methodology).
 *   - Auto-generated pages (match/team explainers) produced by a script
 *     from live model data.
 *   - Live-data pages (e.g. accuracy tracking) that pull fresh numbers
 *     from Supabase each time the site rebuilds, via `loadData`.
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
  /**
   * Optional — runs once at build time (in generate-insights.tsx, before
   * rendering) and its result is passed to Content as `data`. Use this for
   * pages whose numbers should reflect live results rather than being
   * hand-written — the page's TEXT is still static HTML at request time,
   * only the NUMBERS are refreshed each time the site rebuilds.
   */
  loadData?: () => Promise<Record<string, unknown>>;
  Content: (props: { data?: Record<string, unknown> }) => ReactElement;
}