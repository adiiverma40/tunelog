import type { NavidromeSong } from "./types";

export async function getSong(songId: string): Promise<NavidromeSong | null> {
  try {
    const baseUrl = import.meta.env.VITE_NAVIDROME_URL;
    const username = localStorage.getItem("tunelog_user") ?? "";
    const password = localStorage.getItem("tunelog_password") ?? "";

    if (!baseUrl || !username || !password) return null;

    const params = new URLSearchParams({
      u: username,
      p: password,
      v: "1.16.1",
      c: "tunelog",
      f: "json",
      id: songId,
    });

    const res = await fetch(`${baseUrl}/rest/getSong?${params}`);
    const data = await res.json();

    const song = data?.["subsonic-response"]?.song;
    if (!song) return null;
    console.log("get song");
    console.log(song);
    return song as NavidromeSong;
  } catch {
    return null;
  }
}

export function getCoverArtUrl(coverArtId: string): string {
  const baseUrl = import.meta.env.VITE_NAVIDROME_URL ?? "";
  const username = localStorage.getItem("tunelog_user") ?? "";
  const password = localStorage.getItem("tunelog_password") ?? "";

  const params = new URLSearchParams({
    u: username,
    p: password,
    v: "1.16.1",
    c: "tunelog",
    id: coverArtId,
    size: "80",
  });

  const url = `${baseUrl}/rest/getCoverArt?${params}`;
  console.log(url);
  return url;
}
