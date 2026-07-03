import type { InsightPage } from "./types";

export function HubPage({ pages }: { pages: InsightPage[] }) {
  const byCategory = new Map<string, InsightPage[]>();
  for (const p of pages) {
    const cat = p.category ?? "General";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(p);
  }

  // Most-recently-published category order isn't critical here — Glossary
  // and Methodology first (evergreen), Match Analysis after (grows fastest).
  const categoryOrder = ["Methodology", "Glossary", "Match Analysis"];
  const categories = [...byCategory.keys()].sort((a, b) => {
    const ai = categoryOrder.indexOf(a);
    const bi = categoryOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <>
      <div className="eyebrow">Veridex Insights</div>
      <h1>How the Model Thinks</h1>
      <p className="dek">
        Plain-language explanations of the terms, methodology, and specific predictions behind
        Veridex's World Cup model.
      </p>

      {categories.map((cat) => (
        <div key={cat}>
          <div className="hub-category">{cat}</div>
          <ul className="hub-list">
            {byCategory.get(cat)!.map((p) => (
              <li key={p.slug}>
                <a href={`/insights/${p.slug}/`}>{p.title}</a>
                <div className="desc">{p.description}</div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}