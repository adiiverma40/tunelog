import { BASE_URL } from "./client";
import type {
  GenreResponse,
  GenreListResponse,
  AutoMatchResponse,
} from "./types";

export async function fetchGenres(): Promise<GenreResponse> {
  const res = await fetch(`${BASE_URL}/api/genre/read`);
  if (!res.ok) throw new Error("Failed to fetch genres");
  return res.json();
}

export async function writeGenre(
  genre: string,
  noisyGenre: string,
): Promise<GenreResponse> {
  const res = await fetch(
    `${BASE_URL}/api/genre/write?genre=${encodeURIComponent(genre)}&noisyGenre=${encodeURIComponent(noisyGenre)}`,
  );
  if (!res.ok) throw new Error("Failed to write genre");
  return res.json();
}

export async function deleteGenre(
  category: string,
  value?: string,
): Promise<GenreResponse> {
  let url = `${BASE_URL}/api/genre/delete?category=${encodeURIComponent(category)}`;
  if (value) url += `&value=${encodeURIComponent(value)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to delete genre");
  return res.json();
}

export async function fetchGenresFromDb(): Promise<GenreListResponse> {
  const res = await fetch(`${BASE_URL}/api/genre/get`);
  if (!res.ok) throw new Error("Failed to fetch genres from DB");
  return res.json();
}

export async function autoMatchGenres(): Promise<AutoMatchResponse> {
  const res = await fetch(`${BASE_URL}/api/genre/auto`);
  if (!res.ok) throw new Error("Failed to auto match genres");
  return res.json();
}
