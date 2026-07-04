/**
 * Renders every page in src/insights/manifest.ts to a real, static HTML
 * file — no client-side JavaScript required to see the content. This is
 * what makes /insights pages crawlable and indexable by Google, unlike
 * the rest of the app (which is a client-rendered React SPA).
 *
 * Run automatically as part of `npm run build`. Output goes to
 * dist/insights/<slug>/index.html, alongside Vite's own build output —
 * Vercel serves both from the same dist/ folder with no extra config,
 * since there's no vercel.json rewrite intercepting these paths.
 *
 * Run standalone with: npm run generate-insights
 * (Useful for checking output without a full Vite build.)
 */
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { Document } from "../src/insights/Document";
import { HubPage } from "../src/insights/HubPage";
import { INSIGHT_PAGES } from "../src/insights/manifest";

const OUT_DIR = join(process.cwd(), "dist", "insights");

function writePage(slug: string, html: string) {
  const dir = slug ? join(OUT_DIR, slug) : OUT_DIR;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), `<!doctype html>\n${html}`, "utf-8");
}

async function main() {
  if (!existsSync(join(process.cwd(), "dist"))) {
    console.error(
      "dist/ doesn't exist yet — run `vite build` first (or just `npm run build`, which does both in order).",
    );
    process.exit(1);
  }

  // Individual pages
  for (const page of INSIGHT_PAGES) {
    const data = page.loadData ? await page.loadData() : undefined;
    const html = renderToStaticMarkup(
      <Document title={page.title} description={page.description} slug={page.slug}>
        <page.Content data={data} />
      </Document>,
    );
    writePage(page.slug, html);
    console.log(`  /insights/${page.slug}/`);
  }

  // Hub page
  const hubHtml = renderToStaticMarkup(
    <Document title="Insights" description="Plain-language explanations of the Veridex model." slug="">
      <HubPage pages={INSIGHT_PAGES} />
    </Document>,
  );
  writePage("", hubHtml);
  console.log("  /insights/ (hub)");

  console.log(`\nGenerated ${INSIGHT_PAGES.length + 1} static pages in dist/insights/`);
}

main().catch((err) => {
  console.error("generate-insights failed:", err);
  process.exit(1);
});