import type { InsightPage } from "../types";

function Content() {
  return (
    <>
      <div className="eyebrow">Glossary</div>
      <h1>What Is an Elo Rating?</h1>
      <p className="dek">
        The rating system behind every probability Veridex publishes — and why it's better
        suited to predicting matches than a simple world ranking.
      </p>

      <p>
        An Elo rating is a single number that represents a team's current strength, updated
        after every match based on the result and who they played. It was originally developed
        for chess, but has become the standard approach for rating national football teams,
        because it captures something a static ranking list can't: strength relative to the
        quality of opposition, updated continuously as results come in.
      </p>

      <h2>How it's different from a world ranking</h2>
      <p>
        A ranking table (like FIFA's official rankings) tells you where a team sits relative to
        others, but it doesn't directly tell you the probability of one team beating another. Elo
        does. Every Elo rating can be converted directly into a win probability against any other
        rated team — that's the entire point of the system, and it's why it's the foundation of
        Veridex's simulation engine rather than a supplementary stat.
      </p>

      <h2>How ratings move</h2>
      <p>
        After each match, both teams' ratings shift based on two things: whether the result was
        expected, and by how much. Beating a stronger team moves your rating up more than beating
        a weaker one. A narrow win moves it less than a dominant one. A team can lose points even
        while winning, if the win was narrower than their rating implied it should have been.
      </p>

      <h2>How Veridex uses it</h2>
      <p>
        Every matchup on Veridex — from the group stage through the Final — starts from each
        team's current Elo rating. Ratings are adjusted for tournament-specific factors (like
        host-nation advantage) before being converted into a win probability, which then feeds a
        10,000-simulation model of the rest of the bracket. We don't publish the exact weighting
        of every adjustment — that's the part of the model we've spent the most time calibrating —
        but the Elo foundation itself is the same well-established system used across
        professional football analytics.
      </p>
    </>
  );
}

export const page: InsightPage = {
  slug: "what-is-elo-rating",
  title: "What Is an Elo Rating?",
  description:
    "How Elo ratings work, how they differ from a world ranking, and how Veridex uses them to generate match win probabilities.",
  category: "Glossary",
  publishedAt: "2026-07-03",
  Content,
};