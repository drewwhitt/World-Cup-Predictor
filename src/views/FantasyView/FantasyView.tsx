import { useEffect, useMemo, useState } from "react";
import { loadLatestFantasyRankings } from "../../lib/fantasy/rankings";
import { computeFantasyForecast } from "../../lib/fantasy/forecast";
import { getPrecomputedForecast } from "../../lib/fantasy/precomputed";
import { LEAGUE_SIZE_PRESETS, STANDARD_ROSTER, type Position, type RosterConfig } from "../../lib/fantasy/types";
import type { AdpVsActualEntry, FantasyRankingsPayload } from "../../lib/fantasy/types";
import type { SimulationResult } from "../../lib/fantasy/simulate";
import adpVsActualData from "../../data/fantasy/adp-vs-actual-2021-2024.json";
import s from "./FantasyView.module.css";

const SEASON = 2026;
const SIMULATIONS = 10000;

// Bundled for the live-compute fallback (custom rosters only — the
// precomputed presets are generated offline by
// scripts/generate-fantasy-forecast.ts, which also applies real
// per-player risk factors from actual games-missed data. The live
// client path deliberately skips risk factors and uses the base curve
// fit only — a known, modest simplification for the uncommon
// custom-roster case, not something worth bundling live injury data
// into the client for.
const FIT_POOL: AdpVsActualEntry[] = Object.values(
  (adpVsActualData as { seasons: Record<string, AdpVsActualEntry[]> }).seasons,
).flat();

type SortKey = "adp" | "value" | "vbd";
type PosFilter = "ALL" | Position;

function confidenceLabel(sd: number, mean: number): { label: string; cls: string } {
  const ratio = mean > 0 ? sd / mean : 1;
  if (ratio < 0.12) return { label: "High", cls: s.confHigh };
  if (ratio < 0.16) return { label: "Medium", cls: s.confMed };
  return { label: "Volatile", cls: s.confLow };
}

function confidenceDetail(cls: string): string {
  if (cls === s.confHigh) {
    return "Simulations cluster tightly around the projection — an established, low-variance role with no major injury or situation flags.";
  }
  if (cls === s.confMed) {
    return "Moderate spread across simulations — some role or health uncertainty widens the range of likely outcomes.";
  }
  return "Wide spread between simulations — often tied to injury history, a contested backfield or target share, or an unproven/new role.";
}

function reasonFor(position: Position, positive: boolean): string {
  if (positive) {
    if (position === "QB" || position === "TE") {
      return `the market tends to discount elite ${position} seasons relative to true value over replacement`;
    }
    return "the model's simulations show more opportunity and efficiency than the market ranking reflects";
  }
  if (position === "RB") return "committee backfield risk and the steeper aging curve typical at the position";
  if (position === "WR") return "target-share competition or scheme uncertainty in the model's simulations";
  if (position === "QB") return "a contested starting job or injury history weighing on the model's simulations";
  return "increased target competition or a blocking-heavy role limiting receiving upside";
}

function whyDiffers(delta: number, position: Position): string {
  const ad = Math.round(Math.abs(delta));
  const direction = delta > 0 ? "higher" : "lower";
  if (ad === 0) return "ADP and Value Rank are aligned — the model doesn't differ from consensus here.";
  if (ad <= 3) return `ADP is ${direction} than Value Rank by ${ad} — the model is roughly aligned with consensus here.`;
  if (ad <= 9) return `ADP is ${direction} than Value Rank by ${ad}, a moderate difference — ${reasonFor(position, delta > 0)}.`;
  return `ADP is ${direction} than Value Rank by ${ad}, a large discrepancy — ${reasonFor(position, delta > 0)}.`;
}

/** Approximates "where would this point total have ranked" using each player's own implied replacement level (backed out from meanPoints - meanVbd), against the full result set's meanVbd distribution. An approximation built from already-computed aggregate output, not a new simulation run. */
function impliedValueRankFromPoints(points: number, subject: SimulationResult, all: SimulationResult[]): number {
  const impliedReplacementLevel = subject.meanPoints - subject.meanVbd;
  const impliedVbd = points - impliedReplacementLevel;
  let rank = 1;
  for (const r of all) if (r.meanVbd > impliedVbd) rank++;
  return rank;
}

