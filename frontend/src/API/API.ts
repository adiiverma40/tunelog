const BASE_URL = import.meta.env.VITE_API_URL;

export interface Stats {
  total_songs: number;
  total_listens: number;
  signals: {
    positive: number;
    skip: number;
    partial: number;
    repeat: number;
  };
  most_played_artists: Record<string, number>;
  most_played_songs: {
    title: string;
    artist: string;
    play_count: number;
  }[];
}

export interface SyncStatus {
  is_syncing: boolean;
  progress: number;
  start_sync: boolean;
  auto_sync: number;
  use_itunes: boolean;
  total_songs: number;
  explicit_songs: number;
  last_sync: string | null;
  songs_needing_itunes: number;
  explicit_counts: {
    explicit: number;
    notExplicit: number;
    cleaned: number;
    notInItunes: number;
    manual: number;
    pending: number;
  };
}

export interface SyncStartResponse {
  status: "started" | "already_syncing";
}

export interface SyncSettingResponse {
  status: "ok";
}

export interface SyncStopResponse {
  status: string;
  response: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  status: "success" | "failed";
  JWT?: string;
  reason?: string;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  isAdmin: boolean;
  admin: string;
  adminPD: string;
  email: string;
  name: string;
  isUpdate: boolean;
}

export interface CreateUserResponse {
  status: "success" | "failed";
  reason?: string;
  username?: string;
}

export interface AdminAuthRequest {
  admin: string;
  adminPD: string;
}

export interface User {
  username: string;
  password: string;
  isAdmin: boolean;
}

export interface GetUsersResponse {
  status: "ok" | "failed";
  users?: User[];
  reason?: string;
}

export interface UserDataResponse {
  status: "ok" | "failed";
  totalListens: number;
  skips: number;
  repeat: number;
  complete: number;
  partial: number;
  lastLogged: string;
  reason?: string;
}

export interface UserProfileResponse {
  status: "ok" | "failed";
  totalListens: number;
  skips: number;
  partial: number;
  complete: number;
  repeat: number;
  lastLogged: string;
  topSongs: {
    title: string;
    artist: string;
    count: number;
    signal: string;
  }[];
  topArtists: {
    artist: string;
    count: number;
  }[];
  topGenres: {
    genre: string;
    count: number;
  }[];
  recentHistory: {
    title: string;
    artist: string;
    genre: string;
    signal: string;
    listened_at: string;
  }[];
}

export interface PlaylistSong {
  song_id: string;
  title: string;
  artist: string;
  genre: string;
  signal: string;
  explicit: string;
}

export interface PlaylistStats {
  last_generated: string;
  total_songs: number;
  top_genre: string;
}

export interface PlaylistSongsResponse {
  status: string;
  stats: PlaylistStats;
  songs: PlaylistSong[];
}

export interface PlaylistGenerateResponse {
  status: "ok" | "error";
  songs_added?: number;
  size_requested?: number;
  message?: string;
  reason?: string;
}

export interface MonthlyListen {
  month: string;
  count: number;
}

export interface ManualMarkingSong {
  song_id: string;
  title: string;
  artist: string;
  album: string;
  genre: string | null;
  duration: number | null;
  explicit: string | null;
}

export type ExplicitTag = "explicit" | "cleaned" | "notExplicit";

export async function fetchPing(): Promise<{ status: string }> {
  const res = await fetch(`${BASE_URL}/api/ping`);
  if (!res.ok) throw new Error("Ping failed");
  return res.json();
}

export async function fetchStats(): Promise<Stats> {
  const res = await fetch(`${BASE_URL}/api/stats`);
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export async function fetchSyncStatus(): Promise<SyncStatus> {
  const res = await fetch(`${BASE_URL}/api/sync/status`);
  if (!res.ok) throw new Error("Failed to fetch sync status");
  return res.json();
}

export async function fetchSyncStart(
  use_itunes: boolean,
): Promise<SyncStartResponse> {
  const res = await fetch(
    `${BASE_URL}/api/sync/start?use_itunes=${use_itunes}`,
  );
  if (!res.ok) throw new Error("Failed to start sync");
  return res.json();
}

export async function fetchSyncStop(): Promise<SyncStopResponse> {
  const res = await fetch(`${BASE_URL}/api/sync/stop`);
  if (!res.ok) throw new Error("Failed to stop sync");
  return res.json();
}

export async function fetchSyncSettings(
  auto_sync_hour: number,
  use_itunes: boolean,
): Promise<SyncSettingResponse> {
  const res = await fetch(
    `${BASE_URL}/api/sync/setting?auto_sync_hour=${auto_sync_hour}&use_itunes=${use_itunes}`,
  );
  if (!res.ok) throw new Error("Failed to save sync settings");
  return res.json();
}

export async function fetchLogin(data: LoginRequest): Promise<LoginResponse> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Login failed");
  return res.json();
}

