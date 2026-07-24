import type { InsightPage } from "../types";
import { loadResultsForBuild } from "../buildTimeData";
import { getBiggestUpsets, type UpsetEntry } from "../../lib/accuracy";

async function loadData() {
  const stored = await loadResultsForBuild();
  if (!stored) return { available: false };
  const upsets = getBiggestUpsets(stored, 15);
  return { available: true, upsets };
}

function UpsetRow({ u, rank }: { u: UpsetEntry; rank: number }) {
  return (
    <li>
      <strong>#{rank} \u2014 {u.winner} {u.score} {u.loser}</strong>
      <span> ({u.stage}) \u2014 {u.winner} was given just {u.winnerPct}% beforehand.</span>
    </li>
  );
}

function Content({ data }: { data?: Record<string, unknown> }) {
  const available = data?.available as boolean | undefined;
  const upsets = data?.upsets as UpsetEntry[] | undefined;

  return (
    <>
      <div className="eyebrow">Match Analysis</div>
      <h1>The Biggest Upsets of the 2026 World Cup</h1>
      <p className="dek">
        Every result where Veridex's model gave the eventual winner less than a coin flip's
        chance \u2014 ranked by how surprising the result really was, group stage through the
        Final.
      </p>

      {!available && (
        <p>
          Live results aren't available for this build. Check back after the next update \u2014
          this page regenerates automatically as new results come in.
        </p>
      )}

      {available && upsets && upsets.length === 0 && (
        <p>No upsets recorded yet \u2014 every result so far has gone the way the model favored.</p>
      )}

      {available && upsets && upsets.length > 0 && (
        <>
          <p>
            An upset here means the actual winner was given under 50% by the model right before
            kickoff \u2014 not a subjective "surprising" result, a specific, checkable claim about
            what the model said beforehand. Ranked from most to least improbable:
          </p>
          <ul className="upset-list">
            {upsets.map((u, i) => (
              <UpsetRow key={`${u.winnerCode}-${u.loserCode}-${i}`} u={u} rank={i + 1} />
            ))}
          </ul>
          <h2>Why This List Matters</h2>
          <p>
            A model that never lists any upsets isn't measuring anything real \u2014 it just means
            the predictions weren't specific enough to be tested. Giving an underdog a genuine,
            nonzero chance and having that chance come in is the model doing exactly what it's
            supposed to do. What matters isn't a perfect record; it's whether the probabilities
            themselves were honest. The complete accuracy record, upsets and correct calls alike,
            is on the{" "}
            <a href="/insights/how-accurate-is-veridex">accuracy tracking page</a>.
          </p>
        </>
      )}
    </>
  );
}

export const page: InsightPage = {
  slug: "biggest-upsets-2026-world-cup",
  title: "The Biggest Upsets of the 2026 World Cup",
  description:
    "Ranked: every 2026 World Cup result where Veridex's model gave the eventual winner less than a 50% chance, from the group stage through the Final.",
  category: "Match Analysis",
  publishedAt: "2026-07-24",
  loadData,
  Content,
};