import { BASE_URL } from "./client";

export function getCoverArt(songId: string): string {
  const url = `${BASE_URL}/api/coverart/${songId}`;
  return url;
}
