import type { InsightPage } from "../types";
import { loadResultsForBuild } from "../buildTimeData";
import { getKnockoutMatchLog, type KnockoutMatchLogEntry } from "../../lib/accuracy";

async function loadData() {
  const stored = await loadResultsForBuild();
  if (!stored) return { available: false };
  const matches = getKnockoutMatchLog(stored);
  return { available: true, matches };
}

function ProbabilityBar({ home, away }: { home: number; away: number }) {
  return (
    <div className="prob-bar">
      <div className="prob-bar-home" style={{ width: `${home}%` }} />
      <div className="prob-bar-away" style={{ width: `${away}%` }} />
    </div>
  );
}

function MatchRow({ m }: { m: KnockoutMatchLogEntry }) {
  const scoreLine = m.penaltyWinner
    ? `${m.homeGoals}–${m.awayGoals} (pens: ${m.penaltyWinner === "home" ? m.homeName : m.awayName})`
    : `${m.homeGoals}–${m.awayGoals}`;
  return (
    <div className="match-log-row" data-teams={`${m.homeCode} ${m.awayCode}`}>
      <div className="match-log-top">
        <span className="match-log-teams">
          <span className={m.winnerCode === m.homeCode ? "match-log-winner" : ""}>{m.homeName}</span>
          {" "}<span className="match-log-score">{scoreLine}</span>{" "}
          <span className={m.winnerCode === m.awayCode ? "match-log-winner" : ""}>{m.awayName}</span>
          {m.isUpset && <span className="match-log-score"> — UPSET</span>}
        </span>
      </div>
      <ProbabilityBar home={m.homeAdvancePct} away={m.awayAdvancePct} />
      <div className="match-log-predicted">
        <span className={m.winnerCode === m.homeCode ? "match-log-hit" : ""}>{m.homeName} {m.homeAdvancePct}%</span>
        <span className={m.winnerCode === m.awayCode ? "match-log-hit" : ""}>{m.awayName} {m.awayAdvancePct}%</span>
      </div>
      <div className="match-log-elo">
        <span>{m.homeName} Elo <span className="elo-value">({m.homeElo})</span></span>
        <span>{m.awayName} Elo <span className="elo-value">({m.awayElo})</span></span>
      </div>
    </div>
  );
}

const FILTER_SCRIPT = `
(function() {
  var select = document.getElementById('team-filter');
  if (!select) return;
  select.addEventListener('change', function() {
    var code = select.value;
    var groups = document.querySelectorAll('.match-log-group');
    groups.forEach(function(group) {
      var rows = group.querySelectorAll('.match-log-row');
      var anyVisible = false;
      rows.forEach(function(row) {
        var teams = (row.getAttribute('data-teams') || '').split(' ');
        var show = code === 'ALL' || teams.indexOf(code) !== -1;
        row.style.display = show ? '' : 'none';
        if (show) anyVisible = true;
      });
      group.style.display = anyVisible ? '' : 'none';
    });
  });
})();
`;

function Content({ data }: { data?: Record<string, unknown> }) {
  const available = data?.available as boolean | undefined;
  const matches = data?.matches as KnockoutMatchLogEntry[] | undefined;

  const rounds = new Map<string, KnockoutMatchLogEntry[]>();
  const teamOptions = new Map<string, string>();
  if (matches) {
    for (const m of matches) {
      if (!rounds.has(m.round)) rounds.set(m.round, []);
      rounds.get(m.round)!.push(m);
      teamOptions.set(m.homeCode, m.homeName);
      teamOptions.set(m.awayCode, m.awayName);
    }
  }
  const roundOrder = ["Round of 32", "Round of 16", "Quarterfinal", "Semifinal", "Final"];
  const sortedRounds = [...rounds.keys()].sort((a, b) => roundOrder.indexOf(a) - roundOrder.indexOf(b));
  const sortedTeams = [...teamOptions.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const upsetCount = matches?.filter((m) => m.isUpset).length ?? 0;

  return (
    <>
      <div className="eyebrow">Methodology · Match Log</div>
      <h1>Knockout Stage: Every Prediction vs Every Result</h1>
      <p className="dek">
        The complete knockout-stage record, round by round — what Veridex predicted before
        each match, checked against what actually happened. The companion page to the{" "}
        <a href="/insights/group-stage-predictions-vs-results">group-stage match log</a>.
      </p>

      {!available && (
        <p>
          Live results aren't available for this build. Check back after the next update —
          this page regenerates automatically as new results come in.
        </p>
      )}

      {available && matches && matches.length === 0 && (
        <p>No knockout-stage results recorded yet.</p>
      )}

      {available && matches && matches.length > 0 && (
        <>
          <p className="note">
            Percentages are advancement probabilities — what the model said BEFORE each match,
            never adjusted after the fact. {upsetCount} of {matches.length} knockout matches went
            against the model's favorite.
          </p>

          <div className="match-log-filter">
            <label htmlFor="team-filter">Filter by team</label>
            <select id="team-filter" defaultValue="ALL">
              <option value="ALL">All teams</option>
              {sortedTeams.map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          </div>

          {sortedRounds.map((round) => (
            <div className="match-log-group" key={round}>
              <h2 className="match-log-group-header">{round}</h2>
              <div className="match-log">
                {rounds.get(round)!.map((m) => <MatchRow key={m.id} m={m} />)}
              </div>
            </div>
          ))}

          <script dangerouslySetInnerHTML={{ __html: FILTER_SCRIPT }} />
        </>
      )}
    </>
  );
}

export const page: InsightPage = {
  slug: "knockout-stage-predictions-vs-results",
  title: "Knockout Stage: Every Prediction vs Every Result",
  description:
    "The complete knockout-stage record for Veridex's 2026 World Cup model — every match's predicted advancement probability, checked against the real result, round by round.",
  category: "Methodology",
  publishedAt: "2026-07-24",
  loadData,
  Content,
};