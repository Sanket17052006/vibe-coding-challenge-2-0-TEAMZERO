export const SPORTS = [
  "Football", "Cricket", "Hockey", "Badminton", "Basketball", "Volleyball", "Kabaddi",
  "Athletics", "Boxing", "Wrestling", "Kho-Kho", "Table Tennis", "Tennis", "Swimming",
  "Archery", "Shooting", "Weightlifting", "Gymnastics", "Handball", "Rugby", "Taekwondo",
  "Judo", "Fencing", "Squash", "Throwball", "Mallakhamb", "Cycling", "Golf",
] as const;

const sportSet = new Set<string>(SPORTS);
export function isSupportedSport(value: string): boolean { return sportSet.has(value); }
export function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
