"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Goal, Trash2 } from "lucide-react";
import { sportFormatConfig, sportParticipantLimit, sportTeamSheetLimit } from "../lib/sport-config";
import type { Match as MatchRecord, TeamSheetEntry } from "../lib/types";

type Player = { id: string; name: string; sport: string; sports?: string[]; active: boolean };
type Session = { date: string; sport: string; status: "open" | "closed"; playerIds: string[]; attendance: { playerId: string; status: "Present" | "Absent" }[] };
type Match = MatchRecord;
type ResultDraft = { academyScore: string; opponentScore: string; outcome: "win" | "loss" | "draw" | "no-contest"; detail: string; finishMethod: string; finishRound: string };
type ScoreDraft = Record<string, { value: string; rating: string }>;

export function MatchManagement({ matches, players, sessions, academy, busy, selectedMatch, setSelectedMatch, scoreDraft, setScoreDraft, selectedParticipants, setSelectedParticipants, resultDraft, setResultDraft, onSaveScores, onDelete, onSaveTeamSheet, onSchedule }: {
  matches: Match[]; players: Player[]; sessions: Session[]; academy: string; busy: boolean; selectedMatch: string; setSelectedMatch: (id: string) => void;
  scoreDraft: ScoreDraft; setScoreDraft: (update: (value: ScoreDraft) => ScoreDraft) => void;
  selectedParticipants: string[]; setSelectedParticipants: (update: (value: string[]) => string[]) => void; resultDraft: ResultDraft;
  setResultDraft: (update: (value: ResultDraft) => ResultDraft) => void; onSaveScores: (match: Match) => void; onDelete: (match: Match) => void;
  onSaveTeamSheet: (match: Match, entries: TeamSheetEntry[]) => void; onSchedule: () => void;
}) {
  const activeMatch = matches.find((match) => match.id === selectedMatch) ?? matches.find((match) => match.status === "scheduled");
  const sortedMatches = [...matches].sort((a, b) => a.date.localeCompare(b.date));
  return <section className="panel workflow-panel"><div className="panel-heading"><div><div className="eyebrow">FIXTURES · PARTICIPANTS · RESULTS</div><h3>Matches</h3></div><button className="text-button" onClick={onSchedule}>SCHEDULE MATCH <ChevronRight size={14}/></button></div>
    {matches.length === 0 ? <div className="empty-state"><div className="empty-mark">↗</div><b>No fixtures yet</b><p>Schedule a fixture for an academy sport. Its format determines the score entry and participation rules.</p></div> : <div className="matches-list">{sortedMatches.map((match) => <article className="match-item" key={match.id}>
      <div className="fixture-date">{new Date(`${match.date}T12:00:00`).toLocaleDateString("en-IN", { day: "2-digit" })}<span>{new Date(`${match.date}T12:00:00`).toLocaleDateString("en-IN", { month: "short" }).toUpperCase()}</span></div>
      <div className="fixture-main"><b>{academy} <span>VS</span> {match.opponent}</b><small>{match.sport} · {match.format ?? "Legacy format"} · {match.date}{match.time ? ` · ${match.time}` : ""}{match.venue ? ` · ${match.venue}` : ""} · {match.status === "played" ? "Result recorded" : "Scheduled"}</small></div>
      <span className={`status ${match.status === "played" ? "status-ready" : "status-developing"}`}><i/>{match.status.toUpperCase()}</span>
      <div className="match-actions"><button className="button button-quiet" onClick={() => setSelectedMatch(selectedMatch === match.id ? "" : match.id)}>{selectedMatch === match.id ? "Hide details" : match.status === "played" ? "View summary" : "Record result"}</button><button className="button button-delete" onClick={() => onDelete(match)} disabled={busy} aria-label={`Delete ${match.sport} match against ${match.opponent}`}><Trash2 size={14}/><span>Delete match</span></button></div>
      {selectedMatch === match.id && match.status === "played" && <MatchSummary match={match} players={players} academy={academy}/>}
      {selectedMatch === match.id && match.status === "scheduled" && !match.format && <p className="form-hint">This legacy fixture has no stored format. To avoid assigning the wrong sport statistic, it cannot be scored; delete it and schedule a replacement with an explicit format.</p>}
      {selectedMatch === match.id && match.status === "scheduled" && match.format && <ScheduledMatchEntry match={match} players={players} sessions={sessions} busy={busy} scoreDraft={scoreDraft} setScoreDraft={setScoreDraft} selectedParticipants={selectedParticipants} setSelectedParticipants={setSelectedParticipants} resultDraft={resultDraft} setResultDraft={setResultDraft} onSave={onSaveScores} onSaveTeamSheet={onSaveTeamSheet}/>}
    </article>)}</div>}
    {activeMatch && activeMatch.status === "scheduled" && activeMatch.format && <TeamSheetEditor key={activeMatch.id} match={activeMatch} players={players} busy={busy} onSave={onSaveTeamSheet}/>}
  </section>;
}

