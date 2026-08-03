// api/types.ts
//
// Every request/response shape used by the API layer, in one place.
// Domain modules import only the types they need from here.

// ---- Profile ----------------------------------------------------

export interface UpdateProfileRequest {
  username: string;
  displayName: string;
  avatar?: File | null;
}

export interface UpdateProfileResponse {
  status: string;
  message: string;
  user?: {
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
}
export interface UserProfileDetailsResponse {
  status: string;
  user: {
    username: string;
    name: string;
    avatar: string | null;
  };
}
// ---- Discovery queue ---------------------------------------------

export interface DiscoveryQueueParams {
  username: string;
  size: number;
  date_from?: string | null;
  date_to?: string | null;
  days_from?: number;
  days_to?: number;
  backtrack: boolean;
  explicit_filter: "strict" | "allow_cleaned" | "all";
}

export interface DiscoveryQueueSong {
  song_id: string;
  title: string;
  artist: string;
  genre: string | null;
  explicit: string | null;
  date_added: string;
}

export interface DiscoveryQueueResponse {
  status: "ok" | "error";
  songs?: DiscoveryQueueSong[];
  songs_added?: number;
  total?: number;
  effective_date_from?: string;
  effective_date_to?: string;
  backtracked?: boolean;
  backtrack_days?: number;
  reason?: string;
}

// ---- Stats ---------------------------------------------------------

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

export interface MonthlyListen {
  month: string;
  count: number;
}

// ---- Sync ---------------------------------------------------------

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

export interface FallbackSyncStatus {
  status: string;
  is_running: boolean;
  processed: number;
  total: number;
  progress: number;
}

// ---- Auth / admin ---------------------------------------------------

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  status: "success" | "failed";
  message?: string;
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
  name: string;
  avatarUrl: string | null;
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
    id: string;
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
    id: string;
    title: string;
    artist: string;
    genre: string;
    signal: string;
    listened_at: string;
  }[];
}

// ---- Playlist -------------------------------------------------------

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

export interface PlaylistCreateRequest {
  username: string[];
  song_ids: string[];
  playlist_name: string;
}

export interface TierPlaylist {
  username: string;
  size: number;
}

export interface TierPlaylistResponse {
  status: string;
}

// ---- Library / marking ----------------------------------------------

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

export type ShellType = "bash" | "mac" | "powershell";
export type ScriptAction = "delete" | "move";

// NOTE: the original file declared `SkippedSong` twice (once with a
// `signal` field, once with `skip_count` instead). TypeScript merges
// duplicate interface declarations, so the real shape in use was the
// union of both — that's preserved here as a single definition
// instead of two conflicting ones.
export interface SkippedSong {
  id: number;
  song_id: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  duration: number | null;
  signal: string | null;
  genre: string | null;
  skip_count: number | null;
  timestamp: string;
  user_id: string | null;
}

export interface RecommendedSong {
  song_id: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  reason: string | null;
  skip_count: number | null;
}

export interface GenerateScriptRequest {
  song_ids: string[];
  shell: ShellType;
  base_path: string;
  action: ScriptAction;
}

export interface GenerateScriptResponse {
  script: string;
}

export interface SkippedSettings {
  shell: ShellType;
  basePath: string;
  action: ScriptAction;
}

// ---- Genre ------------------------------------------------------------

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

// ---- CSV import -----------------------------------------------------

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

// ---- Notifications (SSE) --------------------------------------------

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

// ---- Tune config ------------------------------------------------------

export type AutoGenerateExplicit =
  "all" | "cleaned" | "explicit" | "notExplicit";

export type TreatDataAs = "partial" | "complete" | "skip";

export interface PlaylistGenerationConfig {
  playlist_size: number;
  wildcard_day: number;
  auto_generate_playlist: boolean;
  auto_generate_time: number;
  auto_generate_when_complete: boolean;
  auto_generate_completion_percent: number;
  auto_generate_explicit: AutoGenerateExplicit;
  auto_generate_for: string[];
  auto_generate_injection: boolean;
  last_auto_generate: string;

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
  long_song_duration: number;
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

export interface ListenBrainzConfig {
  enabled: boolean;
  username: string;
  treat_data_as: TreatDataAs;
  pool_listen_brainz: number;
  for_users: string[];
  dedup_window_seconds: number;
  last_synced: number;
  PushLovedSongs: boolean;
}

export interface TuneConfig {
  playlist_generation: PlaylistGenerationConfig;
  behavioral_scoring: BehavioralScoringConfig;
  sync_and_automation: SyncAndAutomationConfig;
  api_and_performance: ApiAndPerformanceConfig;
  jam?: {
    same_song_in_queue: boolean;
    only_host_change_queue: boolean;
    only_host_clear_queue: boolean;
    only_host_add_queue: boolean;
  };
  listenbrainz?: ListenBrainzConfig;
}

export interface UpdateConfigResponse {
  status: string;
  message: string;
}

// ---- Navidrome (Subsonic API) ------------------------------------------

export interface NavidromeSong {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverArt: string;
  duration: number;
  track?: number;
  year?: number;
  genre?: string;
  albumId?: string;
  artistId?: string;
  bitRate?: number;
  path?: string;
  created?: string;
}

// ---- ListenBrainz ----------------------------------------------------

export interface ListenBrainzEntry {
  id: number;
  song_id: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  signal: string | null;
  tag: string | null;
  comment: string | null;
  timestamp: string;
}

export interface LBPlaylist {
  id: string;
  title: string;
  creator: string;
  track_count: number;
  type: "user" | "created_for_you";
}

export interface LBTrack {
  title: string;
  artist: string;
  album?: string;
  mbid?: string;
  navidrome_id?: string | null;
  cover_art_url?: string;
}

export interface LBMatchResponse {
  status: "ok" | "error";
  tracks: LBTrack[];
  matched_count: number;
  reason?: string;
}

export interface LBCFConfig {
  size: number;
  heard: number;
  unheard: number;
  unheard_genre_injection: boolean;
  heard_genre_injection: boolean;
  last_generated: number;
  auto_generate_time: number;
  Name: string;
  backfill_unheard_song: boolean;
  use_blend: boolean;
  heard_last_score: number;
  unheard_last_score: number;
  fallbackScore: boolean;
  for_users: string[];
}

export interface WeeklyLBFetch {
  last_synced: number;
  check_interval: number;
}

export interface LBCFConfigPayload {
  cf_playlist_config: LBCFConfig;
  weekly_LB_fetch: WeeklyLBFetch;
}

export interface LBLibrarySong {
  navidrome_id: string;
  title: string;
  artist: string;
  album: string | null;
  recording_mbid: string;
  for_user: string;
  score: number;
}

export interface LBMissingSong {
  recording_mbid: string;
  release_mbid: string | null;
  title: string;
  artist: string;
  album: string | null;
  for_user: string;
  score: number;
}

export interface LBLibraryResponse {
  status: "ok" | "error";
  in_library: LBLibrarySong[];
  not_in_library: LBMissingSong[];
  reason?: string;
}
