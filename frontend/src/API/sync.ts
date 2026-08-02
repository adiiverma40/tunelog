import { BASE_URL } from "./client";
import type {
  SyncStatus,
  SyncStartResponse,
  SyncStopResponse,
  FallbackSyncStatus,
} from "./types";

export async function fetchSyncStatus(): Promise<SyncStatus> {
  const res = await fetch(`${BASE_URL}/api/sync/status`);
  if (!res.ok) throw new Error("Failed to fetch sync status");
  return res.json();
}

export async function fetchSyncStart(
  use_itunes: boolean,
): Promise<SyncStartResponse> {
  const res = await fetch(
    `${BASE_URL}/api/sync/start?use_itunes=${use_itunes}`,
  );
  if (!res.ok) throw new Error("Failed to start sync");
  return res.json();
}

export async function fetchSyncStop(): Promise<SyncStopResponse> {
  const res = await fetch(`${BASE_URL}/api/sync/stop`);
  if (!res.ok) throw new Error("Failed to stop sync");
  return res.json();
}

export async function fetchSyncSettings(
  autoSyncHour: number,
  useItunes: boolean,
  timezone: string = "Asia/Kolkata",
): Promise<{ status: string }> {
  const res = await fetch(
    `${BASE_URL}/api/sync/setting?auto_sync_hour=${autoSyncHour}&use_itunes=${useItunes}&timezone=${encodeURIComponent(timezone)}`,
  );
  if (!res.ok) throw new Error("Failed to save settings");
  return res.json();
}

export async function startFallbackSync(
  tries: number = 500,
): Promise<{ status: string; total?: number; reason?: string }> {
  const res = await fetch(`${BASE_URL}/api/sync/fallback?tries=${tries}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to start fallback sync");
  return res.json();
}

export async function fetchFallbackSyncStatus(): Promise<FallbackSyncStatus> {
  const res = await fetch(`${BASE_URL}/api/sync/fallback/status`);
  if (!res.ok) throw new Error("Failed to fetch fallback sync status");
  return res.json();
}

export async function stopFallbackSync(): Promise<{ status: string }> {
  const res = await fetch(`${BASE_URL}/api/sync/fallback/stop`);
  if (!res.ok) throw new Error("Failed to stop fallback sync");
  return res.json();
}
