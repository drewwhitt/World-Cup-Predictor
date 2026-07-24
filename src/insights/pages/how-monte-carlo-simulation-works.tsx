import type { InsightPage } from "../types";

function Content() {
  return (
    <>
      <div className="eyebrow">Glossary</div>
      <h1>How Does Monte Carlo Simulation Work for Sports Predictions?</h1>
      <p className="dek">
        Why Veridex plays out the rest of the World Cup 10,000 times instead of just computing
        one answer \u2014 and what that buys you that a single calculation can't.
      </p>

      <p>
        A Monte Carlo simulation answers a hard question by simulating it many times over and
        counting outcomes, instead of trying to solve it directly with one formula. For a
        48-team tournament with group standings, third-place qualification, and a five-round
        knockout bracket, there's no clean equation for "what's the probability Spain wins the
        whole thing" \u2014 too many matches, with too many interacting paths, feed into that one
        number. Simulating the rest of the tournament thousands of times and counting how often
        each team wins is a far simpler way to get a genuinely accurate answer.
      </p>

      <h2>How one simulation works</h2>
      <p>
        Each simulated run plays out every remaining match using the two teams' Elo ratings to
        set a win/draw/loss probability, then samples a random result from that distribution \u2014
        weighted so a team rated much stronger wins much more often, but never with total
        certainty. That single result feeds into the standings, which determine who advances,
        which determines the next round's matchups, all the way to a simulated champion. That's
        one run, out of 10,000.
      </p>

      <h2>Why 10,000 runs instead of one</h2>
      <p>
        A single simulated run just tells you one possible future \u2014 useful for nothing on its
        own, since real tournaments have genuine randomness that no single simulation can capture
        (a favorite can lose a close game; an underdog can catch fire). Running it 10,000 times
        and counting how often each team wins converts that randomness into a genuine probability:
        if a team wins the simulated tournament 2,500 times out of 10,000, the model calls that a
        25% championship probability. More simulations means a more stable, less noisy estimate of
        that percentage \u2014 10,000 is enough that the number barely moves if you ran it again with
        a different random seed.
      </p>

      <h2>What it captures that a simpler model can't</h2>
      <p>
        Bracket path matters as much as raw team strength. Two teams can have similar Elo ratings
        but very different championship odds if one has an easier group and knockout draw \u2014
        Monte Carlo simulation captures that automatically, because every run actually plays out
        the real bracket structure, third-place qualification rules included, rather than
        assuming every team faces an "average" opponent at each round.
      </p>

      <h2>Where it's used on Veridex</h2>
      <p>
        Every championship, Final, and semifinal probability shown anywhere on Veridex \u2014 Home,
        Forecasts, Rankings, Bracket \u2014 comes from the same 10,000-simulation run, seeded from
        current Elo ratings and real results already played. It's deliberately NOT used for
        every feature: a historical probability-over-time chart would need to re-run this
        simulation at each past point in the tournament, which is slow enough that it was built,
        tested, and shelved for feeling too slow relative to how instant the rest of the site
        feels \u2014 simulation is powerful, but it isn't free, and Veridex only pays that cost where
        it's actually worth it.
      </p>
    </>
  );
}

export const page: InsightPage = {
  slug: "how-monte-carlo-simulation-works",
  title: "How Does Monte Carlo Simulation Work for Sports Predictions?",
  description:
    "How Veridex uses 10,000-run Monte Carlo simulation to turn Elo ratings into championship probabilities, and why simulation beats a single calculation for a 48-team bracket.",
  category: "Glossary",
  publishedAt: "2026-07-24",
  Content,
};