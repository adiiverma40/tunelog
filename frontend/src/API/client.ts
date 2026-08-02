const viteUrl = new URL(import.meta.env.VITE_URL);

export const BASE_URL = `${viteUrl.protocol}//${viteUrl.hostname}:${import.meta.env.VITE_SERVER_PORT}`;

export function getToken(): string {
  return (
    localStorage.getItem("tunelog_token") ??
    sessionStorage.getItem("tunelog_token") ??
    ""
  );
}

export function getCurrentUser(): string {
  return (
    localStorage.getItem("tunelog_user") ??
    sessionStorage.getItem("tunelog_user") ??
    ""
  );
}

export function getDashboardUser(): string {
  return localStorage.getItem("tunelog_user") || "";
}
