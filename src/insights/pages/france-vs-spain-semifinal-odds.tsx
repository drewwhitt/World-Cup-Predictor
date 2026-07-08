import type { InsightPage } from "../types";

/**
 * TEMPLATE NOTE: this page is hand-written for now to prove the pattern,
 * but it's structured exactly as an auto-generated match explainer should
 * be — a short "why" section, a plain-language driver breakdown, and a
 * pointer to the live page. Once this shape feels right, the next step is
 * a script that produces pages like this automatically from drivers.ts's
 * existing attribution data (the same data that powers the "Why This
 * Number" panel in the Forecasts tab) whenever a notable matchup or swing
 * happens — no manual writing needed at that point.
 */
function Content() {
  return (
    <>
      <div className="eyebrow">Match Analysis</div>
      <h1>Why Does Veridex Favor France Over Spain?</h1>
      <p className="dek">
        A projected Semifinal between two of the tournament's strongest sides — and the
        reasoning behind the model's current 57–43 split.
      </p>
      <p className="meta-line">Updated July 3, 2026</p>

      <p>
        As the bracket takes shape, France and Spain are on course for a Semifinal meeting
        between two of the pre-tournament favorites. Veridex's model currently gives France a
        57% chance of winning that matchup if it happens, against 43% for Spain.
      </p>

      <h2>The main driver: current form</h2>
      <p>
        Both teams enter this stage with strong Elo ratings, but France's has moved further in
        the right direction across the group stage and Round of 32 — the model weighs a team's
        most recent results more heavily than older ones, and France's recent scorelines have
        been more emphatic than Spain's.
      </p>

      <h2>Why it's not more lopsided</h2>
      <p>
        A 57–43 split is a real edge, not a toss-up, but it's far from a landslide. Spain's
        underlying rating is close enough to France's that the model treats this as a
        genuinely competitive matchup — the kind of game where a single moment can decide it,
        which the raw percentage doesn't fully capture on its own.
      </p>

      <h2>What could change it</h2>
      <p>
        Elo ratings move after every match, so this percentage isn't fixed. If either team
        wins their next fixture more convincingly than expected, or is held to a narrow result
        against a lower-rated opponent, the number will shift before these two ever actually
        meet. Check the{" "}
        <a href="/">live Bracket page</a> for the current projection.
      </p>
    </>
  );
}

export const page: InsightPage = {
  slug: "france-vs-spain-semifinal-odds",
  title: "Why Does Veridex Favor France Over Spain?",
  description:
    "Veridex's model gives France a 57% chance over Spain in a projected World Cup Semifinal. Here's the reasoning behind the number.",
  category: "Match Analysis",
  publishedAt: "2026-07-03",
  Content,
};