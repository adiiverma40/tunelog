import { BASE_URL } from "./client";
import type { TuneConfig, UpdateConfigResponse } from "./types";

export async function fetchGetConfig(): Promise<TuneConfig> {
  const res = await fetch(`${BASE_URL}/api/config`);
  if (!res.ok) throw new Error("Failed to fetch configuration");
  return res.json();
}

export async function fetchUpdateConfig(
  data: TuneConfig,
): Promise<UpdateConfigResponse> {
  const res = await fetch(`${BASE_URL}/api/config/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update configuration");
  return res.json();
}
