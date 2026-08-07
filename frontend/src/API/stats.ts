import { BASE_URL } from "./client";
import type { Stats, MonthlyListen } from "./types";

export async function fetchStats(): Promise<Stats> {
  const res = await fetch(`${BASE_URL}/api/stats`);
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export async function fetchMonthlyListens(): Promise<MonthlyListen[]> {
  const res = await fetch(`${BASE_URL}/api/library/getMonthlyListens`);
  if (!res.ok) throw new Error("Failed to fetch monthly listens");
  return res.json();
}