export function FantasyView() {
  const [rankings, setRankings] = useState<{ date: string; payload: FantasyRankingsPayload } | "loading" | null>("loading");
  const [teams, setTeams] = useState<number>(12);
  const [roster, setRoster] = useState<RosterConfig>({ ...STANDARD_ROSTER });
  const [posFilter, setPosFilter] = useState<PosFilter>("ALL");
  const [sortBy, setSortBy] = useState<SortKey>("adp");
  const [expandedName, setExpandedName] = useState<string | null>(null);
  const [results, setResults] = useState<SimulationResult[] | null>(null);
  const [computing, setComputing] = useState(false);

  useEffect(() => {
    let active = true;
    loadLatestFantasyRankings(SEASON)
      .then((r) => { if (active) setRankings(r); })
      .catch(() => { if (active) setRankings(null); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (rankings === "loading" || rankings === null) return;

    const precomputed = getPrecomputedForecast(teams, roster, SEASON, rankings.date);
    if (precomputed) {
      setResults(precomputed.results);
      setComputing(false);
      if (expandedName === null) setExpandedName(precomputed.results[0]?.name ?? null);
      return;
    }

    setComputing(true);
    setResults(null);
    // Deferred by one tick so React actually commits and paints the
    // "computing" state (with its spinner) before the blocking
    // computation runs — without this, the browser can do both in the
    // same frame and the spinner would appear to never move.
    const timer = setTimeout(() => {
      const computed = computeFantasyForecast(rankings.payload.entries, FIT_POOL, teams, roster, new Map(), SIMULATIONS);
      setResults(computed);
      setComputing(false);
      if (expandedName === null) setExpandedName(computed[0]?.name ?? null);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 20);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankings, teams, JSON.stringify(roster)]);

  const sorted = useMemo(() => {
    if (!results) return [];
    const filtered = posFilter === "ALL" ? results : results.filter((r) => r.position === posFilter);
    return [...filtered].sort((a, b) => {
      if (sortBy === "value") return a.meanValueRank - b.meanValueRank;
      if (sortBy === "vbd") return b.meanVbd - a.meanVbd;
      return a.adp - b.adp;
    });
  }, [results, posFilter, sortBy]);

  const { biggestValue, biggestRisk } = useMemo(() => {
    if (!results || results.length === 0) return { biggestValue: null, biggestRisk: null };
    const withDelta = results.map((r) => ({ r, delta: r.adp - r.meanValueRank }));
    const best = [...withDelta].sort((a, b) => b.delta - a.delta)[0];
    const worst = [...withDelta].sort((a, b) => a.delta - b.delta)[0];
    return { biggestValue: best, biggestRisk: worst };
  }, [results]);

  function handleTeamPill(newTeams: number) {
    setTeams(newTeams);
    setRoster({ ...STANDARD_ROSTER });
  }

  function handleRosterField(field: keyof Omit<RosterConfig, "flexEligible">, value: number) {
    setRoster((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <>
      <section className={s.masthead}>
        <div className={s.eyebrow}>FANTASY · PPR REDRAFT</div>
        <h1>{SEASON} Preseason Board</h1>
        <div className={s.subline}>
          <div className={s.sublineLeft}>Model rank reflects value over replacement for the league settings below — not raw projected points.</div>
          {rankings !== "loading" && rankings !== null && (
            <div className={s.asOf}>RANKINGS AS OF {new Date(rankings.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase()}</div>
          )}
        </div>
      </section>

      {rankings === "loading" && <p className={s.stateMessage}>Loading rankings…</p>}

      {rankings === null && (
        <p className={s.stateMessage}>
          No rankings have been pushed for the {SEASON} season yet. Once a consensus ranking snapshot is pushed from the admin panel, the board will appear here.
        </p>
      )}

      {rankings !== "loading" && rankings !== null && (
        <>
          <div className={s.panel}>
            <div className={s.panelTitle}>League Settings</div>
            <div className={s.row} style={{ marginBottom: 14 }}>
              <span className={s.label}>Teams</span>
              <div className={s.pillset}>
                {LEAGUE_SIZE_PRESETS.map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={teams === size ? `${s.pill} ${s.pillActive}` : s.pill}
                    onClick={() => handleTeamPill(size)}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
            <div className={s.row}>
              <span className={s.label}>Roster</span>
              <div className={s.rosterFields}>
                {(["QB", "RB", "WR", "TE", "FLEX"] as const).map((field) => (
                  <div className={s.field} key={field}>
                    <label htmlFor={`roster-${field}`}>{field}</label>
                    <input
                      id={`roster-${field}`}
                      type="number"
                      min={0}
                      max={field === "FLEX" ? 4 : 6}
                      value={roster[field]}
                      onChange={(e) => handleRosterField(field, Number(e.target.value) || 0)}
                    />
                  </div>
                ))}
                <span className={s.rosterNote}>FLEX eligible: RB / WR / TE</span>
              </div>
            </div>
          </div>

          <div className={s.glossary}>
            <div className={s.glossaryItem}>
              <div className={s.glossaryTerm}>VALUE (VBD)</div>
              <div className={s.glossaryDef}><b>Points above a replacement-level player</b> at the same position, given your league settings. High VBD means a big talent gap over what's freely available late or on waivers — it measures <b>how good</b> a season is, not <b>when</b> you need to draft them to get it. "Value Rk" is simply every player sorted by this same VBD number — the two always move together.</div>
            </div>
            <div className={s.glossaryItem}>
              <div className={s.glossaryTerm}>RANGE</div>
              <div className={s.glossaryDef}>The <b>10th–90th percentile</b> of simulated season point totals across 10,000 Monte Carlo runs. Click any player to see it.</div>
            </div>
            <div className={s.glossaryItem}>
              <div className={s.glossaryTerm}>CONFIDENCE</div>
              <div className={s.glossaryDef}>Derived from that same range. <b>High</b> = simulations cluster tightly. <b>Medium</b> = a moderate spread. <b>Volatile</b> = a wide spread — boom/bust profile. Click a player for the driver.</div>
            </div>
            <div className={s.glossaryItem}>
              <div className={s.glossaryTerm}>TAGS</div>
              <div className={s.glossaryDef}><b>Sleeper</b> = Value Rank is at least 10 spots better than ADP. <b>Risk</b> = Value Rank is at least 10 spots worse than ADP.</div>
            </div>
          </div>

          {computing && (
            <div className={s.computingState}>
              <div className={s.spinner} />
              <div>Computing your custom league's projections — this can take a moment for non-standard rosters…</div>
            </div>
          )}

          {!computing && results && (
            <>
              <div className={s.callouts}>
                {biggestValue && (
                  <div className={`${s.callout} ${s.calloutValue}`}>
                    <div className={s.calloutLabel}>Biggest Value</div>
                    <div className={s.calloutPlayer}>{biggestValue.r.name}</div>
                    <div className={s.calloutDetail}>Drafted <b>#{Math.round(biggestValue.r.adp)}</b> · Model rank <b>#{Math.round(biggestValue.r.meanValueRank)}</b> for a {teams}-team league</div>
                  </div>
                )}
                {biggestRisk && (
                  <div className={`${s.callout} ${s.calloutRisk}`}>
                    <div className={s.calloutLabel}>Biggest Risk</div>
                    <div className={s.calloutPlayer}>{biggestRisk.r.name}</div>
                    <div className={s.calloutDetail}>Drafted <b>#{Math.round(biggestRisk.r.adp)}</b> · Model rank <b>#{Math.round(biggestRisk.r.meanValueRank)}</b> for a {teams}-team league</div>
                  </div>
                )}
              </div>

              <div className={s.boardNote}>
                Board is ordered by consensus ADP — the realistic order players actually come off the board. Click any column header to sort by it instead, or click a player for the full breakdown.
              </div>

              <div className={s.tabs}>
                {(["ALL", "QB", "RB", "WR", "TE"] as const).map((p) => (
                  <button key={p} type="button" className={posFilter === p ? `${s.tab} ${s.tabActive}` : s.tab} onClick={() => setPosFilter(p)}>{p}</button>
                ))}
              </div>

              <table className={s.table}>
                <colgroup>
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "38%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "12%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className={s.sortable} onClick={() => setSortBy("adp")}>ADP{sortBy === "adp" && <span className={s.arrow}>▾</span>}</th>
                    <th className={s.sortable} onClick={() => setSortBy("value")}>Value Rk{sortBy === "value" && <span className={s.arrow}>▾</span>}</th>
                    <th>Player</th>
                    <th className={s.right}>Pos</th>
                    <th className={`${s.right} ${s.sortable}`} onClick={() => setSortBy("vbd")}>VBD{sortBy === "vbd" && <span className={s.arrow}>▾</span>}</th>
                    <th className={s.right}>Conf.</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => {
                    const delta = r.adp - r.meanValueRank;
                    const conf = confidenceLabel(r.sd, r.meanPoints);
                    const isExpanded = expandedName === r.name;
                    const tag = delta >= 10 ? <span className={`${s.tag} ${s.tagSleeper}`}>SLEEPER</span>
                      : delta <= -10 ? <span className={`${s.tag} ${s.tagBust}`}>RISK</span> : null;

                    return (
                      <FragmentRow
                        key={r.name}
                        result={r}
                        delta={delta}
                        conf={conf}
                        tag={tag}
                        isExpanded={isExpanded}
                        allResults={results}
                        onClick={() => setExpandedName(isExpanded ? null : r.name)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </>
  );
}

function FragmentRow({
  result, delta, conf, tag, isExpanded, allResults, onClick,
}: {
  result: SimulationResult;
  delta: number;
  conf: { label: string; cls: string };
  tag: React.ReactNode;
  isExpanded: boolean;
  allResults: SimulationResult[];
  onClick: () => void;
}) {
  return (
    <>
      <tr className={isExpanded ? `${s.playerRow} ${s.playerRowExpanded}` : s.playerRow} onClick={onClick}>
        <td className={s.num}>{Math.round(result.adp)}</td>
        <td className={`${s.num} ${s.rk}`}>{Math.round(result.meanValueRank)}</td>
        <td><span className={s.playerName}>{result.name}</span></td>
        <td className={`${s.right} ${s.posCell}`}><span className={s.posChip}>{result.position}</span></td>
        <td className={`${s.num} ${s.right}`}>{Math.round(result.meanVbd)}</td>
        <td className={`${conf.cls} ${s.right}`}>{conf.label}</td>
        <td>{tag}</td>
      </tr>
      {isExpanded && (
        <tr className={s.detailRow}>
          <td colSpan={7}>
            <div className={s.detailGrid}>
              <div className={s.detailBlock}>
                <div className={s.detailLabel}>Why the model differs</div>
                <div className={s.detailText}>{whyDiffers(delta, result.position)}</div>
              </div>
              <div className={s.detailBlock}>
                <div className={s.detailLabel}>Range (10th–90th pctile)</div>
                <div className={s.detailValue}>{Math.round(result.p10Points)}–{Math.round(result.p90Points)} pts</div>
                <div className={s.detailText}>Projected mean: {Math.round(result.meanPoints)} pts.</div>
                <div className={s.detailSubtext}>
                  At {Math.round(result.p10Points)} pts, that season would rank around Value #{impliedValueRankFromPoints(result.p10Points, result, allResults)}.
                  {" "}At {Math.round(result.p90Points)} pts, around Value #{impliedValueRankFromPoints(result.p90Points, result, allResults)}.
                </div>
              </div>
              <div className={s.detailBlock}>
                <div className={s.detailLabel}>Confidence — {conf.label}</div>
                <div className={s.detailText}>{confidenceDetail(conf.cls)}</div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}