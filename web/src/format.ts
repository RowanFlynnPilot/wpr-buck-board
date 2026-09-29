import type { AgeGroup, DeerType, Weapon } from "./types";

// AP style: abbreviate Jan., Feb., Aug., Sept., Oct., Nov., Dec.; spell out the rest.
const AP_MONTHS = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
const CHICAGO = "America/Chicago";

// A timestamp shown as a Wausau calendar day, e.g. "Oct. 12".
export function apDate(timestamp: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: CHICAGO, month: "numeric", day: "numeric" }).formatToParts(
    new Date(timestamp),
  );
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = parts.find((p) => p.type === "day")?.value;
  return `${AP_MONTHS[month - 1]}\u00a0${day}`;
}

// Season windows end at midnight; readers think in terms of the last full day.
export function apLastDay(exclusiveEnd: string): string {
  return apDate(new Date(Date.parse(exclusiveEnd) - 1).toISOString());
}

// A calendar date (YYYY-MM-DD) with no time zone attached.
export function apDay(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${AP_MONTHS[month - 1]}\u00a0${day}`;
}

export function todayInWausau(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CHICAGO }).format(new Date());
}

// A calendar date (YYYY-MM-DD) moved by whole days.
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The moment a Wausau calendar day begins, as an ISO timestamp (CST or CDT, whichever applies).
export function wausauMidnight(date: string): string {
  const cstMidnight = new Date(`${date}T06:00:00Z`);
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: CHICAGO, hour: "numeric", hourCycle: "h23" }).format(cstMidnight),
  );
  return new Date(cstMidnight.getTime() - hour * 3_600_000).toISOString();
}

// AP style: spell out one through nine, numerals from 10.
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
export function apNumber(n: number): string {
  return n < 10 ? NUMBER_WORDS[n] : n.toLocaleString("en-US");
}

export function daysUntil(timestamp: string): number {
  return Math.ceil((Date.parse(timestamp) - Date.now()) / 86_400_000);
}

export const WEAPON_LABELS: Record<Weapon, string> = {
  bow: "Bow",
  crossbow: "Crossbow",
  rifle: "Rifle",
  shotgun: "Shotgun",
  muzzleloader: "Muzzleloader",
  handgun: "Handgun",
};

export const AGE_LABELS: Record<AgeGroup, string> = {
  youth: "17 and under",
  adult: "18 to 64",
  veteran: "65 and older",
};

export function describeDeer(deer: DeerType, points: number | null): string {
  if (deer === "antlerless") return "Antlerless deer";
  return points === null ? "Buck" : `${points}-point buck`;
}
