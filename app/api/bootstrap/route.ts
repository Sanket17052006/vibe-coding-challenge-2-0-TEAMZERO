import { NextResponse } from "next/server";
import { currentUser, publicUser } from "../../../lib/auth";
import { getStore } from "../../../lib/store";
import { errorResponse } from "../../../lib/http";
import { Player, Session, Match } from "../../../lib/types";

function decorate(players: Player[], sessions: Session[], matches: Match[]) {
  return players.map((player) => {
    const playerSports = player.sports ?? [player.sport];
    const sportStats = playerSports.map((sport) => {
      const held = sessions.filter((session) => session.status === "closed" && session.sport === sport && session.playerIds.includes(player.id));
      const present = held.filter((session) => session.attendance.some((row) => row.playerId === player.id && row.status === "Present")).length;
      const played = matches.filter((match) => match.status === "played" && match.sport === sport && match.scores.some((score) => score.playerId === player.id));
      const attendance = held.length ? (present / held.length) * 100 : 0;
      const ready = attendance >= 75 && played.length >= 2;
      return { sport, attendance: Math.floor(attendance * 10) / 10, matches: played.length, score: played.reduce((total, match) => total + (match.scores.find((score) => score.playerId === player.id)?.value || 0), 0), status: ready ? "Ready" as const : "Developing" as const };
    });
    const primary = sportStats.find((entry) => entry.sport === player.sport) ?? sportStats[0];
    return { ...player, sports: playerSports, sportStats, attendance: primary?.attendance ?? 0, matches: primary?.matches ?? 0, score: primary?.score ?? 0, status: sportStats.some((entry) => entry.status === "Ready") ? "Ready" as const : "Developing" as const };
  });
}

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });
    const state = await getStore();
    const academy = state.academies.find((entry) => entry.id === user.academyId);
    if (!academy) return NextResponse.json({ error: "This account is not linked to an academy." }, { status: 403 });

    const academyPlayers = state.players.filter((entry) => entry.academyId === academy.id);
    const academySessions = state.sessions.filter((entry) => entry.academyId === academy.id);
    const academyMatches = state.matches.filter((entry) => entry.academyId === academy.id);
    const decorated = decorate(academyPlayers, academySessions, academyMatches);
    const offeredSports = academy.sports ?? [];
    const players = user.role === "coach"
      ? decorated.filter((player) => user.isOwner || !user.coachSports || player.sports.some((sport) => user.coachSports?.includes(sport))).map((player) => {
          if (user.isOwner || !user.coachSports) return player;
          const sports = player.sports.filter((sport) => user.coachSports?.includes(sport));
          const sportStats = player.sportStats.filter((entry) => sports.includes(entry.sport));
          const primary = sportStats[0];
          return { ...player, sports, sport: sports[0] ?? player.sport, sportStats, attendance: primary?.attendance ?? 0, matches: primary?.matches ?? 0, score: primary?.score ?? 0, status: sportStats.some((entry) => entry.status === "Ready") ? "Ready" as const : "Developing" as const };
        })
      : user.role === "scout"
        ? decorated.filter((player) => player.academyId === academy.id && player.active && player.sportStats.some((stat) => offeredSports.includes(stat.sport) && stat.status === "Ready"))
        : decorated.filter((player) => player.academyId === academy.id && player.id === user.playerId);

    const scopedPlayers = user.role === "coach" ? players
      : user.role === "scout" ? players.map((player) => {
          const sportStats = player.sportStats.filter((entry) => offeredSports.includes(entry.sport) && entry.status === "Ready");
          const sports = sportStats.map((entry) => entry.sport);
          const { sportRequests: _privateRequests, ...publicPlayer } = player;
          return { ...publicPlayer, sports, sport: sports[0] ?? player.sport, sportStats };
        })
      : players.map(({ id, name, age, sport, sports, sportRequests, sportStats, active, attendance, matches: matchCount, score, status }) => ({ id, name, age, sport, sports, sportRequests, sportStats, active, attendance, matches: matchCount, score, status }));

    const sessions = user.role === "coach"
      ? academySessions.filter((session) => user.isOwner || !user.coachSports || user.coachSports.includes(session.sport))
      : user.role === "player"
        ? academySessions.filter((session) => session.status === "closed" && session.attendance.some((row) => row.playerId === user.playerId)).map((session) => ({ ...session, playerIds: [user.playerId!], attendance: session.attendance.filter((row) => row.playerId === user.playerId) }))
        : [];
    const matches = user.role === "coach"
      ? academyMatches.filter((match) => user.isOwner || !user.coachSports || user.coachSports.includes(match.sport))
      : user.role === "player"
        ? academyMatches.filter((match) => match.status === "played" && match.scores.some((score) => score.playerId === user.playerId)).map((match) => { const { lineup, ...matchView } = match; return { ...matchView, scores: match.scores.filter((score) => score.playerId === user.playerId) }; })
        : [];
    const pendingSportRequests = user.role === "coach" ? academyPlayers.flatMap((player) => {
      const member = state.users.find((entry) => entry.id === player.userId && entry.academyId === academy.id && entry.status === "active");
      return member ? (player.sportRequests ?? []).filter((request) => request.status === "pending" && (user.isOwner || !user.coachSports || user.coachSports.includes(request.sport))).map((request) => ({ playerId: player.id, playerName: player.name, sport: request.sport, requestId: request.id, requestedAt: request.requestedAt })) : [];
    }) : [];
    const safeAcademy = { id: academy.id, name: academy.name, location: academy.location, code: user.role === "coach" ? academy.code : "", sports: academy.sports ?? [] };
    return NextResponse.json({
      user: publicUser(user), academy: safeAcademy, players: scopedPlayers, sessions, matches,
      pendingUsers: user.role === "coach" ? state.users.filter((entry) => entry.academyId === academy.id && entry.status === "pending" && (entry.role !== "coach" || user.isOwner)).map(publicUser) : [],
      pendingSportRequests,
      activeCoaches: user.role === "coach" ? state.users.filter((entry) => entry.academyId === academy.id && entry.role === "coach" && entry.status === "active").map(publicUser) : [],
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
