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
  timezone: string;
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

export interface FallbackSyncStatus {
  status: string;
  is_running: boolean;
  processed: number;
  total: number;
  progress: number;
}

export interface GenreResponse {
  status: string;
  Genre: Record<string, string[]>;
}

export interface GenreListResponse {
  status: string;
  genres: string[];
}
export interface AutoMatchResponse {
  status: string;
  unmapped: GenreListResponse;
  genre_updated: number;
}

export interface ImportResponse {
  status: "success" | "failed";
  message?: string;
  reason?: string;
  data?: {
    matched_ids: string[];
    results: {
      title: string;
      artist: string;
      found: boolean;
      song_id: string | null;
    }[];
    summary: {
      total: number;
      matched: number;
      not_found: number;
    };
  };
}

export type NotificationField = "songState" | "playlist" | "starredSong";

export interface SongStateEvent {
  username: string;
  song: string;
  state: "started" | "stopped";
}

export interface PlaylistNotifEvent {
  username: string;
  size: number;
  type: "append" | "regenerate";
}

export interface StarredSongEvent {
  username: string;
  song: string;
  star: number | string;
}

export interface NotificationPayload {
  songState?: SongStateEvent[];
  playlist?: PlaylistNotifEvent[];
  starredSong?: StarredSongEvent[];
}

export interface PlaylistCreateRequest {
  username: string[];
  song_ids: string[];
  playlist_name: string;
}

export interface PlaylistGenerationConfig {
  playlist_size: number;
  wildcard_day: number;
  signal_weights: {
    repeat: number;
    positive: number;
    partial: number;
    skip: number;
  };
  slot_ratios: {
    positive: number;
    repeat: number;
    partial: number;
    skip: number;
  };
  injection_breakdown: {
    signal: number;
    unheard: number;
    wildcard: number;
  };
}

export interface BehavioralScoringConfig {
  skip_threshold_pct: number;
  positive_threshold_pct: number;
  repeat_time_window_min: number;
  stale_session_timeout_sec: number;
  min_listens_for_star: number;
  historical_decay_factor: number;
}

export interface SyncAndAutomationConfig {
  auto_sync_hour: number;
  timezone: string;
  use_itunes_fallback: boolean;
  auto_sync_after_navidrome: boolean;
}

export interface ApiAndPerformanceConfig {
  max_fuzzy_iterations: number;
  api_max_retries: number;
  api_retry_delay_sec: number;
  itunes_search_depth: number;
  sync_confidence: {
    min_match_score: number;
    metadata_overwrite_score: number;
    genre_map_strictness: number;
    duration_tolerance_pct: number;
  };
}

export interface TuneConfig {
  playlist_generation: PlaylistGenerationConfig;
  behavioral_scoring: BehavioralScoringConfig;
  sync_and_automation: SyncAndAutomationConfig;
  api_and_performance: ApiAndPerformanceConfig;
}

export interface UpdateConfigResponse {
  status: string;
  message: string;
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
  autoSyncHour: number,
  useItunes: boolean,
  timezone: string = "Asia/Kolkata",
): Promise<{ status: string }> {
  const res = await fetch(
    `${BASE_URL}/api/sync/setting?auto_sync_hour=${autoSyncHour}&use_itunes=${useItunes}&timezone=${encodeURIComponent(timezone)}`,
  );
  if (!res.ok) throw new Error("Failed to save settings");
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
  injection: boolean = true,
): Promise<PlaylistGenerateResponse> {
  const res = await fetch(`${BASE_URL}/api/playlist/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      explicit_filter,
      size,
      slots,
      weights,
      injection,
    }),
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
  injection: boolean = true,
): Promise<PlaylistGenerateResponse> {
  try {
    const res = await fetch(`${BASE_URL}/api/playlist/append`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        explicit_filter,
        size,
        slots,
        weights,
        injection,
      }),
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

export async function startFallbackSync(
  tries: number = 500,
): Promise<{ status: string; total?: number; reason?: string }> {
  const res = await fetch(`${BASE_URL}/api/sync/fallback?tries=${tries}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to start fallback sync");
  return res.json();
}

export async function fetchFallbackSyncStatus(): Promise<FallbackSyncStatus> {
  const res = await fetch(`${BASE_URL}/api/sync/fallback/status`);
  if (!res.ok) throw new Error("Failed to fetch fallback sync status");
  return res.json();
}

export async function stopFallbackSync(): Promise<{ status: string }> {
  const res = await fetch(`${BASE_URL}/api/sync/fallback/stop`);
  if (!res.ok) throw new Error("Failed to stop fallback sync");
  return res.json();
}

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
    `${BASE_URL}/api/genre/write?genre=${encodeURIComponent(
      genre,
    )}&noisyGenre=${encodeURIComponent(noisyGenre)}`,
  );

  if (!res.ok) throw new Error("Failed to write genre");

  return res.json();
}

export async function deleteGenre(
  category: string,
  value?: string,
): Promise<GenreResponse> {
  let url = `${BASE_URL}/api/genre/delete?category=${encodeURIComponent(
    category,
  )}`;

  if (value) {
    url += `&value=${encodeURIComponent(value)}`;
  }

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

export async function fetchImportCSV(file: File): Promise<ImportResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/import/csv`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw new Error("Failed to upload CSV");
  return res.json();
}

export async function fetchCreatePlaylistFromIds(
  data: PlaylistCreateRequest,
): Promise<{ status: string; message: string; reason?: string }> {
  const res = await fetch(
    `${import.meta.env.VITE_API_URL}/api/import/csvPlaylist`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  console.log(data);
  if (!res.ok) throw new Error("Failed to create playlist");
  return res.json();
}

export function connectNotificationStream(
  onMessage: (payload: NotificationPayload) => void,
  onError?: (err: Event) => void,
): EventSource {
  const es = new EventSource(`${BASE_URL}/notifications/stream`);
  console.log("api called notification/stream");
  es.onmessage = (event) => {
    try {
      const payload: NotificationPayload = JSON.parse(event.data);
      onMessage(payload);
    } catch (e) {
      console.error("[SSE] Failed to parse notification:", e);
    }
  };

  if (onError) es.onerror = onError;

  return es;
}

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
