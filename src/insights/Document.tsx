import type { ReactElement } from "react";

const SITE_NAME = "Veridex";
const SITE_URL = "https://world-cup-predictor-inky-two.vercel.app"; // update if/when you move to a custom domain

/**
 * Inline CSS using the same design tokens as the main app (src/styles/tokens.css)
 * so /insights pages feel like the same product, not a bolted-on afterthought.
 * Inlined (not linked) on purpose — these are simple content pages, and
 * inlining avoids an extra render-blocking request for what's a small
 * amount of CSS.
 */
const INSIGHTS_CSS = `
  :root {
    --paper: #F4EFE3;
    --surface: #FCF9F2;
    --ink: #1A1714;
    --ink-2: #5E564B;
    --ink-3: #8A8073;
    --hairline: rgba(26, 23, 20, 0.12);
    --navy: #0E1A2C;
    --gold: #D7B254;
    --on-dark: #F7F4ED;
    --font-display: "Libre Caslon Display", Georgia, serif;
    --font-serif: "Libre Caslon Text", Georgia, serif;
    --font-sans: "IBM Plex Sans", system-ui, sans-serif;
    --font-mono: "IBM Plex Mono", monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: var(--font-sans);
    line-height: 1.6;
  }
  .site-header {
    background: var(--navy);
    color: var(--on-dark);
    padding: 16px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .site-header a {
    color: var(--on-dark);
    text-decoration: none;
    font-family: var(--font-mono);
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .site-header .brand {
    font-family: var(--font-display);
    font-size: 20px;
    letter-spacing: 0.01em;
  }
  main {
    max-width: 720px;
    margin: 0 auto;
    padding: 48px 24px 80px;
  }
  .eyebrow {
    font: 600 11px/1 var(--font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin-bottom: 12px;
  }
  h1 {
    font-family: var(--font-display);
    font-size: 34px;
    line-height: 1.2;
    margin: 0 0 8px;
  }
  .dek {
    font-family: var(--font-serif);
    font-size: 18px;
    color: var(--ink-2);
    margin: 0 0 32px;
  }
  h2 {
    font-family: var(--font-display);
    font-size: 22px;
    margin: 40px 0 12px;
  }
  p { margin: 0 0 16px; color: var(--ink); }
  a { color: var(--home-win, #3B6CA8); }
  .glossary-term {
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 16px 20px;
    margin: 0 0 16px;
    background: var(--surface);
  }
  .glossary-term dt {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--gold);
    margin-bottom: 6px;
  }
  .glossary-term dd { margin: 0; }
  .meta-line {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--ink-3);
    margin-bottom: 32px;
  }
  .hub-list { list-style: none; padding: 0; }
  .hub-list li {
    border-bottom: 1px solid var(--hairline);
    padding: 20px 0;
  }
  .hub-list a {
    font-family: var(--font-display);
    font-size: 20px;
    text-decoration: none;
    color: var(--ink);
  }
  .hub-list .desc { color: var(--ink-2); margin-top: 6px; font-size: 15px; }
  .hub-category {
    font-family: var(--font-mono);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ink-3);
    margin-top: 48px;
    margin-bottom: 8px;
  }
  footer {
    text-align: center;
    padding: 32px 24px;
    color: var(--ink-3);
    font-size: 13px;
    border-top: 1px solid var(--hairline);
  }
`;

export function Document({
  title,
  description,
  slug,
  children,
}: {
  title: string;
  description: string;
  slug: string; // "" for the hub page itself
  children: ReactElement;
}) {
  const canonical = `${SITE_URL}/insights/${slug ? slug + "/" : ""}`;
  const fullTitle = slug ? `${title} | ${SITE_NAME} Insights` : `${SITE_NAME} Insights`;

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{fullTitle}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={fullTitle} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content={slug ? "article" : "website"} />
        <meta property="og:url" content={canonical} />
        <meta name="twitter:card" content="summary" />
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <style dangerouslySetInnerHTML={{ __html: INSIGHTS_CSS }} />
      </head>
      <body>
        <header className="site-header">
          <span className="brand">{SITE_NAME}</span>
          <nav>
            <a href="/">← Back to the model</a>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          {SITE_NAME} — sports predictive analytics.{" "}
          <a href="/insights/">All Insights</a>
        </footer>
      </body>
    </html>
  );
}