function ScheduledMatchEntry({ match, players, sessions, busy, scoreDraft, setScoreDraft, selectedParticipants, setSelectedParticipants, resultDraft, setResultDraft, onSave, onSaveTeamSheet }: {
  match: Match; players: Player[]; sessions: Session[]; busy: boolean; scoreDraft: ScoreDraft; setScoreDraft: (update: (value: ScoreDraft) => ScoreDraft) => void;
  selectedParticipants: string[]; setSelectedParticipants: (update: (value: string[]) => string[]) => void; resultDraft: ResultDraft; setResultDraft: (update: (value: ResultDraft) => ResultDraft) => void;
  onSave: (match: Match) => void; onSaveTeamSheet: (match: Match, entries: TeamSheetEntry[]) => void;
}) {
  const config = sportFormatConfig(match.sport, match.format);
  const session = sessions.find((entry) => entry.date === match.date && entry.sport === match.sport && entry.status === "closed");
  const sheetIds = match.teamSheet?.map((entry) => entry.playerId) ?? match.lineup ?? [];
  const present = session?.attendance.filter((entry) => entry.status === "Present" && (config?.kind !== "team" || !sheetIds.length || sheetIds.includes(entry.playerId)) && players.some((player) => player.id === entry.playerId && (player.sports ?? [player.sport]).includes(match.sport))) ?? [];
  const participantLimit = sportParticipantLimit(match.sport, match.format);
  const scoredCount = Object.entries(scoreDraft).filter(([id, entry]) => selectedParticipants.includes(id) && entry.value !== "").length;
  const toggleParticipant = (playerId: string, checked: boolean) => {
    setSelectedParticipants((current) => checked
      ? current.length < participantLimit ? [...current, playerId] : current
      : current.filter((id) => id !== playerId));
    if (!checked) setScoreDraft((current) => { const next = { ...current }; delete next[playerId]; return next; });
  };
  return <div className="score-sheet">
    <b>{config?.kind === "team" ? "TEAM PARTICIPANTS & MATCH RESULT" : "INDIVIDUAL PARTICIPANTS & EVENT RESULTS"}</b>
    <p className="form-hint">{config?.scoreLabel} is recorded in {config?.scoreUnit}. Choose up to {participantLimit} participants who were marked Present in the matching closed {match.sport} session. Ratings are optional Coach assessments.</p>
    {config?.resultMode !== "none" && <div className="result-entry">
      <label>{config?.resultLabel.toUpperCase()} · ACADEMY <span className="optional">OPTIONAL</span><input value={resultDraft.academyScore} maxLength={30} placeholder={config?.resultPlaceholder} onChange={(event) => setResultDraft((old) => ({ ...old, academyScore: event.target.value }))}/></label>
      <label>{config?.resultLabel.toUpperCase()} · OPPONENT <span className="optional">OPTIONAL</span><input value={resultDraft.opponentScore} maxLength={30} placeholder={config?.resultPlaceholder} onChange={(event) => setResultDraft((old) => ({ ...old, opponentScore: event.target.value }))}/></label>
      <label>RECORDED OUTCOME <span className="optional">OPTIONAL</span><select value={resultDraft.outcome} onChange={(event) => setResultDraft((old) => ({ ...old, outcome: event.target.value as ResultDraft["outcome"] }))}><option value="win">Win</option><option value="loss">Loss</option><option value="draw">Draw</option><option value="no-contest">No contest</option></select></label>
      <label>OFFICIAL RESULT DETAIL <span className="optional">OPTIONAL</span><input value={resultDraft.detail} maxLength={100} placeholder="Only when recorded by the official" onChange={(event) => setResultDraft((old) => ({ ...old, detail: event.target.value }))}/></label>
    </div>}
    <p className="form-hint">{config?.resultMode === "none" ? "This event is tracked by participant results; no team outcome is calculated." : "Enter both official result values or leave both blank. Outcomes are recorded manually and are not inferred from participant scores."}</p>
    {present.length ? <fieldset className="participant-picker"><legend>AVAILABLE PARTICIPANTS · {selectedParticipants.length}/{participantLimit} SELECTED</legend><div className="participant-options">{present.map((entry) => {
      const player = players.find((candidate) => candidate.id === entry.playerId);
      if (!player) return null;
      const selected = selectedParticipants.includes(player.id);
      const draft = scoreDraft[player.id] ?? { value: "", rating: "" };
      return <div className="participant-entry" key={player.id}><label><input type="checkbox" checked={selected} disabled={busy || (!selected && selectedParticipants.length >= participantLimit)} onChange={(event) => toggleParticipant(player.id, event.target.checked)}/><span>{player.name} <small>{player.id}</small></span></label>{selected && <div className="participant-values"><label>{config?.scoreLabel.toUpperCase()} ({config?.scoreUnit})<input type="number" min="0" max="100000" step={config?.scoreStep ?? 1} value={draft.value} onChange={(event) => setScoreDraft((old) => ({ ...old, [player.id]: { ...draft, value: event.target.value } }))}/></label><label>RATING / 10 · OPTIONAL<input type="number" min="1" max="10" step="0.5" value={draft.rating} onChange={(event) => setScoreDraft((old) => ({ ...old, [player.id]: { ...draft, rating: event.target.value } }))}/></label></div>}</div>;
    })}</div></fieldset> : <p className="form-hint">{session ? "No eligible Present participants remain for this team sheet." : `Close a ${match.date} ${match.sport} session first. Only Present participants can receive a score.`}</p>}
    <button className="button button-accent" disabled={busy || scoredCount === 0 || Boolean(resultDraft.academyScore.trim()) !== Boolean(resultDraft.opponentScore.trim())} onClick={() => onSave(match)}>Save match performance</button>
  </div>;
}

