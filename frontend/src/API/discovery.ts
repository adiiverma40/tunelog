import { BASE_URL } from "./client";
import type { DiscoveryQueueParams, DiscoveryQueueResponse } from "./types";

export async function generateDiscoveryQueue(
  params: DiscoveryQueueParams,
): Promise<DiscoveryQueueResponse> {
  const token =
    localStorage.getItem("tunelog_token") ??
    sessionStorage.getItem("tunelog_token") ??
    "";

  const res = await fetch(`${BASE_URL}/generateDiscoveryQueue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    throw new Error(`Discovery Queue request failed: HTTP ${res.status}`);
  }

  return res.json() as Promise<DiscoveryQueueResponse>;
}

interface PlaylistResponse {
  status: "success" | "error";
  id: string | null;
}

export async function fetchDiscoveryPlaylistId(
  username: string,
): Promise<PlaylistResponse> {
  const endpoint = "playlist/discoveryid";
  const url = `${BASE_URL}/${endpoint}?username=${encodeURIComponent(username)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: PlaylistResponse = await response.json();
    return data;
  } catch (error) {
    console.error("Failed to fetch discovery playlist ID:", error);
    return {
      status: "error",
      id: null,
    };
  }
}
