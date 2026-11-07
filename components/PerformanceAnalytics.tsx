"use client";

import { useMemo, useState } from "react";
import { buildSportAnalytics } from "../lib/performance-analytics";
import { formatSportScore, sportConfig, sportFormatConfig } from "../lib/sport-config";
import type { Match as MatchRecord } from "../lib/types";

type Player = {
  id: string; name: string; sport: string; sports?: string[]; active: boolean;
  sportStats?: { sport: string; attendance: number; matches: number; score: number; averageRating?: number | null; ratingCount?: number; status: "Ready" | "Developing" }[];
};
type Session = { id: string; date: string; sport: string; status: "open" | "closed"; playerIds: string[]; attendance: { playerId: string; status: "Present" | "Absent" }[] };
type Match = MatchRecord;

export function PerformanceAnalytics({ sports, players, sessions, matches }: { sports: string[]; players: Player[]; sessions: Session[]; matches: Match[] }) {
  const [selectedSport, setSelectedSport] = useState("");
  const sport = sports.includes(selectedSport) ? selectedSport : sports[0] ?? "";
  const baseConfig = sport ? sportConfig(sport) : undefined;
  const [selectedFormat, setSelectedFormat] = useState("");
  const format = baseConfig?.formats.includes(selectedFormat) ? selectedFormat : baseConfig?.formats[0] ?? "";
  const config = sportFormatConfig(sport, format);
  const analytics = useMemo(() => sport && config && format ? buildSportAnalytics(sport, players, sessions, matches, config, format) : null, [sport, config, format, players, sessions, matches]);

  if (!sports.length || !analytics) return <section className="panel workflow-panel"><div className="empty-state"><div className="empty-mark">↗</div><b>No sports available</b><p>Configure academy sports, or ask the academy owner to assign this Coach access to a sport.</p></div></section>;

  return <section className="analytics-page" aria-label={`${sport} performance analytics`}>
    <div className="analytics-toolbar"><div><span className="eyebrow">REAL ACADEMY RECORDS</span><p>Only closed sessions and played fixtures are included. Results are shown only when a Coach recorded one. Performance is filtered by the selected format to keep unlike event measures separate.</p></div><div className="analytics-selectors"><label htmlFor="analytics-sport">SPORT<select id="analytics-sport" value={sport} onChange={(event) => { setSelectedSport(event.target.value); setSelectedFormat(""); }}>{sports.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label><label htmlFor="analytics-format">FORMAT<select id="analytics-format" value={format} onChange={(event) => setSelectedFormat(event.target.value)}>{config?.formats.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label></div></div>
    {analytics.unclassifiedMatches > 0 && <p className="analytics-note">{analytics.unclassifiedMatches} {analytics.unclassifiedMatches === 1 ? "fixture has" : "fixtures have"} a missing or unsupported legacy format and are excluded from format-specific analytics.</p>}

    <div className="stat-grid analytics-stat-grid">
      <AnalyticsStat label="PLAYED FIXTURES" value={analytics.playedMatches} hint={`${analytics.scheduledMatches} scheduled`} />
      <AnalyticsStat label="SESSION ATTENDANCE" value={analytics.attendanceRate === null ? "—" : `${analytics.attendanceRate}%`} hint={analytics.possibleMarks ? `${analytics.presentMarks} of ${analytics.possibleMarks} roster marks` : "No closed sessions"} />
      <AnalyticsStat label="AVG. COACH RATING" value={analytics.averageRating === null ? "—" : `${analytics.averageRating}/10`} hint={`${analytics.ratedScoreRows} recorded ratings`} />
      <AnalyticsStat label="ACTIVE PLAYERS" value={analytics.activePlayers} hint="Assigned to this sport" />
    </div>

    <div className="analytics-grid">
      <section className="panel analytics-panel">
        <div className="panel-heading"><div><div className="eyebrow">{analytics.config.resultMode === "team" ? "TEAM RESULTS" : "RECORDED OUTCOMES"} · {sport.toUpperCase()}</div><h3>{analytics.config.resultMode === "none" ? "Event entries" : "Match outcomes"}</h3></div></div>
        {analytics.config.resultMode === "none" ? <div className="analytics-outcomes"><Outcome label="Played events" value={analytics.playedMatches}/><Outcome label="Participant entries" value={analytics.scoreEntryCount}/><Outcome label="Rated entries" value={analytics.ratedScoreRows}/></div> : <div className="analytics-outcomes">
          <Outcome label="Wins" value={analytics.results.wins} />
          <Outcome label="Draws" value={analytics.results.draws} />
          <Outcome label="Losses" value={analytics.results.losses} />
          <Outcome label="No contest" value={analytics.results.noContests} />
        </div>}
        {analytics.config.resultMode !== "none" && analytics.results.unreported > 0 && <p className="analytics-note">{analytics.results.unreported} played {analytics.results.unreported === 1 ? "fixture has" : "fixtures have"} no official outcome recorded. No result has been inferred from participant scores.</p>}
        {analytics.playedMatches === 0 && <p className="analytics-note">Played fixtures will appear here after results are recorded.</p>}
      </section>
      <section className="panel analytics-panel">
        <div className="panel-heading"><div><div className="eyebrow">RECENT PERFORMANCE · {format.toUpperCase()}</div><h3>{analytics.config.scoreLabel}</h3></div></div>
        {analytics.recentPerformance.length ? <div className="rating-trend" role="list" aria-label={`${analytics.config.scoreLabel} by recent match`}>
          {analytics.recentPerformance.map((entry) => <div className="rating-trend-row" role="listitem" key={entry.id}><div><b>{entry.opponent}</b><small>{entry.date} · {analytics.config.scoreLabel}</small></div><span className="rating-track"><i style={{ width: `${performanceWidth(entry.value, analytics.recentPerformance.map((item) => item.value), analytics.config.scoreDirection)}` }} /></span><strong>{entry.value === null ? "—" : formatSportScore(sport, entry.value, format)}</strong></div>)}
        </div> : <p className="analytics-note">No participant score records exist for this format yet. Scheduled and incomplete matches are excluded.</p>}
        {analytics.recentRatings.length ? <><h4 className="analytics-subheading">RECENT COACH RATINGS</h4><div className="rating-trend" role="list" aria-label="Average player rating by recent match">
          {analytics.recentRatings.map((entry) => <div className="rating-trend-row" role="listitem" key={entry.id}><div><b>{entry.opponent}</b><small>{entry.date} · {entry.ratingCount} {entry.ratingCount === 1 ? "rating" : "ratings"}</small></div><span className="rating-track"><i style={{ width: `${Math.max(0, Math.min(100, (entry.averageRating ?? 0) * 10))}%` }} /></span><strong>{entry.averageRating?.toFixed(1)}</strong></div>)}
        </div></> : <><h4 className="analytics-subheading">RECENT COACH RATINGS</h4><p className="analytics-note">Ratings appear after a Coach records them. Unrated fixtures are not plotted.</p></>}
      </section>
    </div>

    <section className="panel analytics-panel analytics-player-panel">
      <div className="panel-heading"><div><div className="eyebrow">PLAYER PERFORMANCE · {sport.toUpperCase()}</div><h3>Current active roster</h3></div><span className="subtle-count">{analytics.players.length} players</span></div>
      {analytics.players.length ? <div className="table-wrap"><table className="analytics-table"><thead><tr><th>PLAYER</th><th>ATTENDANCE</th><th>PLAYED</th><th>{analytics.config.scoreLabel.toUpperCase()} · {format.toUpperCase()}</th><th>AVG. RATING</th><th>READINESS</th></tr></thead><tbody>{analytics.players.map((player) => <tr key={player.id}><td><div className="player-cell"><div className="player-initial">{player.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div><div><b>{player.name}</b><small>{player.id}</small></div></div></td><td>{player.attendance === null ? <span className="analytics-muted">No sessions</span> : `${player.attendance}%`}</td><td>{player.matches}</td><td>{player.scoreAggregate === null ? <span className="analytics-muted">No score</span> : formatSportScore(sport, player.scoreAggregate, format)}</td><td>{player.averageRating === null ? <span className="analytics-muted">No rating</span> : <>{player.averageRating.toFixed(1)}/10 <small className="analytics-sample">({player.ratingCount})</small></>}</td><td><span className={`status ${player.readiness === "Ready" ? "status-ready" : "status-developing"}`}><i />{player.readiness.toUpperCase()}</span></td></tr>)}</tbody></table></div> : <div className="empty-state"><div className="empty-mark">↗</div><b>Roster is empty</b><p>Add active players to this sport to compare their real attendance and recorded match performance.</p></div>}
      <p className="analytics-footnote">{analytics.config.aggregation === "sum" ? `Player values are summed for ${format}.` : analytics.config.aggregation === "average" ? `Player values are averaged for ${format}.` : `Player value shows the ${analytics.config.scoreDirection === "lower" ? "lowest" : "highest"} recorded ${format} result.`} Different sports and formats may use unlike measures. Ratings are optional Coach assessments with their sample count shown. Readiness remains sport-wide and is based on at least 75% attendance and score rows in two played matches.</p>
    </section>
  </section>;
}

function AnalyticsStat({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return <article className="stat-card"><div className="stat-top"><span>{label}</span></div><div className="stat-value">{value}</div><div className="stat-delta">{hint}</div></article>;
}

function Outcome({ label, value }: { label: string; value: number }) {
  return <div className="analytics-outcome"><b>{value}</b><span>{label}</span></div>;
}

function performanceWidth(value: number | null, values: (number | null)[], direction: "higher" | "lower") {
  if (value === null) return "0%";
  const observed = values.filter((entry): entry is number => entry !== null);
  const min = Math.min(...observed);
  const max = Math.max(...observed);
  if (min === max) return "100%";
  const normalized = direction === "higher" ? (value - min) / (max - min) : (max - value) / (max - min);
  return `${Math.round(normalized * 100)}%`;
}
