import { SPORTS } from "./sports";
import type { TeamSheetEntry } from "./types";

export type SportConfig = {
  kind: "team" | "individual";
  scoreLabel: string;
  scoreUnit: string;
  scoreKind: "integer" | "decimal";
  scoreStep: number;
  scoreDirection: "higher" | "lower";
  aggregation: "sum" | "average" | "best";
  resultMode: "team" | "head-to-head" | "none";
  formats: readonly string[];
  formatKinds?: Readonly<Record<string, "team" | "individual">>;
  formatMetrics?: Readonly<Record<string, Partial<SportConfig>>>;
  resultLabel: string;
  resultPlaceholder: string;
  positions: readonly string[];
  teamSheetLimit: number;
  formatParticipantLimits?: Readonly<Record<string, number>>;
  formatTeamSheetLimits?: Readonly<Record<string, number>>;
};

const team = (scoreLabel: string, scoreUnit: string, options: Partial<SportConfig> = {}): SportConfig => ({
  kind: "team", scoreLabel, scoreUnit, scoreKind: "integer", scoreStep: 1, scoreDirection: "higher", aggregation: "sum",
  resultMode: "team", formats: ["Standard match"], resultLabel: "Final team score", resultPlaceholder: "Enter the recorded final score", positions: [], teamSheetLimit: 30, ...options,
});
const individual = (scoreLabel: string, scoreUnit: string, options: Partial<SportConfig> = {}): SportConfig => ({
  kind: "individual", scoreLabel, scoreUnit, scoreKind: "integer", scoreStep: 1, scoreDirection: "higher", aggregation: "sum",
  resultMode: "head-to-head", formats: ["Standard event"], resultLabel: "Bout / match result", resultPlaceholder: "Enter the official result", positions: [], teamSheetLimit: 1, ...options,
});

