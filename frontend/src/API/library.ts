import { BASE_URL, getToken } from "./client";
import type {
  ManualMarkingSong,
  ExplicitTag,
  SkippedSong,
  RecommendedSong,
  GenerateScriptRequest,
  GenerateScriptResponse,
  SkippedSettings,
} from "./types";

export async function fetchManualMarkingSongs(): Promise<{
  status: string;
  songs: ManualMarkingSong[];
}> {
  const res = await fetch(`${BASE_URL}/api/library/marking`);
  if (!res.ok) throw new Error("Failed to fetch marking songs");
  return res.json();
}

export async function updateExplicitTag(
  song_id: string,
  explicit: ExplicitTag,
): Promise<{ status: string; song_id: string; explicit: string }> {
  const res = await fetch(`${BASE_URL}/api/library/marking`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ song_id, explicit }),
  });
  if (!res.ok) throw new Error("Failed to update explicit tag");
  return res.json();
}

export async function getSkippedSongs(): Promise<SkippedSong[]> {
  const res = await fetch(`${BASE_URL}/api/listens/skipped`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok)
    throw new Error(
      `Failed to fetch skipped songs: ${res.status} ${res.statusText}`,
    );
  return res.json() as Promise<SkippedSong[]>;
}

export async function getRecommendedDeletes(): Promise<RecommendedSong[]> {
  const res = await fetch(`${BASE_URL}/api/library/recommend-delete`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok)
    throw new Error(
      `Failed to fetch recommendations: ${res.status} ${res.statusText}`,
    );
  return res.json() as Promise<RecommendedSong[]>;
}

export async function generateScript(
  req: GenerateScriptRequest,
): Promise<GenerateScriptResponse> {
  const res = await fetch(`${BASE_URL}/api/library/generate-script`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
  });
  if (!res.ok)
    throw new Error(
      `Failed to generate script: ${res.status} ${res.statusText}`,
    );
  return res.json() as Promise<GenerateScriptResponse>;
}

export async function getScriptSettings(): Promise<SkippedSettings | null> {
  const res = await fetch(`${BASE_URL}/api/library/script-settings`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error(
      `Failed to fetch script settings: ${res.status} ${res.statusText}`,
    );
  }

  return res.json() as Promise<SkippedSettings>;
}

export async function saveScriptSettings(
  settings: SkippedSettings,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/library/script-settings`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(settings),
  });

  if (!res.ok) {
    throw new Error(
      `Failed to save script settings: ${res.status} ${res.statusText}`,
    );
  }
}
