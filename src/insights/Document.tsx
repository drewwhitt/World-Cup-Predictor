import type { ReactElement } from "react";

const SITE_NAME = "Veridex";
const SITE_URL = "https://world-cup-predictor-inky-two.vercel.app"; // update if/when you move to a custom domain

const BREAKING_TEXT =
  "Brazil reclaims #1 at 24.5% · Portugal slides 1.7pp after Group A draw · France vs Brazil kicks off 3:00 PM ET · Veridex model refreshed with 50,000 new simulations · USA's advance odds climb to 61%";

function buildDate(): string {
  return new Date()
    .toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    .toUpperCase();
}

/**
 * Same design tokens AND the same masthead/ticker treatment as the main
 * app (src/styles/tokens.css, src/components/shell/*) so /insights pages
 * read as the same publication, not a bolted-on afterthought. Inlined
 * (not linked) since these are simple content pages — avoids an extra
 * render-blocking request for what's a small amount of CSS.
 *
 * IMPORTANT: the font FAMILIES were already declared here before, but the
 * actual font FILES were never loaded — the main app pulls them via an
 * @import in global.css, which these statically-generated pages never see
 * since they don't go through main.tsx at all. Without the @import below,
 * every heading here was silently falling back to Georgia the whole time.
 */
const INSIGHTS_CSS = `
  @import url("https://fonts.googleapis.com/css2?family=Libre+Caslon+Display&family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap");

  :root {
    --paper: #F4EFE3;
    --surface: #FCF9F2;
    --ink: #1A1714;
    --ink-2: #5E564B;
    --ink-3: #8A8073;
    --ink-4: #A39A8B;
    --hairline: rgba(26, 23, 20, 0.12);
    --hairline-2: rgba(26, 23, 20, 0.08);
    --navy: #0E1A2C;
    --gold: #D7B254;
    --on-dark: #F7F4ED;
    --home-win: #3B6CA8;
    --font-display: "Libre Caslon Display", Georgia, serif;
    --font-serif: "Libre Caslon Text", Georgia, serif;
    --font-sans: "IBM Plex Sans", system-ui, sans-serif;
    --font-mono: "IBM Plex Mono", monospace;
    --container: 1200px;
    --container-pad: 40px;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: var(--font-sans);
    line-height: 1.6;
  }
  .container {
    max-width: var(--container);
    margin: 0 auto;
    padding: 0 var(--container-pad);
  }

  /* ── Breaking ticker — identical to BreakingTicker.tsx ────────────── */
  .ticker {
    display: flex;
    align-items: center;
    height: 34px;
    overflow: hidden;
    color: var(--on-dark);
    background: var(--navy);
    white-space: nowrap;
  }
  .ticker .tag {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    align-self: stretch;
    padding: 9px 14px;
    color: var(--navy);
    font: 600 11px/1 var(--font-mono);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    background: var(--gold);
  }
  .ticker .window { flex: 1; overflow: hidden; position: relative; }
  .ticker .track {
    display: inline-flex;
    white-space: nowrap;
    font: 500 12.5px/1 var(--font-sans);
    letter-spacing: 0.01em;
    animation: vx-marquee 40s linear infinite;
  }
  .ticker .track:hover { animation-play-state: paused; }
  .ticker .track span { padding: 0 26px; }
  @keyframes vx-marquee {
    0%   { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }

  /* ── Utility bar + masthead — identical to Masthead.tsx ───────────── */
  .utility {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 11px 0;
    color: var(--ink-3);
    font: 500 11px/1 var(--font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    border-bottom: 1px solid var(--hairline-2);
  }
  .utility-right { display: flex; gap: 18px; align-items: center; }
  .utility-right a {
    color: var(--ink-3);
    text-decoration: none;
  }
  .utility-right a:hover { color: var(--ink); }
  .subscribe { color: var(--gold); font-weight: 600; }

  .masthead {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    padding: 26px 0 22px;
    border-bottom: 1px solid var(--ink);
  }
  .wordmark {
    display: inline-block;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: 46px;
    line-height: 0.92;
    letter-spacing: 0.04em;
    text-decoration: none;
  }
  .tagline {
    margin-top: 9px;
    color: var(--ink-3);
    font: 500 11px/1 var(--font-mono);
    letter-spacing: 0.34em;
    text-transform: uppercase;
  }
  .back-link {
    color: var(--ink-2);
    text-decoration: none;
    font: 600 11px/1 var(--font-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding-bottom: 6px;
  }
  .back-link:hover { color: var(--ink); }

  main {
    max-width: 720px;
    margin: 0 auto;
    padding: 48px var(--container-pad) 80px;
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
  a { color: var(--home-win); }
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
  .note {
    font-size: 13px;
    color: var(--ink-3);
    margin-top: -8px;
  }
  .brier-chart {
    margin: 20px 0 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .brier-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .brier-label {
    width: 190px;
    flex-shrink: 0;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--ink-2);
  }
  .brier-track {
    flex: 1;
    height: 10px;
    background: var(--hairline);
    border-radius: 5px;
    overflow: hidden;
  }
  .brier-fill {
    height: 100%;
    background: var(--ink-3);
    border-radius: 5px;
  }
  .brier-fill-highlight {
    background: var(--gold);
  }
  .brier-value {
    width: 56px;
    flex-shrink: 0;
    text-align: right;
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 600;
    color: var(--ink);
  }
  .upset-list {
    padding-left: 20px;
    margin: 0 0 16px;
  }
  .upset-list li {
    margin-bottom: 8px;
    color: var(--ink);
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
        <style dangerouslySetInnerHTML={{ __html: INSIGHTS_CSS }} />
      </head>
      <body>
        <div className="ticker">
          <span className="tag">Breaking</span>
          <div className="window">
            <div className="track">
              <span>{BREAKING_TEXT}</span>
              <span>{BREAKING_TEXT}</span>
            </div>
          </div>
        </div>

        <header className="container">
          <div className="utility">
            <span>{buildDate()}</span>
            <span className="utility-right">
              <span>Vol. III · No. 176</span>
              <span className="subscribe" title="Coming soon">✦ Premium (Coming Soon)</span>
              <a href="/" className="back-link">← Back to the Model</a>
            </span>
          </div>
          <div className="masthead">
            <div>
              <a href="/" className="wordmark">VERIDEX</a>
              <div className="tagline">Predictive Sports Intelligence</div>
            </div>
          </div>
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