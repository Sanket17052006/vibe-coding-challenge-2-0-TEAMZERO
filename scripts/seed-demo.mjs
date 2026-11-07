#!/usr/bin/env node
/**
 * Explicit, local-only demo seeder. It never loads .env.local and never reads
 * MONGODB_URI. It connects only to KHELGRID_DEMO_MONGODB_URI after validating
 * that the URI is loopback and names the dedicated khelgrid_demo_local database.
 * No user accounts or passwords are created. This script is never auto-run.
 */
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";

const VERSION = "khelgrid-local-demo-v1";
const DB_NAME = "khelgrid_demo_local";
const fail = (message) => { console.error(message); process.exitCode = 1; };

if (process.env.NODE_ENV === "production") {
  fail("Refusing to seed when NODE_ENV=production.");
} else {
  const uri = process.env.KHELGRID_DEMO_MONGODB_URI;
  const academyId = process.env.ACADEMY_ID?.trim();
  const academyName = process.env.ACADEMY_NAME?.trim();
  const academyLocation = process.env.ACADEMY_LOCATION?.trim();
  let parsed;
  try { parsed = new URL(uri || ""); } catch { fail("Set KHELGRID_DEMO_MONGODB_URI to a local MongoDB URI."); }
  const host = parsed?.hostname?.replace(/^\[|\]$/g, "").toLowerCase();
  const isLoopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const uriDb = parsed?.pathname?.replace(/^\//, "");
  if (!process.exitCode && (!isLoopback || parsed.protocol !== "mongodb:" || uriDb !== DB_NAME || parsed.search || parsed.hash)) {
    fail("Refusing to seed: use a direct loopback MongoDB URI naming only khelgrid_demo_local.");
  }
  if (!process.exitCode && (!academyId || !academyName || !academyLocation || academyId.length > 100 || academyName.length > 100 || academyLocation.length > 120)) {
    fail("Set ACADEMY_ID, ACADEMY_NAME, and ACADEMY_LOCATION to an explicitly chosen fictional local demo identity.");
  }
  if (!process.exitCode) {
    const sports = ["Football", "Cricket", "Badminton", "Athletics", "Basketball"];
    const names = [
      "Demo Aarav Singh", "Demo Aditi Kumari", "Demo Aman Das", "Demo Anika Murmu",
      "Demo Arjun Oraon", "Demo Bhavna Das", "Demo Chetan Mahto", "Demo Deepa Hansda",
      "Demo Dev Raj", "Demo Esha Singh", "Demo Farhan Ali", "Demo Gita Murmu",
      "Demo Harsh Oraon", "Demo Isha Kumari", "Demo Kabir Das", "Demo Kiran Mahto",
      "Demo Lata Hansda", "Demo Mohan Raj", "Demo Nisha Singh", "Demo Om Oraon",
    ];
    const startDate = new Date();
    startDate.setUTCHours(12, 0, 0, 0);
    const day = (offset) => {
      const date = new Date(startDate);
      date.setUTCDate(date.getUTCDate() + offset);
      return date.toISOString().slice(0, 10);
    };
    const players = names.map((name, index) => {
      const assigned = [...new Set([sports[index % sports.length], sports[(index + 2) % sports.length]])];
      return {
        id: "DEMO-" + String(index + 1).padStart(3, "0"), academyId, name,
        age: 14 + (index % 5), sport: assigned[0], sports: assigned,
        sportRequests: [], active: true, createdAt: new Date(startDate.getTime() - 86400000 * 90).toISOString(),
      };
    });
    const sessions = [];
    const matches = [];
    for (const sport of sports) {
      const roster = players.filter((player) => player.sports.includes(sport));
      const formats = { Football: "7-a-side", Cricket: "T20", Badminton: "Singles", Athletics: "Track", Basketball: "3x3" };
      const format = formats[sport];
      for (let eventIndex = 0; eventIndex < 4; eventIndex++) {
        const date = day(-42 + eventIndex * 10);
        const attendance = roster.map((player) => {
          const playerIndex = Number(player.id.slice(-3)) - 1;
          const attendanceStatus = playerIndex % 5 === 4
            ? (eventIndex < 2 ? "Absent" : "Present")
            : (playerIndex % 4 === 0 && eventIndex === 0 ? "Absent" : "Present");
          return { playerId: player.id, status: attendanceStatus };
        });
        const session = {
          id: randomUUID(), academyId, date, sport, playerIds: roster.map((player) => player.id),
          status: "closed", attendance, createdAt: new Date(date + "T10:00:00.000Z").toISOString(),
          closedAt: new Date(date + "T12:00:00.000Z").toISOString(),
        };
        sessions.push(session);
        const scores = attendance.filter((entry) => entry.status === "Present").flatMap((entry) => {
          const playerIndex = Number(entry.playerId.slice(-3)) - 1;
          if (playerIndex % 4 === 2 && eventIndex > 0) return [];
          const value = sport === "Athletics"
            ? 14.2 + ((playerIndex + eventIndex) % 9) * 0.31
            : sport === "Cricket"
              ? 12 + ((playerIndex * 7 + eventIndex * 5) % 48)
              : 1 + ((playerIndex + eventIndex) % 8);
          return [{ playerId: entry.playerId, value }];
        });
        const createdAt = new Date(date + "T08:00:00.000Z").toISOString();
        if (sport === "Badminton" || sport === "Athletics") {
          for (const score of scores) {
            matches.push({
              id: randomUUID(), academyId, date, time: "15:30", sport, format,
              opponent: "Demo " + sport + " competitor " + score.playerId + " event " + (eventIndex + 1),
              venue: "Local demo ground", status: "played", scores: [score], createdAt,
              ...(sport === "Badminton" ? { result: { academyScore: String(score.value), opponentScore: String(Math.max(0, score.value - 2)), outcome: eventIndex % 3 === 0 ? "win" : eventIndex % 3 === 1 ? "draw" : "loss", detail: "Fictional local demonstration result" } } : {}),
            });
          }
        } else {
          matches.push({
            id: randomUUID(), academyId, date, time: "15:30", sport, format,
            opponent: "Demo " + sport + " visitors " + (eventIndex + 1), venue: "Local demo ground",
            status: "played", scores,
            result: { academyScore: String(18 + eventIndex), opponentScore: String(14 + (eventIndex % 3)), outcome: eventIndex % 3 === 0 ? "win" : eventIndex % 3 === 1 ? "draw" : "loss", detail: "Fictional local demonstration result" },
            createdAt,
          });
        }
      }
      const upcomingDate = day(12);
      matches.push({
        id: randomUUID(), academyId, date: upcomingDate, time: "16:00", sport, format,
        opponent: "Demo upcoming " + sport + " fixture", venue: "Local demo ground",
        status: "scheduled", scores: [], createdAt: new Date().toISOString(),
      });
    }
    const state = {
      academies: [{ id: academyId, name: academyName, location: academyLocation, sports, createdAt: new Date().toISOString() }],
      users: [], players, sessions, matches, trials: [], auditEvents: [], authTokens: [],
      demoSeedVersion: VERSION,
    };
    const client = new MongoClient(uri, { connectTimeoutMS: 4000, serverSelectionTimeoutMS: 4000 });
    try {
      await client.connect();
      const collection = client.db(DB_NAME).collection("appState");
      const existing = await collection.findOne({ _id: "main" });
      if (existing?.state?.demoSeedVersion === VERSION) {
        console.log("Local demo data is already present; no changes made.");
      } else if (existing) {
        const current = existing.state;
        const collections = ["academies", "users", "players", "sessions", "matches", "trials", "auditEvents", "authTokens"];
        const isEmpty = current && collections.every((key) => Array.isArray(current[key]) && current[key].length === 0);
        if (!isEmpty) throw new Error("The local database contains records without this demo marker. Refusing to overwrite them.");
        const revision = typeof existing.revision === "number" ? existing.revision : 0;
        const filter = typeof existing.revision === "number" ? { _id: "main", revision } : { _id: "main", revision: { $exists: false } };
        const replaced = await collection.replaceOne(filter, { _id: "main", revision: revision + 1, state });
        if (replaced.matchedCount !== 1) throw new Error("The local store changed during seeding. No data was overwritten.");
        console.log("Seeded fictional local demo records into the empty dedicated database.");
      } else {
        await collection.insertOne({ _id: "main", revision: 1, state });
        console.log("Seeded fictional local demo records into the dedicated database.");
      }
      console.log("Created 20 demo players, closed sessions, attendance, historical and upcoming multi-sport fixtures.");
      console.log("No Coach, Player, or Scout accounts or passwords were created. Register and verify a Coach locally to inspect the data.");
    } catch (error) {
      fail(error instanceof Error ? error.message : "Local demo seed failed.");
    } finally {
      await client.close();
    }
  }
}