function TeamSheetEditor({ match, players, busy, onSave }: { match: Match; players: Player[]; busy: boolean; onSave: (match: Match, entries: TeamSheetEntry[]) => void }) {
  const config = sportFormatConfig(match.sport, match.format);
  const roster = players.filter((player) => player.active && (player.sports ?? [player.sport]).includes(match.sport));
  const max = sportTeamSheetLimit(match.sport, match.format);
  const [selected, setSelected] = useState<TeamSheetEntry[]>(match.teamSheet?.map((entry) => ({ ...entry, role: entry.role ?? "starter" })) ?? (match.lineup ?? []).map((playerId) => ({ playerId, role: "starter" })));
  if (config?.kind !== "team") return null;
  const maxRoster = 30;
  const toggle = (playerId: string) => setSelected((current) => current.some((entry) => entry.playerId === playerId)
    ? current.filter((entry) => entry.playerId !== playerId)
    : current.length < maxRoster ? [...current, { playerId, role: current.filter((entry) => (entry.role ?? "starter") === "starter").length < max ? "starter" : "substitute" }] : current);
  const setPosition = (playerId: string, position: string) => setSelected((current) => current.map((entry) => entry.playerId === playerId ? { ...entry, position: position || undefined } : entry));
  const setRole = (playerId: string, role: "starter" | "substitute") => setSelected((current) => {
    if (role === "starter" && current.filter((entry) => (entry.role ?? "starter") === "starter").length >= max) return current;
    return current.map((entry) => entry.playerId === playerId ? { ...entry, role, captain: role === "substitute" ? false : entry.captain } : entry);
  });
  const setCaptain = (playerId: string, captain: boolean) => setSelected((current) => current.map((entry) => ({ ...entry, captain: entry.playerId === playerId ? captain : captain ? false : entry.captain })));
  const setJerseyNumber = (playerId: string, value: string) => setSelected((current) => current.map((entry) => entry.playerId === playerId ? { ...entry, jerseyNumber: value === "" ? undefined : Number(value) } : entry));
  const starterCount = selected.filter((entry) => (entry.role ?? "starter") === "starter").length;
  return <div className="lineup-box"><div className="lineup-title"><b>{match.sport.toUpperCase()} · {match.format ?? "TEAM SHEET"}</b><span>{starterCount}/{max} starters · {selected.length - starterCount} substitutes</span></div><div className="lineup-select">{roster.length ? roster.map((player) => {
    const entry = selected.find((candidate) => candidate.playerId === player.id);
    return <div className="team-sheet-player" key={player.id}><label><input type="checkbox" checked={Boolean(entry)} disabled={busy || (!entry && selected.length >= maxRoster)} onChange={() => toggle(player.id)}/>{player.name}<small>{player.id}</small></label>{entry && <div className="team-sheet-fields"><label>Squad role<select aria-label={`${player.name} squad role`} value={entry.role ?? "starter"} onChange={(event) => setRole(player.id, event.target.value === "substitute" ? "substitute" : "starter")}><option value="starter" disabled={(entry.role ?? "starter") !== "starter" && starterCount >= max}>Starting player</option><option value="substitute">Substitute</option></select></label><label>Jersey number<input aria-label={`${player.name} jersey number`} type="number" min="0" max="999" value={entry.jerseyNumber ?? ""} onChange={(event) => setJerseyNumber(player.id, event.target.value)}/></label>{config.positions.length > 0 && <label>Position<select aria-label={`${player.name} position`} value={entry.position ?? ""} onChange={(event) => setPosition(player.id, event.target.value)}><option value="">Position optional</option>{config.positions.map((position) => <option value={position} key={position}>{position}</option>)}</select></label>}<label className="captain-field"><input type="checkbox" checked={entry.captain === true} disabled={(entry.role ?? "starter") !== "starter"} onChange={(event) => setCaptain(player.id, event.target.checked)}/> Captain</label></div>}</div>;
  }) : <small>Add active players registered for this sport to create a team sheet.</small>}</div><div className="lineup-save"><p className="form-hint">Select starters and substitutes for this sport and format. Only listed players marked Present in the closed same-day session can receive a score.</p><button className="button button-accent" onClick={() => onSave(match, selected)} disabled={busy || starterCount === 0}>Save team sheet</button></div></div>;
}

