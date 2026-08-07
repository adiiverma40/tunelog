import { BASE_URL } from "./client";
import type { LoginRequest, LoginResponse } from "./types";

export async function fetchLogin(data: LoginRequest): Promise<LoginResponse> {
  const formData = new URLSearchParams();
  formData.append("username", data.username);
  formData.append("password", data.password);

  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error(`HTTP error! status: ${res.status}`);
  }

  const json = await res.json();
  console.log(json);

  if (json.status !== "success") {
    throw new Error(json.reason || "Login failed");
  }
  console.log("success");
  return json;
}

export async function CheckAuth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/ping`, {
      method: "GET",
      credentials: "include",
    });
    return res.ok;
  } catch (error) {
    console.error(error);
    return false;
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${BASE_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch (error) {
    console.error(error);
  }
}

export async function fetchPing(): Promise<{ status: string }> {
  const res = await fetch(`${BASE_URL}/api/ping`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Ping failed");
  return res.json();
}
