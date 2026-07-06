import type { InsightPage } from "../types";
import { loadResultsForBuild } from "../buildTimeData";
import { getGroupStageMatchLog, type GroupMatchLogEntry } from "../../lib/accuracy";
import { computeStandings, type StandingRow } from "../../lib/groups";
import { GROUP_MATCHES } from "../../data";
import { TEAM_BY_CODE } from "../../lib/teams";
import type { GroupLetter } from "../../lib/types";

async function loadData() {
  const stored = await loadResultsForBuild();
  if (!stored) return { available: false };
  const matches = getGroupStageMatchLog(stored);
  const playedMatches = GROUP_MATCHES.map((m) => {
    const r = stored.matches[m.id];
    return r ? { ...m, played: true, homeGoals: r.homeGoals, awayGoals: r.awayGoals } : m;
  });
  const standings = computeStandings(playedMatches);
  return { available: true, matches, standings };
}

function ProbabilityBar({ home, draw, away }: { home: number; draw: number; away: number }) {
  return (
    <div className="prob-bar">
      <div className="prob-bar-home" style={{ width: `${home}%` }} />
      <div className="prob-bar-draw" style={{ width: `${draw}%` }} />
      <div className="prob-bar-away" style={{ width: `${away}%` }} />
    </div>
  );
}

function EloChange({ delta }: { delta: number }) {
  if (delta === 0) return <span className="elo-flat">±0</span>;
  return <span className={delta > 0 ? "elo-up" : "elo-down"}>{delta > 0 ? "+" : ""}{delta}</span>;
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
      <ProbabilityBar home={m.homeWinPct} draw={m.drawPct} away={m.awayWinPct} />
      <div className="match-log-predicted">
        <span className={m.actual === "home" ? "match-log-hit" : ""}>{m.homeName} {m.homeWinPct}%</span>
        <span className={m.actual === "draw" ? "match-log-hit" : ""}>Draw {m.drawPct}%</span>
        <span className={m.actual === "away" ? "match-log-hit" : ""}>{m.awayName} {m.awayWinPct}%</span>
      </div>
      <div className="match-log-elo">
        <span>{m.homeName} Elo <EloChange delta={m.homeEloDelta} /></span>
        <span>{m.awayName} Elo <EloChange delta={m.awayEloDelta} /></span>
      </div>
    </div>
  );
}

function StandingsTable({ rows }: { rows: StandingRow[] }) {
  const sorted = [...rows].sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);
  return (
    <div className="standings-table">
      <div className="standings-header-row">
        <span className="standings-team-col">Team</span>
        <span>P</span><span>W</span><span>D</span><span>L</span><span>GD</span><span>Pts</span>
      </div>
      {sorted.map((r, i) => (
        <div key={r.team} className={i < 2 ? "standings-row standings-qualified" : "standings-row"}>
          <span className="standings-team-col">{TEAM_BY_CODE[r.team]?.name ?? r.team}</span>
          <span>{r.played}</span><span>{r.won}</span><span>{r.drawn}</span><span>{r.lost}</span>
          <span>{r.gd > 0 ? "+" : ""}{r.gd}</span><span>{r.points}</span>
        </div>
      ))}
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
  const standings = data?.standings as Record<GroupLetter, StandingRow[]> | undefined;

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
        checked against what actually happened, plus how each result moved both teams' Elo. This
        is the detail behind the aggregate Brier score on the accuracy page, not a cherry-picked
        highlight reel.
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
            The bolded number is what actually happened. Elo changes shown are this match's effect
            only, not the team's total movement since the tournament began.
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
              {standings?.[letter as GroupLetter] && (
                <StandingsTable rows={standings[letter as GroupLetter]} />
              )}
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
    "The complete group-stage record for Veridex's 2026 World Cup model — every match's predicted win/draw/loss probability, Elo impact, and group standings, checked against the real result.",
  category: "Methodology",
  publishedAt: "2026-07-05",
  loadData,
  Content,
};