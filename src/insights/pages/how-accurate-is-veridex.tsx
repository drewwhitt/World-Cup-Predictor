import type { InsightPage } from "../types";
import { loadResultsForBuild } from "../buildTimeData";
import {
  computeAccuracy,
  RANDOM_BASELINE_BRIER,
  COIN_FLIP_BRIER,
  BACKTESTED_BRIER,
  HISTORICAL_DRAW_RATE,
} from "../../lib/accuracy";

async function loadData() {
  const stored = await loadResultsForBuild();
  if (!stored) return { available: false };
  const accuracy = computeAccuracy(stored);
  return { available: true, accuracy };
}

function BrierBar({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  // Brier scores run roughly 0 (perfect) to ~0.67 (worst possible for 3-way);
  // clamp the bar width to a sensible visual range rather than the full scale.
  const pct = Math.max(4, Math.min(100, (1 - value / 0.35) * 100));
  return (
    <div className="brier-row">
      <span className="brier-label">{label}</span>
      <div className="brier-track">
        <div className={highlight ? "brier-fill brier-fill-highlight" : "brier-fill"} style={{ width: `${pct}%` }} />
      </div>
      <span className="brier-value">{value.toFixed(4)}</span>
    </div>
  );
}

function Content({ data }: { data?: Record<string, unknown> }) {
  const available = data?.available as boolean | undefined;
  const accuracy = data?.accuracy as ReturnType<typeof computeAccuracy> | undefined;

  return (
    <>
      <div className="eyebrow">Methodology · Track Record</div>
      <h1>How Accurate Has Veridex Been?</h1>
      <p className="dek">
        Every prediction Veridex makes is checked against what actually happened. This page tracks
        that record directly — including the misses, not just the hits.
      </p>

      {!available && (
        <p>
          Live results aren't available for this build. Check back after the next update — this
          page regenerates automatically as new results come in.
        </p>
      )}

      {available && accuracy && (
        <>
          <h2>Group Stage</h2>
          <p>
            Group-stage predictions are scored with a Brier score — the same method used to validate
            the model against real results from the 2010, 2014, 2018, and 2022 World Cups before this
            tournament started. Lower is better: 0 is a perfect prediction, and two useful reference
            points are a coin-flip guess ({COIN_FLIP_BRIER}) and picking every match as a toss-up
            regardless of the teams involved ({RANDOM_BASELINE_BRIER}).
          </p>
          {accuracy.group.brierScore !== null ? (
            <>
              <div className="brier-chart">
                <BrierBar label="2026 (live, this page)" value={accuracy.group.brierScore} highlight />
                <BrierBar label="2010–2022 backtest" value={BACKTESTED_BRIER} />
                <BrierBar label="Coin flip" value={COIN_FLIP_BRIER} />
                <BrierBar label="Random baseline" value={RANDOM_BASELINE_BRIER} />
              </div>
              <p>
                That number is worse than the historical backtest, and it's worth explaining why
                rather than leaving it unexplained: it's concentrated almost entirely in one place.
                Decisive results (a team actually winning) are scoring close to the historical norm.
                Draws are where the model is struggling —{" "}
                {accuracy.group.draws.observedRate !== null
                  ? `${(accuracy.group.draws.observedRate * 100).toFixed(0)}%`
                  : "a higher-than-usual share"}{" "}
                of this tournament's group matches have ended in a draw, against a historical rate
                closer to {(HISTORICAL_DRAW_RATE * 100).toFixed(0)}%, and the model hasn't been giving
                draws enough credit as a result.
              </p>
              <div className="brier-chart">
                <BrierBar
                  label={`Decisive results (${accuracy.group.decisive.count})`}
                  value={accuracy.group.decisive.brierScore ?? 0}
                />
                <BrierBar
                  label={`Draws (${accuracy.group.draws.count})`}
                  value={accuracy.group.draws.brierScore ?? 0}
                />
              </div>
              <p className="note">
                Whether that's this tournament genuinely running unusually draw-heavy, or a real gap
                in how the model weighs draw likelihood, is exactly the kind of question worth
                revisiting with a proper recalibration pass once the tournament wraps — not something
                to patch mid-tournament based on one data point.
              </p>
            </>
          ) : (
            <p>No group-stage results recorded yet.</p>
          )}
          <p className="note">Based on {accuracy.group.matchesScored} scored group-stage matches.</p>

          <h2>Knockout Stage</h2>
          <p>
            Knockout matches don't have draws, so these are scored two ways: a straightforward
            correct-vs-upset count, and the same Brier method applied to a binary (win/lose) outcome.
          </p>
          {accuracy.knockout.matchesScored > 0 ? (
            <>
              <p>
                <strong>{accuracy.knockout.accuracyPct}%</strong> of decided knockout matches went the
                way the model favored ({accuracy.knockout.correct} correct, {accuracy.knockout.upsets}{" "}
                upset{accuracy.knockout.upsets === 1 ? "" : "s"}, out of {accuracy.knockout.matchesScored}
                {" "}decided so far).
              </p>
              {accuracy.knockout.brierScore !== null && (
                <div className="brier-chart">
                  <BrierBar label="2026 knockout stage (live)" value={accuracy.knockout.brierScore} highlight />
                  <BrierBar label="Coin flip" value={COIN_FLIP_BRIER} />
                </div>
              )}
              {accuracy.knockout.upsetExamples.length > 0 && (
                <>
                  <h2>Biggest Upsets So Far</h2>
                  <ul className="upset-list">
                    {accuracy.knockout.upsetExamples.map((u, i) => (
                      <li key={i}>
                        <strong>{u.winner}</strong> over {u.loser} ({u.round}) — {u.winner} was given
                        only {u.winnerPct}% beforehand.
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <p>No knockout results recorded yet.</p>
          )}

          <h2>Why Publish the Misses Too</h2>
          <p>
            A model that's never wrong isn't measuring anything — it just means the predictions
            weren't specific enough to be tested. Upsets are the model doing exactly what it's
            supposed to do: giving the underdog a real, nonzero chance, and sometimes that chance
            comes in. What matters isn't a perfect record, it's whether the probabilities themselves
            are honest — a team given a legitimate 30% shouldn't win 90% of the time, and shouldn't
            win 5% of the time either. That's what the Brier score actually measures.
          </p>
        </>
      )}
    </>
  );
}

export const page: InsightPage = {
  slug: "how-accurate-is-veridex",
  title: "How Accurate Has Veridex Been?",
  description:
    "Veridex's live prediction accuracy for the 2026 World Cup, scored with the same Brier-score methodology validated against 2010-2022 tournament results.",
  category: "Methodology",
  publishedAt: "2026-07-04",
  loadData,
  Content,
};