export async function fetchCreateUser(
  data: CreateUserRequest,
): Promise<CreateUserResponse> {
  const res = await fetch(`${BASE_URL}/admin/create-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create user");
  return res.json();
}

const USERS_CACHE_KEY = "tunelog_users_cache";

export async function fetchGetUsers(
  data: AdminAuthRequest,
): Promise<GetUsersResponse> {
  const cached = localStorage.getItem(USERS_CACHE_KEY);
  const cachedUsers: User[] = cached ? JSON.parse(cached) : [];

  const fetchPromise = fetch(`${BASE_URL}/admin/get-users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
    .then((res) => {
      if (!res.ok) throw new Error("Failed to get users");
      return res.json() as Promise<GetUsersResponse>;
    })
    .then((fresh) => {
      if (fresh.status === "ok" && fresh.users) {
        const freshStr = JSON.stringify(fresh.users);
        if (freshStr !== JSON.stringify(cachedUsers)) {
          localStorage.setItem(USERS_CACHE_KEY, freshStr);
        }
      }
      return fresh;
    });

  if (cachedUsers.length > 0) {
    return { status: "ok", users: cachedUsers };
  }

  return fetchPromise;
}

export async function fetchUserData(
  username: string,
  password: string,
): Promise<UserDataResponse> {
  const query = new URLSearchParams({ username, password }).toString();
  const res = await fetch(`${BASE_URL}/admin/getUserData?${query}`);
  if (!res.ok) throw new Error("Failed to fetch user data");
  return res.json();
}

export async function fetchUserProfile(
  username: string,
  password: string,
): Promise<UserProfileResponse> {
  const res = await fetch(
    `${BASE_URL}/api/user/profile?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
  );
  if (!res.ok) throw new Error("Failed to fetch user profile");
  return res.json();
}

export async function fetchPlaylistSongs(
  username: string,
): Promise<PlaylistSongsResponse> {
  const res = await fetch(
    `${BASE_URL}/api/playlist/songs?username=${username}`,
  );
  if (!res.ok) throw new Error("Failed to fetch playlist songs");
  return res.json();
}

export async function fetchMonthlyListens(): Promise<MonthlyListen[]> {
  const res = await fetch(`${BASE_URL}/api/library/getMonthlyListens`);
  if (!res.ok) throw new Error("Failed to fetch monthly listens");
  return res.json();
}

export async function fetchPlaylistGenerate(
  username: string,
  explicit_filter: string = "allow_cleaned",
  size: number = 50,
  slots?: Record<string, number>,
  weights?: Record<string, number>,
): Promise<PlaylistGenerateResponse> {
  const res = await fetch(`${BASE_URL}/api/playlist/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, explicit_filter, size, slots, weights }),
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
): Promise<PlaylistGenerateResponse> {
  try {
    const res = await fetch(`${BASE_URL}/api/playlist/append`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, explicit_filter, size, slots, weights }),
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

export async function fetchManualMarkingSongs(): Promise<{
  status: string;
  songs: ManualMarkingSong[];
}> {
  const res = await fetch(`${BASE_URL}/api/library/marking`);
  if (!res.ok) throw new Error("Failed to fetch marking songs");
  return res.json();
}

export async function updateExplicitTag(
  song_id: string,
  explicit: ExplicitTag,
): Promise<{ status: string; song_id: string; explicit: string }> {
  const res = await fetch(`${BASE_URL}/api/library/marking`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ song_id, explicit }),
  });
  if (!res.ok) throw new Error("Failed to update explicit tag");
  return res.json();
}