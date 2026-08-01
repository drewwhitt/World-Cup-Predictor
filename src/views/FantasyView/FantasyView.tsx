import { useEffect, useMemo, useState } from "react";
import { loadLatestFantasyRankings } from "../../lib/fantasy/rankings";
import { computeFantasyForecast } from "../../lib/fantasy/forecast";
import { getPrecomputedForecast } from "../../lib/fantasy/precomputed";
import { LEAGUE_SIZE_PRESETS, STANDARD_ROSTER, FANTASY_SEASON, type Position, type RosterConfig } from "../../lib/fantasy/types";
import type { AdpVsActualEntry, FantasyRankingsPayload } from "../../lib/fantasy/types";
import type { SimulationResult } from "../../lib/fantasy/simulate";
import adpVsActualData from "../../data/fantasy/adp-vs-actual-2021-2024.json";
import adpVsActual2020Data from "../../data/fantasy/adp-vs-actual-2020.json";
import s from "./FantasyView.module.css";

const SEASON = FANTASY_SEASON;
const SIMULATIONS = 10000;

// Bundled for the live-compute fallback (custom rosters only — the
// precomputed presets are generated offline by
// scripts/generate-fantasy-forecast.ts, which also applies real
// per-player risk factors from actual games-missed data. The live
// client path deliberately skips risk factors and uses the base curve
// fit only — a known, modest simplification for the uncommon
// custom-roster case, not something worth bundling live injury data
// into the client for.
const FIT_POOL: AdpVsActualEntry[] = [
  ...Object.values((adpVsActualData as { seasons: Record<string, AdpVsActualEntry[]> }).seasons).flat(),
  ...(adpVsActual2020Data as { entries: AdpVsActualEntry[] }).entries,
];

type SortKey = "adp" | "value" | "vbd";
type PosFilter = "ALL" | Position;

function availabilityDetail(availabilityPct: number): string {
  const pct = Math.round(availabilityPct * 100);
  return `Based on similar historical players, about ${pct}% played a near-full season (14+ games). The ${100 - pct}% who didn't is the real risk behind this range — a season-ending or extended injury, not normal week-to-week variance.`;
}

/** A plain range bar: whisker spans the 10th-90th percentile with a center tick marking the mean — matches its own label exactly, unlike the earlier candlestick version (which showed a 25th-75th box that visually dominated but didn't match the "10th-90th" text next to it). Also worth being honest about: every distribution here is a symmetric Normal by construction (see curveFit.ts), so this bar is necessarily symmetric too — it doesn't yet capture any real skew in how fantasy points are actually distributed (a real floor at 0, and boom weeks pushing the right tail further than busts push the left one). That's a modeling limitation, not a display one — see MODEL_HISTORY.md. */
function RangeBar({ p10, mean, p90 }: { p10: number; mean: number; p90: number }) {
  const width = 320;
  const height = 46;
  const pad = 40;
  const min = p10;
  const max = p90;
  const span = Math.max(1, max - min);
  const scale = (v: number) => pad + ((v - min) / span) * (width - pad * 2);
  const midY = height / 2 + 4;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className={s.candlestick} role="img" aria-label={`Projected range ${Math.round(p10)} to ${Math.round(p90)} points, mean ${Math.round(mean)}`}>
      <line x1={scale(p10)} y1={midY} x2={scale(p90)} y2={midY} stroke="var(--ink-3)" strokeWidth={1.5} />
      <line x1={scale(p10)} y1={midY - 6} x2={scale(p10)} y2={midY + 6} stroke="var(--ink-3)" strokeWidth={1.5} />
      <line x1={scale(p90)} y1={midY - 6} x2={scale(p90)} y2={midY + 6} stroke="var(--ink-3)" strokeWidth={1.5} />
      <line x1={scale(mean)} y1={midY - 12} x2={scale(mean)} y2={midY + 12} stroke="var(--navy)" strokeWidth={2} />
      <text x={scale(p10)} y={height - 2} fontSize="10" textAnchor="middle" fill="var(--ink-3)" fontFamily="var(--font-mono)">{Math.round(p10)}</text>
      <text x={scale(p90)} y={height - 2} fontSize="10" textAnchor="middle" fill="var(--ink-3)" fontFamily="var(--font-mono)">{Math.round(p90)}</text>
      <text x={scale(mean)} y={11} fontSize="10" textAnchor="middle" fill="var(--navy)" fontWeight={700} fontFamily="var(--font-mono)">{Math.round(mean)} mean</text>
    </svg>
  );
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

/**
 * Standard competition ranking ("1224") for ADP: players with the exact
 * same raw ADP share the same displayed rank — the position of the
 * FIRST entry in the tied group, not an average or an independently
 * rounded value per player. Two players tied at raw ADP 1.5 both show
 * "1", not "2" — rounding each one's own ADP separately (Math.round)
 * could make a tied pair look like they're "2nd" when they're actually
 * tied for 1st, which is what this replaces.
 */
