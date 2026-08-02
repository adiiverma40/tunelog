import type { ImportResponse } from "./types";
import { BASE_URL } from "./client";

export async function fetchImportCSV(file: File): Promise<ImportResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${BASE_URL}/api/import/csv`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("Failed to upload CSV");
  return res.json();
}
