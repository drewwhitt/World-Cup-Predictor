import { useMemo, useState } from "react";
import { getWorldCupPeriods, buildMatchCenterEntries, getPeriodStatuses, type MatchCenterEntry } from "../../lib/matchCenter";
import { getCurrentPeriodId } from "../../lib/periods";
import { TEAM_BY_CODE } from "../../lib/teams";
import type { StoredResults, TeamCode } from "../../lib/types";
import s from "./MatchCenterView.module.css";

function MatchRow({ m }: { m: MatchCenterEntry }) {
  const played = m.played && m.homeGoals !== undefined && m.awayGoals !== undefined;
  return (
    <div className={s.row}>
      <div className={s.teams}>
        <span className={played && m.homeGoals! > m.awayGoals! ? s.winner : ""}>{m.homeName}</span>
        {played ? (
          <span className={s.score}>{m.homeGoals}–{m.awayGoals}{m.penaltyWinner ? " (pens)" : ""}</span>
        ) : (
          <span className={s.vs}>vs</span>
        )}
        <span className={played && m.awayGoals! > m.homeGoals! ? s.winner : ""}>{m.awayName}</span>
      </div>
      <div className={s.meta}>
        <span>{m.date}</span>
        {!played && <span className={s.upcomingTag}>Upcoming</span>}
        {played && !m.isKnockout && <span className={s.playedTag}>Final</span>}
      </div>
    </div>
  );
}

export function MatchCenterView({ stored }: { stored: StoredResults }) {
  const periods = useMemo(() => getWorldCupPeriods(), []);
  const entries = useMemo(() => buildMatchCenterEntries(stored), [stored]);
  const statuses = useMemo(() => getPeriodStatuses(entries, periods), [entries, periods]);
  const currentPeriodId = useMemo(() => getCurrentPeriodId(periods, statuses), [periods, statuses]);

  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null); // null = "use current period"
  const [teamFilter, setTeamFilter] = useState<TeamCode | "ALL">("ALL");

  const activePeriodId = selectedPeriod ?? currentPeriodId;

  const teamOptions = useMemo(() => {
    const codes = new Set<TeamCode>();
    for (const e of entries) {
      if (e.homeCode) codes.add(e.homeCode);
      if (e.awayCode) codes.add(e.awayCode);
    }
    return [...codes].sort((a, b) => (TEAM_BY_CODE[a]?.name ?? a).localeCompare(TEAM_BY_CODE[b]?.name ?? b));
  }, [entries]);

  const visibleMatches = useMemo(() => {
    let list = entries;
    if (teamFilter !== "ALL") {
      list = list.filter((e) => e.homeCode === teamFilter || e.awayCode === teamFilter);
    } else {
      list = list.filter((e) => e.periodId === activePeriodId);
    }
    return [...list].sort((a, b) => a.date.localeCompare(b.date));
  }, [entries, teamFilter, activePeriodId]);

  const activePeriod = periods.find((p) => p.id === activePeriodId);

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div className={s.eyebrow}>Veridex Model · Match Center</div>
        <h1>Match Center</h1>
        <p className={s.dek}>
          Every match, filtered by round or by team — defaults to whatever's happening right now.
        </p>
      </div>

      <div className={s.controls}>
        <div className={s.periodTabs}>
          {periods.map((p) => (
            <button
              key={p.id}
              type="button"
              className={p.id === activePeriodId && teamFilter === "ALL" ? s.tabActive : s.tab}
              onClick={() => {
                setSelectedPeriod(p.id);
                setTeamFilter("ALL");
              }}
            >
              {p.label}
              {p.id === currentPeriodId && <span className={s.currentDot} title="Current" />}
            </button>
          ))}
        </div>

        <select
          className={s.teamPicker}
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value as TeamCode | "ALL")}
        >
          <option value="ALL">Filter by team…</option>
          {teamOptions.map((code) => (
            <option key={code} value={code}>{TEAM_BY_CODE[code]?.name ?? code}</option>
          ))}
        </select>
      </div>

      <div className={s.listHeader}>
        {teamFilter !== "ALL"
          ? `All ${TEAM_BY_CODE[teamFilter]?.name ?? teamFilter} matches`
          : activePeriod?.label ?? ""}
        <span className={s.count}>{visibleMatches.length} match{visibleMatches.length === 1 ? "" : "es"}</span>
      </div>

      {visibleMatches.length === 0 ? (
        <p className={s.empty}>No matches to show here yet.</p>
      ) : (
        <div className={s.list}>
          {visibleMatches.map((m) => <MatchRow key={m.id} m={m} />)}
        </div>
      )}
    </div>
  );
}