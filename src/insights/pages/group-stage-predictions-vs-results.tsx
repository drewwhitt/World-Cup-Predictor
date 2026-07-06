import type { InsightPage } from "../types";
import { loadResultsForBuild } from "../buildTimeData";
import { getGroupStageMatchLog, type GroupMatchLogEntry } from "../../lib/accuracy";

async function loadData() {
  const stored = await loadResultsForBuild();
  if (!stored) return { available: false };
  const matches = getGroupStageMatchLog(stored);
  return { available: true, matches };
}

function MatchRow({ m }: { m: GroupMatchLogEntry }) {
  const scoreLine = `${m.homeGoals}–${m.awayGoals}`;
  const predictedForActual =
    m.actual === "home" ? m.homeWinPct : m.actual === "away" ? m.awayWinPct : m.drawPct;
  const wasFavored = predictedForActual >= 34; // roughly "the model saw this coming" vs a real surprise

  return (
    <div className="match-log-row">
      <div className="match-log-top">
        <span className="match-log-teams">
          <span className={m.actual === "home" ? "match-log-winner" : ""}>{m.homeName}</span>
          {" "}<span className="match-log-score">{scoreLine}</span>{" "}
          <span className={m.actual === "away" ? "match-log-winner" : ""}>{m.awayName}</span>
        </span>
        <span className={wasFavored ? "match-log-tag-expected" : "match-log-tag-upset"}>
          {wasFavored ? "Expected" : "Upset"}
        </span>
      </div>
      <div className="match-log-predicted">
        <span className={m.actual === "home" ? "match-log-hit" : ""}>{m.homeName} {m.homeWinPct}%</span>
        <span className={m.actual === "draw" ? "match-log-hit" : ""}>Draw {m.drawPct}%</span>
        <span className={m.actual === "away" ? "match-log-hit" : ""}>{m.awayName} {m.awayWinPct}%</span>
      </div>
    </div>
  );
}

function Content({ data }: { data?: Record<string, unknown> }) {
  const available = data?.available as boolean | undefined;
  const matches = data?.matches as GroupMatchLogEntry[] | undefined;

  return (
    <>
      <div className="eyebrow">Methodology · Match Log</div>
      <h1>Group Stage: Every Prediction vs Every Result</h1>
      <p className="dek">
        The full group-stage record, match by match — what Veridex predicted before kickoff,
        highlighted against what actually happened. This is the detail behind the aggregate Brier
        score on the accuracy page, not a cherry-picked highlight reel.
      </p>

      {!available && (
        <p>
          Live results aren't available for this build. Check back after the next update — this
          page regenerates automatically as new results come in.
        </p>
      )}

      {available && matches && matches.length === 0 && (
        <p>No group-stage results recorded yet.</p>
      )}

      {available && matches && matches.length > 0 && (
        <>
          <p className="note">
            Percentages are what the model said BEFORE each match — never adjusted after the fact.
            The highlighted number is what actually happened. "Upset" means the actual result was
            the less-likely outcome at kickoff.
          </p>
          <div className="match-log">
            {matches.map((m) => <MatchRow key={m.id} m={m} />)}
          </div>
        </>
      )}
    </>
  );
}

export const page: InsightPage = {
  slug: "group-stage-predictions-vs-results",
  title: "Group Stage: Every Prediction vs Every Result",
  description:
    "The complete group-stage record for Veridex's 2026 World Cup model — every match's predicted win/draw/loss probability checked against the real result.",
  category: "Methodology",
  publishedAt: "2026-07-05",
  loadData,
  Content,
};