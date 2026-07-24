import type { InsightPage } from "../types";
import { loadResultsForBuild } from "../buildTimeData";
import { computeAccuracy, RANDOM_BASELINE_BRIER, BACKTESTED_BRIER } from "../../lib/accuracy";

async function loadData() {
  const stored = await loadResultsForBuild();
  if (!stored) return { available: false };
  const accuracy = computeAccuracy(stored);
  return { available: true, brierScore: accuracy.group.brierScore, matchesScored: accuracy.group.matchesScored };
}

function Content({ data }: { data?: Record<string, unknown> }) {
  const available = data?.available as boolean | undefined;
  const brierScore = data?.brierScore as number | null | undefined;
  const matchesScored = data?.matchesScored as number | undefined;

  return (
    <>
      <div className="eyebrow">Glossary</div>
      <h1>What Is a Brier Score?</h1>
      <p className="dek">
        The single number Veridex uses to grade its own predictions \u2014 and why it's a fairer
        test than just counting how often the favorite won.
      </p>

      <p>
        A Brier score measures how good a probabilistic prediction actually was, once the real
        result is known. For a three-way outcome like a football match (home win, draw, away
        win), it's the average squared difference between the predicted probability of each
        outcome and what actually happened (1 for the outcome that occurred, 0 for the other
        two), divided by three. Lower is better \u2014 0 is a perfect, certain prediction that
        turned out to be exactly right.
      </p>

      <h2>Why not just count correct picks?</h2>
      <p>
        Because "correct" isn't the same as "well-calibrated." A model that says every match is a
        coin flip will sometimes pick the eventual winner, but it isn't telling you anything
        useful. A model that confidently favors a huge underdog and is wrong should be penalized
        more than one that gave a close game to the wrong side by a narrow margin \u2014 a Brier
        score does exactly that, because it scores the full probability distribution, not just
        whichever side had the higher number.
      </p>

      <h2>What counts as a good score</h2>
      <p>
        A reference point matters more than the raw number. Treating every match as an equal
        three-way toss-up (33% each) scores {RANDOM_BASELINE_BRIER} \u2014 that's the baseline
        any real model needs to beat. Veridex's model was backtested against 256 real World Cup
        matches from 2010\u20132022 and scored {BACKTESTED_BRIER}, meaningfully better than the
        random baseline.
        {available && brierScore !== null && brierScore !== undefined && (
          <> As of this build, the model's live 2026 group-stage Brier score is{" "}
          <strong>{brierScore}</strong> across {matchesScored} matches \u2014 see the{" "}
          <a href="/insights/how-accurate-is-veridex">full accuracy breakdown</a> for the
          decisive-vs-draw split.</>
        )}
      </p>

      <h2>How Veridex uses it</h2>
      <p>
        Every methodology page on Veridex that talks about accuracy \u2014 the live tracking page,
        the match logs, the upset list \u2014 uses this same Brier scoring, on the same three-way
        scale, so the numbers are always comparable to each other and to the original
        2010\u20132022 backtest. It's also how real miscalibrations get caught: a model that's
        confidently wrong in a specific, consistent way (like under-pricing draws) shows up as an
        elevated Brier score in exactly that slice of the data, not just a vague "the model felt
        off" impression.
      </p>
    </>
  );
}

export const page: InsightPage = {
  slug: "what-is-a-brier-score",
  title: "What Is a Brier Score?",
  description:
    "How Brier scores work, why they're a fairer test of a prediction model than counting correct picks, and how Veridex uses one to grade itself.",
  category: "Glossary",
  publishedAt: "2026-07-24",
  loadData,
  Content,
};