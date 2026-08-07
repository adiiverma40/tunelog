// const viteUrl = new URL(import.meta.env.VITE_URL);

// export const BASE_URL = `${viteUrl.protocol}//${viteUrl.hostname}:${import.meta.env.VITE_SERVER_PORT}`;
//
if (import.meta.env.VITE_API_URL) {
  alert(
    "WARNING: 'VITE_API_URL' is deprecated in your .env file. " +
      "Please migrate to using 'VITE_URL' and 'VITE_SERVER_PORT'.",
  );
}

if (!import.meta.env.VITE_URL) {
  alert(
    "WARNING: Missing 'VITE_URL' in environment variables. Falling back to default: http://localhost:8000",
  );
}

let constructedBaseUrl = "";

try {
  const rawUrl = import.meta.env.VITE_URL || "http://localhost";
  const viteUrl = new URL(rawUrl);
  const port = import.meta.env.VITE_SERVER_PORT || "8000";
  constructedBaseUrl = `${viteUrl.protocol}//${viteUrl.hostname}:${port}`;
} catch (error) {
  console.error("ERROR: The provided VITE_URL is not a valid URL structure.");
  throw error;
}

export const BASE_URL = constructedBaseUrl;

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
