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
  return (
    <div className="match-log-row" data-teams={`${m.homeCode} ${m.awayCode}`}>
      <div className="match-log-top">
        <span className="match-log-teams">
          <span className={m.actual === "home" ? "match-log-winner" : ""}>{m.homeName}</span>
          {" "}<span className="match-log-score">{scoreLine}</span>{" "}
          <span className={m.actual === "away" ? "match-log-winner" : ""}>{m.awayName}</span>
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

/**
 * Plain vanilla JS, not React — these pages ship as static HTML with no
 * client-side hydration (that's what makes them crawlable/indexable).
 * A team filter still works fine as progressive enhancement: hide any
 * match row whose data-teams doesn't include the selected code, and hide
 * a whole group section if none of its rows are left visible.
 */
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
  const matches = data?.matches as GroupMatchLogEntry[] | undefined;

  const groups = new Map<string, GroupMatchLogEntry[]>();
  const teamOptions = new Map<string, string>(); // code -> name
  if (matches) {
    for (const m of matches) {
      if (!groups.has(m.group)) groups.set(m.group, []);
      groups.get(m.group)!.push(m);
      teamOptions.set(m.homeCode, m.homeName);
      teamOptions.set(m.awayCode, m.awayName);
    }
  }
  const sortedGroupLetters = [...groups.keys()].sort();
  const sortedTeams = [...teamOptions.entries()].sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <>
      <div className="eyebrow">Methodology · Match Log</div>
      <h1>Group Stage: Every Prediction vs Every Result</h1>
      <p className="dek">
        The full group-stage record, group by group — what Veridex predicted before kickoff,
        checked against what actually happened. This is the detail behind the aggregate Brier
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
            The bolded number is what actually happened.
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

          {sortedGroupLetters.map((letter) => (
            <div className="match-log-group" key={letter}>
              <h2 className="match-log-group-header">Group {letter}</h2>
              <div className="match-log">
                {groups.get(letter)!.map((m) => <MatchRow key={m.id} m={m} />)}
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
  slug: "group-stage-predictions-vs-results",
  title: "Group Stage: Every Prediction vs Every Result",
  description:
    "The complete group-stage record for Veridex's 2026 World Cup model — every match's predicted win/draw/loss probability checked against the real result.",
  category: "Methodology",
  publishedAt: "2026-07-05",
  loadData,
  Content,
};