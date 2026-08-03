import { BASE_URL, getToken } from "./client";
import type {
  PlaylistSongsResponse,
  PlaylistGenerateResponse,
  PlaylistCreateRequest,
  TierPlaylist,
  TierPlaylistResponse,
} from "./types";

export async function fetchPlaylistSongs(
  username: string,
): Promise<PlaylistSongsResponse> {
  const res = await fetch(
    `${BASE_URL}/api/playlist/songs?username=${username}`,
  );
  if (!res.ok) throw new Error("Failed to fetch playlist songs");
  return res.json();
}

export async function fetchPlaylistGenerate(
  username: string,
  explicit_filter: string = "allow_cleaned",
  size: number = 50,
  slots?: Record<string, number>,
  weights?: Record<string, number>,
  injection: boolean = true,
): Promise<PlaylistGenerateResponse> {
  const res = await fetch(`${BASE_URL}/api/playlist/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      explicit_filter,
      size,
      slots,
      weights,
      injection,
    }),
  });
  if (!res.ok) throw new Error("Failed to generate playlist");
  return res.json();
}

export async function appendPlaylist(
  username: string,
  explicit_filter: string = "allow_cleaned",
  size: number = 50,
  slots?: Record<string, number>,
  weights?: Record<string, number>,
  injection: boolean = true,
): Promise<PlaylistGenerateResponse> {
  try {
    const res = await fetch(`${BASE_URL}/api/playlist/append`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        explicit_filter,
        size,
        slots,
        weights,
        injection,
      }),
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return res.json();
  } catch (error) {
    console.error("[API] Append Playlist failed:", error);
    return {
      status: "error",
      reason: error instanceof Error ? error.message : "Unknown network error",
    };
  }
}

export async function fetchCreatePlaylistFromIds(
  data: PlaylistCreateRequest,
): Promise<{ status: string; message: string; reason?: string }> {
  const res = await fetch(
    `${import.meta.env.VITE_API_URL}/api/import/csvPlaylist`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  console.log(data);
  if (!res.ok) throw new Error("Failed to create playlist");
  return res.json();
}

export async function tierPlaylist(
  data: TierPlaylist,
): Promise<TierPlaylistResponse> {
  const res = await fetch(`${BASE_URL}/api/import/tierPlaylist`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error(
      `Failed to create tier playlist: ${res.status} ${res.statusText}`,
    );
  }

  const result: TierPlaylistResponse = await res.json();

  if (result.status !== "success") {
    throw new Error(result.status);
  }

  return result;
}




export async function fetchUserPlaylistIds() {
  const res = await fetch(`${BASE_URL}/api/user/playlist-ids`, {
    method: "GET",
    credentials: "include",
  }); 
  return res.json(); }

export async function fetchPlaylistTracks(playlistId: string) {
  const res = await fetch(`${BASE_URL}/api/playlist/${playlistId}/tracks`, {
    credentials: "include",
  });
  return res.json();
}