// One explicit entry per catalogue sport. Values use recorded player entries;
// no score is derived from a team's final result or from a different sport.
export const SPORT_CONFIG: Record<(typeof SPORTS)[number], SportConfig> = {
  Football: team("Goals", "goals", { formats: ["11-a-side", "7-a-side", "Futsal"], formatTeamSheetLimits: { "7-a-side": 7, Futsal: 5 }, positions: ["Goalkeeper", "Defender", "Midfielder", "Forward"], teamSheetLimit: 11 }),
  Cricket: team("Runs", "runs", { formats: ["Test", "One Day", "T20", "Other"], positions: ["Batter", "Bowler", "All-rounder", "Wicketkeeper"], teamSheetLimit: 11, resultLabel: "Innings score", resultPlaceholder: "For example 167/8" }),
  Hockey: team("Goals", "goals", { formats: ["Field hockey", "Indoor hockey"], formatTeamSheetLimits: { "Indoor hockey": 6 }, positions: ["Goalkeeper", "Defender", "Midfielder", "Forward"], teamSheetLimit: 11 }),
  Badminton: individual("Points", "points", { formats: ["Singles", "Doubles"], formatParticipantLimits: { Singles: 1, Doubles: 2 }, resultLabel: "Game scores", resultPlaceholder: "For example 21-18, 19-21, 21-16" }),
  Basketball: team("Points", "points", { formats: ["5-a-side", "3x3"], formatTeamSheetLimits: { "3x3": 3 }, positions: ["Guard", "Forward", "Center"], teamSheetLimit: 5 }),
  Volleyball: team("Points", "points", { formats: ["Indoor", "Beach"], formatTeamSheetLimits: { Beach: 2 }, positions: ["Setter", "Libero", "Outside hitter", "Middle blocker", "Opposite"], teamSheetLimit: 6, resultLabel: "Set scores", resultPlaceholder: "For example 25-20, 22-25, 15-12" }),
  Kabaddi: team("Points", "points", { formats: ["Standard", "Circle"], formatTeamSheetLimits: { Circle: 8 }, positions: ["Raider", "Defender", "All-rounder"], teamSheetLimit: 7 }),
  Athletics: individual("Time", "seconds", { formats: ["Track", "Jump", "Throw", "Combined event", "Relay"], formatKinds: { Relay: "team" }, formatParticipantLimits: { Relay: 4 }, formatTeamSheetLimits: { Relay: 4 }, positions: ["Leg 1", "Leg 2", "Leg 3", "Leg 4"], scoreKind: "decimal", scoreStep: 0.01, scoreDirection: "lower", aggregation: "best", resultMode: "none", resultLabel: "Event result", resultPlaceholder: "Record the event result and unit", formatMetrics: { Jump: { scoreLabel: "Distance", scoreUnit: "meters", scoreDirection: "higher" }, Throw: { scoreLabel: "Distance", scoreUnit: "meters", scoreDirection: "higher" }, "Combined event": { scoreLabel: "Event points", scoreUnit: "points", scoreKind: "integer", scoreStep: 1, scoreDirection: "higher", aggregation: "sum" } } }),
  Boxing: individual("Points", "points", { formats: ["Amateur bout", "Other bout"], resultLabel: "Bout result", resultPlaceholder: "For example 3-2 decision or R2 KO" }),
  Wrestling: individual("Points", "points", { formats: ["Freestyle", "Greco-Roman", "Other"], resultLabel: "Bout result", resultPlaceholder: "Record the official bout result" }),
  "Kho-Kho": team("Points", "points", { formats: ["Standard"], positions: ["Chaser", "Defender"], teamSheetLimit: 9 }),
  "Table Tennis": individual("Points", "points", { formats: ["Singles", "Doubles", "Team"], formatParticipantLimits: { Singles: 1, Doubles: 2, Team: 3 }, formatKinds: { Team: "team" }, formatTeamSheetLimits: { Team: 3 }, positions: ["Singles player", "Doubles pair"], resultLabel: "Game scores", resultPlaceholder: "Record the game scores" }),
  Tennis: individual("Games won", "games", { formats: ["Singles", "Doubles"], formatParticipantLimits: { Singles: 1, Doubles: 2 }, resultLabel: "Set scores", resultPlaceholder: "For example 6-4, 3-6, 7-5" }),
  Swimming: individual("Time", "seconds", { formats: ["Freestyle", "Backstroke", "Breaststroke", "Butterfly", "Individual medley", "Relay", "Other"], formatKinds: { Relay: "team" }, formatParticipantLimits: { Relay: 4 }, formatTeamSheetLimits: { Relay: 4 }, positions: ["Leg 1", "Leg 2", "Leg 3", "Leg 4"], scoreKind: "decimal", scoreStep: 0.01, scoreDirection: "lower", aggregation: "best", resultMode: "none", resultLabel: "Race time", resultPlaceholder: "Record time in seconds" }),
  Archery: individual("Points", "points", { formats: ["Recurve", "Compound", "Barebow", "Other"] }),
  Shooting: individual("Points", "points", { formats: ["Rifle", "Pistol", "Shotgun", "Other"], scoreKind: "decimal", scoreStep: 0.01, aggregation: "average", resultMode: "none" }),
  Weightlifting: individual("Lift total", "kg", { formats: ["Snatch", "Clean and jerk", "Total", "Other"], scoreKind: "decimal", scoreStep: 0.01, scoreDirection: "higher", aggregation: "best", resultMode: "none" }),
  Gymnastics: individual("Execution score", "points", { formats: ["Floor", "Vault", "Pommel horse", "Rings", "Parallel bars", "High bar", "Balance beam", "Uneven bars", "Other"], scoreKind: "decimal", scoreStep: 0.01, aggregation: "average", resultMode: "none" }),
  Handball: team("Goals", "goals", { formats: ["Indoor", "Beach"], positions: ["Goalkeeper", "Wing", "Back", "Pivot"], teamSheetLimit: 7 }),
  Rugby: team("Points", "points", { formats: ["Union", "League", "Sevens", "Touch"], formatTeamSheetLimits: { League: 13, Sevens: 7, Touch: 6 }, positions: ["Forward", "Scrum-half", "Fly-half", "Center", "Wing", "Fullback"], teamSheetLimit: 15 }),
  Taekwondo: individual("Points", "points", { formats: ["Kyorugi", "Poomsae"], scoreKind: "decimal", scoreStep: 0.01, aggregation: "average", resultLabel: "Bout / event result", resultPlaceholder: "Record the official result" }),
  Judo: individual("Points", "points", { formats: ["Contest", "Kata"], resultLabel: "Contest result", resultPlaceholder: "Record the official contest result" }),
  Fencing: individual("Touches", "touches", { formats: ["Foil", "Épée", "Sabre"], resultLabel: "Bout score", resultPlaceholder: "For example 15-12" }),
  Squash: individual("Points", "points", { formats: ["Singles", "Doubles"], resultLabel: "Game scores", resultPlaceholder: "Record the game scores" }),
  Throwball: team("Points", "points", { formats: ["Standard"], positions: ["Attacker", "Defender"], teamSheetLimit: 7 }),
  Mallakhamb: individual("Execution score", "points", { formats: ["Pole", "Rope", "Hanging", "Other"], scoreKind: "decimal", scoreStep: 0.01, aggregation: "average", resultMode: "none" }),
  Cycling: individual("Time", "seconds", { formats: ["Road", "Track", "Mountain bike", "BMX", "Time trial", "Team time trial", "Other"], formatKinds: { "Team time trial": "team" }, formatParticipantLimits: { "Team time trial": 8 }, formatTeamSheetLimits: { "Team time trial": 8 }, positions: ["Rider"], scoreKind: "decimal", scoreStep: 0.01, scoreDirection: "lower", aggregation: "best", resultMode: "none", resultLabel: "Finish time", resultPlaceholder: "Record time in seconds" }),
  Golf: individual("Strokes", "strokes", { formats: ["Stroke play", "Match play", "Other"], scoreDirection: "lower", aggregation: "best", resultMode: "none", resultLabel: "Round result", resultPlaceholder: "Record the official round score" }),
};

