import { BASE_URL, getToken, getCurrentUser, getDashboardUser } from "./client";
import type {
  ListenBrainzEntry,
  LBPlaylist,
  LBTrack,
  LBMatchResponse,
  LBCFConfig,
  WeeklyLBFetch,
  LBCFConfigPayload,
  LBLibraryResponse,
} from "./types";

export async function getListenbrainzLog(): Promise<ListenBrainzEntry[]> {
  const res = await fetch(`${BASE_URL}/api/listenbrainz`);
  if (!res.ok) throw new Error("Failed to fetch listenbrainz log");
  return res.json();
}

export const matchTracksWithNavidrome = async (
  tracks: LBTrack[],
): Promise<LBMatchResponse> => {
  const res = await fetch(`${BASE_URL}/api/listenbrainz/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tracks }),
  });
  return res.json();
};

export const fetchListenbrainzPlaylists = async (
  lb_username: string,
): Promise<{ status: string; playlists: LBPlaylist[]; reason?: string }> => {
  const dashboard_user = getDashboardUser();
  const url = `${BASE_URL}/api/listenbrainz/playlists?lb_username=${encodeURIComponent(lb_username)}&dashboard_user=${encodeURIComponent(dashboard_user)}`;
  const res = await fetch(url);
  return res.json();
};

export const fetchListenbrainzPlaylistTracks = async (
  playlistId: string,
  lb_username: string,
): Promise<{ status: string; tracks: LBTrack[]; reason?: string }> => {
  const dashboard_user = getDashboardUser();
  const url = `${BASE_URL}/api/listenbrainz/playlist/${playlistId}/tracks?lb_username=${encodeURIComponent(lb_username)}&dashboard_user=${encodeURIComponent(dashboard_user)}`;
  const res = await fetch(url);
  return res.json();
};

export const createNavidromePlaylist = async (
  name: string,
  songIds: string[],
): Promise<{ status: string; reason?: string }> => {
  const dashboard_user = getDashboardUser();
  const res = await fetch(`${BASE_URL}/api/navidrome/playlist/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, song_ids: songIds, dashboard_user }),
  });
  return res.json();
};

export async function fetchLBCFConfig(): Promise<
  | {
      status: "ok";
      cf_playlist_config: LBCFConfig;
      weekly_LB_fetch: WeeklyLBFetch;
    }
  | { status: "error"; reason: string }
> {
  const token =
    localStorage.getItem("tunelog_token") ??
    sessionStorage.getItem("tunelog_token") ??
    "";

  const res = await fetch(`${BASE_URL}/api/lb-cf/config`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) return { status: "error", reason: `HTTP ${res.status}` };
  return res.json();
}

export async function saveLBCFConfig(
  payload: LBCFConfigPayload,
): Promise<{ status: "ok" } | { status: "error"; reason: string }> {
  const token =
    localStorage.getItem("tunelog_token") ??
    sessionStorage.getItem("tunelog_token") ??
    "";

  const res = await fetch(`${BASE_URL}/api/lb-cf/config`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) return { status: "error", reason: `HTTP ${res.status}` };
  return res.json();
}

export async function generateLBCFPlaylist(): Promise<
  { status: "ok"; playlist_id?: string } | { status: "error"; reason: string }
> {
  const token =
    localStorage.getItem("tunelog_token") ??
    sessionStorage.getItem("tunelog_token") ??
    "";

  const res = await fetch(`${BASE_URL}/api/lb-cf/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) return { status: "error", reason: `HTTP ${res.status}` };
  return res.json();
}

export async function fetchLBHasToken(): Promise<
  { status: "ok"; has_token: boolean } | { status: "error"; reason: string }
> {
  const user = getCurrentUser();
  const res = await fetch(
    `${BASE_URL}/api/lb-cf/has-token?user=${encodeURIComponent(user)}`,
    { headers: { Authorization: `Bearer ${getToken()}` } },
  );
  if (!res.ok) return { status: "error", reason: `HTTP ${res.status}` };
  return res.json();
}

export async function setLBToken(
  lbToken: string,
): Promise<{ status: "ok" } | { status: "error"; reason: string }> {
  const user = getCurrentUser();
  const res = await fetch(`${BASE_URL}/api/lb-cf/set-token`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      // Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ user, token: lbToken }),
  });
  if (!res.ok) return { status: "error", reason: `HTTP ${res.status}` };
  return res.json();
}

export async function fetchLBLibraryRecommendations(): Promise<LBLibraryResponse> {
  const token =
    localStorage.getItem("tunelog_token") ??
    sessionStorage.getItem("tunelog_token") ??
    "";

  const res = await fetch(`${BASE_URL}/api/lb-cf/library`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok)
    return {
      status: "error",
      in_library: [],
      not_in_library: [],
      reason: `HTTP ${res.status}`,
    };
  return res.json();
}