function MatchSummary({ match, players, academy }: { match: Match; players: Player[]; academy: string }) {
  const config = sportFormatConfig(match.sport, match.format);
  const ratings = match.scores.flatMap((score) => typeof score.rating === "number" && Number.isFinite(score.rating) ? [score.rating] : []);
  const average = ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null;
  const top = ratings.length ? Math.max(...ratings) : null;
  const standouts = top === null ? [] : match.scores.filter((score) => score.rating === top).map((score) => players.find((player) => player.id === score.playerId)?.name ?? score.playerId);
  const outcome = !match.result ? "RESULT NOT RECORDED" : match.result.outcome === "win" ? "WIN" : match.result.outcome === "loss" ? "LOSS" : match.result.outcome === "draw" ? "DRAW" : "NO CONTEST";
  return <div className="score-sheet match-summary"><div className="match-report-head"><div><span className="eyebrow">{match.sport.toUpperCase()} · {match.format ?? "LEGACY FORMAT"}</span><h4>PERFORMANCE RECORD</h4><small>{match.date}{match.time ? ` · ${match.time}` : ""}{match.venue ? ` · ${match.venue}` : ""}</small></div><span className={`result-chip ${match.result?.outcome ?? "unknown"}`}>{outcome}</span></div>
    {match.result && <div className="final-scoreboard"><div><small>{config?.kind === "team" ? "ACADEMY" : "ACADEMY ENTRY"}</small><b>{academy}</b><strong>{match.result.academyScore}</strong></div><span>FINAL</span><div><small>{config?.kind === "team" ? "OPPONENT" : "OPPONENT ENTRY"}</small><b>{match.opponent}</b><strong>{match.result.opponentScore}</strong></div></div>}
    {match.result?.detail && <p className="result-detail">{match.result.detail}{match.result.finishMethod ? ` · ${match.result.finishMethod}` : ""}{match.result.finishRound ? ` · Round ${match.result.finishRound}` : ""}</p>}
    <div className="summary-metrics"><span>{match.scores.length} participant{match.scores.length === 1 ? "" : "s"} recorded</span><span>{average === null ? "No ratings recorded" : `Average Coach rating ${average.toFixed(1)} / 10 (${ratings.length})`}</span></div>
    {!!match.teamSheet?.length && <div className="team-sheet-summary"><b>RECORDED TEAM SHEET</b>{match.teamSheet.map((entry) => <span key={entry.playerId}>{players.find((player) => player.id === entry.playerId)?.name ?? entry.playerId}{entry.jerseyNumber === undefined ? "" : ` · #${entry.jerseyNumber}`} · {entry.role === "substitute" ? "Substitute" : "Starter"}{entry.captain ? " · Captain" : ""}{entry.position ? ` · ${entry.position}` : ""}</span>)}</div>}
    {standouts.length > 0 && <div className="standout-card"><span className="eyebrow">HIGHEST RECORDED COACH RATING</span><b>{standouts.join(" · ")}<small className="standout-affiliation">{academy} · {match.sport}</small></b><strong>{top?.toFixed(1)}<small> / 10</small></strong></div>}
    <b>PARTICIPANT PERFORMANCE</b><div className="summary-table"><div className="summary-head"><span>PARTICIPANT</span><span>{config?.scoreLabel.toUpperCase()}</span><span>COACH RATING</span></div>{match.scores.map((score) => <div className="summary-row" key={score.playerId}><span>{players.find((player) => player.id === score.playerId)?.name ?? score.playerId}</span><b>{score.value} {config?.scoreUnit}</b><b>{typeof score.rating === "number" ? `${score.rating.toFixed(1)} / 10` : "Not recorded"}</b></div>)}</div>
    <p className="form-hint">Participant values are recorded in the selected sport format. Ratings are optional Coach assessments, not calculations from the event result.</p></div>;
}
