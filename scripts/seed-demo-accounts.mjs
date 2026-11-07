#!/usr/bin/env node
/**
 * Seed the shared KhelGrid demo academy into MongoDB.
 *
 * The demo accounts (coach.jan / player.aarav / player.priya / scout.rohan)
 * all share the password `demo123` and live in one academy (EXR-2024), so any
 * action performed by one role is immediately visible to the others.
 *
 * This script is additive and idempotent: it only inserts records that are not
 * already present and never deletes existing academy data.
 *
 * Usage:
 *   node --experimental-strip-types scripts/seed-demo-accounts.mjs
 *
 * Reads MONGODB_URI / MONGODB_DB from the environment, falling back to .env.local.
 */
import { readFileSync } from "node:fs";
import { MongoClient } from "mongodb";
import { cloneDemoStore, hasDemoData, mergeDemoStore } from "../lib/demo-data.ts";

function loadEnvLocal() {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  } catch {
    /* .env.local is optional */
  }
}

loadEnvLocal();

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "excelrs";
if (!uri) {
  console.error("MONGODB_URI is not set. Add it to the environment or .env.local.");
  process.exit(1);
}

const client = new MongoClient(uri, { connectTimeoutMS: 8000, serverSelectionTimeoutMS: 8000 });
try {
  await client.connect();
  const collection = client.db(dbName).collection("appState");
  const existing = await collection.findOne({ _id: "main" });
  const demo = cloneDemoStore();

  if (!existing || !existing.state) {
    await collection.updateOne({ _id: "main" }, { $setOnInsert: { state: demo, revision: 0 } }, { upsert: true });
    console.log(`Created appState in "${dbName}" with the demo academy.`);
  } else {
    const state = existing.state;
    for (const key of ["academies", "users", "players", "sessions", "matches", "trials", "auditEvents", "authTokens"]) {
      if (!Array.isArray(state[key])) state[key] = [];
    }
    const alreadyPresent = hasDemoData(state);
    mergeDemoStore(state);
    await collection.updateOne({ _id: "main" }, { $set: { state }, $inc: { revision: 1 } });
    console.log(`${alreadyPresent ? "Refreshed" : "Merged"} the demo academy in "${dbName}". Existing records were preserved.`);
  }

  console.log("Demo logins (password: demo123): coach.jan, player.aarav, scout.rohan");
} catch (error) {
  console.error("Demo seed failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.close().catch(() => undefined);
}