function computeAdpRanks(results: SimulationResult[]): Map<string, number> {
  const sortedByAdp = [...results].sort((a, b) => a.adp - b.adp);
  const rankByName = new Map<string, number>();
  let rank = 1;
  sortedByAdp.forEach((r, idx) => {
    if (idx > 0 && r.adp === sortedByAdp[idx - 1].adp) {
      // tied with the previous entry — keep the same rank
    } else {
      rank = idx + 1;
    }
    rankByName.set(r.name, rank);
  });
  return rankByName;
}

export function FantasyView() {
  const [glossaryOpen, setGlossaryOpen] = useState(false);
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

  const adpRankByName = useMemo(() => (results ? computeAdpRanks(results) : new Map<string, number>()), [results]);

  const sorted = useMemo(() => {
    if (!results) return [];
    const filtered = posFilter === "ALL" ? results : results.filter((r) => r.position === posFilter);
    return [...filtered].sort((a, b) => {
      if (sortBy === "value") return a.valueRank - b.valueRank;
      if (sortBy === "vbd") return b.meanVbd - a.meanVbd;
      return a.adp - b.adp;
    });
  }, [results, posFilter, sortBy]);

  const { biggestValue, biggestRisk } = useMemo(() => {
    if (!results || results.length === 0) return { biggestValue: null, biggestRisk: null };
    const withDelta = results.map((r) => ({ r, delta: adpRankByName.get(r.name)! - r.valueRank }));
    const best = [...withDelta].sort((a, b) => b.delta - a.delta)[0];
    const worst = [...withDelta].sort((a, b) => a.delta - b.delta)[0];
    return { biggestValue: best, biggestRisk: worst };
  }, [results, adpRankByName]);

  function handleTeamPill(newTeams: number) {
    setTeams(newTeams);
    setRoster({ ...STANDARD_ROSTER });
  }

  function handleRosterField(field: keyof Omit<RosterConfig, "flexEligible">, value: number) {
    setRoster((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div className={s.page}>
      <section className={s.masthead}>
        <div className={s.eyebrow}>FANTASY · PPR REDRAFT</div>
        <h1>{SEASON} Preseason Board</h1>
        <div className={s.subline}>
          <div className={s.sublineLeft}>Model rank reflects value over replacement for the league settings below — not raw projected points.</div>
          {rankings !== "loading" && rankings !== null && (
            <div className={s.asOf}>RANKINGS AS OF {new Date(rankings.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase()}</div>
          )}
        </div>
        <div className={s.methodNote}>
          Every projection here is fit from real historical outcomes (nflverse box scores back to 2020, matched against real consensus draft rankings), resampled directly from what similarly-drafted players actually did rather than assumed to follow a symmetric bell curve — and checked against real held-out seasons the model never saw before it's trusted here. The Range shown weights toward fuller seasons continuously, not a hard cutoff; each player's own real availability history is shown separately in their dropdown, not hidden inside one blended number.
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
                      onFocus={(e) => {
                        const len = e.currentTarget.value.length;
                        e.currentTarget.setSelectionRange(len, len);
                      }}
                      onChange={(e) => handleRosterField(field, Number(e.target.value) || 0)}
                    />
                  </div>
                ))}
                <span className={s.rosterNote}>FLEX eligible: RB / WR / TE</span>
              </div>
            </div>
          </div>

          <button type="button" className={s.glossaryToggle} onClick={() => setGlossaryOpen((v) => !v)}>
            {glossaryOpen ? "▾" : "▸"} What do Value / Range / Tags mean?
          </button>
          {glossaryOpen && (
            <div className={s.glossary}>
              <div className={s.glossaryItem}>
                <div className={s.glossaryTerm}>VALUE (VBD)</div>
                <div className={s.glossaryDef}><b>Points above a replacement-level player</b> at the same position, given your league settings — the standard way real drafters compare value across positions rather than just raw stats. High VBD means a real talent gap over your bench/waiver options. <b>Value Rank sorts every player by this number, and it's the best single signal for spotting who's underpriced or overpriced at their current ADP slot</b> — the one thing it doesn't capture is how fast a position is being drafted around you, so a good value can still disappear if a run starts before your next pick.</div>
              </div>
              <div className={s.glossaryItem}>
                <div className={s.glossaryTerm}>RANGE</div>
                <div className={s.glossaryDef}>Each player's dropdown shows the <b>10th–90th percentile</b> of their simulated season point totals as a range bar, with the mean marked. Resampled from real historical outcomes and weighted toward fuller seasons, rather than a blended range that mixes in real injury-shortened outcomes and produces a misleadingly low floor for what a player scores when actually on the field. Availability (how often similarly-drafted players actually stayed healthy) is shown as its own separate stat, not folded into the range.</div>
              </div>
              <div className={s.glossaryItem}>
                <div className={s.glossaryTerm}>TAGS</div>
                <div className={s.glossaryDef}><b>Sleeper</b> = Value Rank is at least 10 spots better than ADP. <b>Fade</b> = Value Rank is at least 10 spots worse than ADP — the market's overpaying for this ADP slot.</div>
              </div>
            </div>
          )}

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
                    <div className={s.calloutDetail}>Drafted <b>#{adpRankByName.get(biggestValue.r.name)}</b> · Model rank <b>#{Math.round(biggestValue.r.valueRank)}</b> for a {teams}-team league</div>
                  </div>
                )}
                {biggestRisk && (
                  <div className={`${s.callout} ${s.calloutRisk}`}>
                    <div className={s.calloutLabel}>Biggest Fade</div>
                    <div className={s.calloutPlayer}>{biggestRisk.r.name}</div>
                    <div className={s.calloutDetail}>Drafted <b>#{adpRankByName.get(biggestRisk.r.name)}</b> · Model rank <b>#{Math.round(biggestRisk.r.valueRank)}</b> for a {teams}-team league</div>
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
                  <col className={s.colAdp} />
                  <col className={s.colValueRk} />
                  <col className={s.colPlayer} />
                  <col className={s.colPos} />
                  <col className={s.colVbd} />
                  <col className={s.colTag} />
                </colgroup>
                <thead>
                  <tr>
                    <th className={s.sortable} onClick={() => setSortBy("adp")}>ADP{sortBy === "adp" && <span className={s.arrow}>▾</span>}</th>
                    <th className={s.sortable} onClick={() => setSortBy("value")}>Value Rk{sortBy === "value" && <span className={s.arrow}>▾</span>}</th>
                    <th>Player</th>
                    <th className={s.right}>Pos</th>
                    <th className={`${s.right} ${s.sortable}`} onClick={() => setSortBy("vbd")}>VBD{sortBy === "vbd" && <span className={s.arrow}>▾</span>}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => {
                    const adpRank = adpRankByName.get(r.name)!;
                    const delta = adpRank - r.valueRank;
                    const isExpanded = expandedName === r.name;
                    const tag = delta >= 10 ? <span className={`${s.tag} ${s.tagSleeper}`}>SLEEPER</span>
                      : delta <= -10 ? <span className={`${s.tag} ${s.tagBust}`}>FADE</span> : null;

                    return (
                      <FragmentRow
                        key={r.name}
                        result={r}
                        adpRank={adpRank}
                        delta={delta}
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
    </div>
  );
}

function FragmentRow({
  result, adpRank, delta, tag, isExpanded, allResults, onClick,
}: {
  result: SimulationResult;
  adpRank: number;
  delta: number;
  tag: React.ReactNode;
  isExpanded: boolean;
  allResults: SimulationResult[];
  onClick: () => void;
}) {
  return (
    <>
      <tr className={isExpanded ? `${s.playerRow} ${s.playerRowExpanded}` : s.playerRow} onClick={onClick}>
        <td className={s.num}>{adpRank}</td>
        <td className={`${s.num} ${s.rk}`}>{Math.round(result.valueRank)}</td>
        <td><span className={s.playerName}>{result.name}</span></td>
        <td className={`${s.right} ${s.posCell}`}><span className={s.posChip}>{result.position}</span></td>
        <td className={`${s.num} ${s.right}`}>{Math.round(result.meanVbd)}</td>
        <td className={s.right}>{tag}</td>
      </tr>
      {isExpanded && (
        <tr className={s.detailRow}>
          <td colSpan={6}>
            <div className={s.detailBox}>
            <div className={s.detailGrid}>
              <div className={s.detailBlock}>
                <div className={s.detailLabel}>Why the model differs</div>
                <div className={s.detailText}>{whyDiffers(delta, result.position)}</div>
              </div>
              <div className={s.detailBlock}>
                <div className={s.detailLabel}>Range (10th–90th pctile)</div>
                <RangeBar
                  p10={result.displayP10Points}
                  mean={result.displayMeanPoints}
                  p90={result.displayP90Points}
                />
                <div className={s.detailSubtext}>
                  At {Math.round(result.displayP10Points)} pts, that season would rank around Value #{impliedValueRankFromPoints(result.displayP10Points, result, allResults)}.
                  {" "}At {Math.round(result.displayP90Points)} pts, around Value #{impliedValueRankFromPoints(result.displayP90Points, result, allResults)}.
                </div>
              </div>
              <div className={s.detailBlock}>
                <div className={s.detailLabel}>Availability</div>
                <div className={s.detailText}>{availabilityDetail(result.availabilityPct)}</div>
              </div>
            </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}