export function sportConfig(sport: string): SportConfig | undefined {
  return Object.prototype.hasOwnProperty.call(SPORT_CONFIG, sport) ? SPORT_CONFIG[sport as keyof typeof SPORT_CONFIG] : undefined;
}

export function sportFormatConfig(sport: string, format?: string): SportConfig | undefined {
  const config = sportConfig(sport);
  if (!config || !format || !config.formats.includes(format)) return config;
  return { ...config, ...config.formatMetrics?.[format], kind: config.formatKinds?.[format] ?? config.kind };
}

export function sportFormatKind(sport: string, format?: string): "team" | "individual" | undefined {
  return sportFormatConfig(sport, format)?.kind;
}

export function isValidSportFormat(sport: string, format: string): boolean {
  return Boolean(sportConfig(sport)?.formats.includes(format));
}

export function validateSportScore(sport: string, value: unknown, format?: string): value is number {
  const config = sportFormatConfig(sport, format);
  if (!config || typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100000) return false;
  if (config.scoreKind === "integer" && !Number.isInteger(value)) return false;
  const units = value / config.scoreStep;
  return Math.abs(units - Math.round(units)) < 1e-8;
}

export function validateTeamSheet(sport: string, playerIds: string[], format?: string, positions: (string | undefined)[] = []): boolean {
  const config = sportFormatConfig(sport, format);
  return Boolean(config?.kind === "team" && playerIds.length > 0 && playerIds.length <= sportTeamSheetLimit(sport, format) && new Set(playerIds).size === playerIds.length && positions.every((position) => !position || config.positions.includes(position)));
}

export function validateTeamSheetEntries(sport: string, entries: TeamSheetEntry[], format?: string): boolean {
  const config = sportFormatConfig(sport, format);
  if (!config || config.kind !== "team" || entries.length === 0 || entries.length > 30) return false;
  const playerIds = entries.map((entry) => entry.playerId);
  if (playerIds.some((id) => !id) || new Set(playerIds).size !== playerIds.length) return false;
  const starters = entries.filter((entry) => (entry.role ?? "starter") === "starter");
  if (starters.length === 0 || starters.length > sportTeamSheetLimit(sport, format)) return false;
  if (entries.some((entry) => entry.role !== undefined && entry.role !== "starter" && entry.role !== "substitute")) return false;
  if (entries.some((entry) => entry.position && !config.positions.includes(entry.position))) return false;
  if (entries.filter((entry) => entry.captain).length > 1 || entries.some((entry) => entry.captain && (entry.role ?? "starter") !== "starter")) return false;
  const jerseyNumbers = entries.flatMap((entry) => entry.jerseyNumber === undefined ? [] : [entry.jerseyNumber]);
  return jerseyNumbers.every((number) => Number.isInteger(number) && number >= 0 && number <= 999) && new Set(jerseyNumbers).size === jerseyNumbers.length;
}

export function sportTeamSheetLimit(sport: string, format?: string): number {
  const config = sportFormatConfig(sport, format);
  if (!config || config.kind !== "team") return 0;
  return (format ? config.formatTeamSheetLimits?.[format] : undefined) ?? config.teamSheetLimit;
}

export function sportParticipantLimit(sport: string, format?: string): number {
  const config = sportFormatConfig(sport, format);
  if (!config) return 0;
  const configuredLimit = format ? config.formatParticipantLimits?.[format] : undefined;
  if (configuredLimit) return configuredLimit;
  // Team fixtures can include substitutes who take part even when only the
  // starting team is shown on the saved sheet.
  if (config.kind === "team") return 30;
  return config.teamSheetLimit;
}

export function validateParticipantEntries(sport: string, format: string | undefined, playerIds: string[]): boolean {
  const limit = sportParticipantLimit(sport, format);
  return limit > 0 && playerIds.length > 0 && playerIds.length <= limit && new Set(playerIds).size === playerIds.length;
}

export function aggregateScores(sport: string, values: number[], format?: string): number | null {
  const config = sportFormatConfig(sport, format);
  if (!config || !values.length) return null;
  if (config.aggregation === "sum") return values.reduce((sum, value) => sum + value, 0);
  if (config.aggregation === "average") return values.reduce((sum, value) => sum + value, 0) / values.length;
  return config.scoreDirection === "lower" ? Math.min(...values) : Math.max(...values);
}

export function formatSportScore(sport: string, value: number, format?: string): string {
  const config = sportFormatConfig(sport, format);
  if (!config) return "Not available";
  const precision = config.scoreKind === "decimal" ? 2 : 0;
  const formatted = value.toLocaleString(undefined, { maximumFractionDigits: precision });
  return `${formatted}${config.scoreUnit ? ` ${config.scoreUnit}` : ""}`;
}
