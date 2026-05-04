import { useState, useEffect } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import Button from "../../components/ui/button/Button";
import Switch from "../../components/form/switch/Switch";
import {
  fetchGetConfig,
  fetchUpdateConfig,
  TuneConfig,
  AutoGenerateExplicit,
  TreatDataAs,
} from "../../API/API";

interface Config {
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
  w_repeat: number;
  w_positive: number;
  w_partial: number;
  w_skip: number;
  s_positive: number;
  s_repeat: number;
  s_partial: number;
  s_skip: number;
  inj_signal: number;
  inj_unheard: number;
  inj_wildcard: number;
  skip_thresh: number;
  pos_thresh: number;
  repeat_window: number;
  stale_timeout: number;
  min_listens: number;
  decay: number;
  sync_hour: number;
  timezone: string;
  itunes_fallback: boolean;
  auto_sync_after_navidrome: boolean;
  fuzzy_iter: number;
  api_retries: number;
  retry_delay: number;
  itunes_depth: number;
  min_match: number;
  meta_overwrite: number;
  genre_strictness: number;
  duration_tol: number;
  jam_same_song_in_queue: boolean;
  jam_only_host_change_queue: boolean;
  jam_only_host_clear_queue: boolean;
  jam_only_host_add_queue: boolean;
  lb_enabled: boolean;
  lb_username: string;
  lb_treat_data_as: TreatDataAs;
  lb_pool_interval: number;
  lb_for_users: string[];
  lb_dedup_window: number;
  lb_last_synced: number;

  long_song_duration: number;
}

const DEFAULTS: Config = {
  playlist_size: 40,
  wildcard_day: 60,
  auto_generate_playlist: true,
  auto_generate_time: 4,
  auto_generate_when_complete: true,
  auto_generate_completion_percent: 80,
  auto_generate_explicit: "all",
  auto_generate_for: [],
  auto_generate_injection: true,
  last_auto_generate: "0",
  w_repeat: 3,
  w_positive: 2,
  w_partial: 0,
  w_skip: -2,
  s_positive: 0.35,
  s_repeat: 0.35,
  s_partial: 0.25,
  s_skip: 0.05,
  inj_signal: 0.57,
  inj_unheard: 0.35,
  inj_wildcard: 0.08,
  skip_thresh: 30,
  pos_thresh: 80,
  repeat_window: 30,
  stale_timeout: 600,
  min_listens: 3,
  decay: 0.9,
  sync_hour: 2,
  timezone: "Asia/Kolkata",
  itunes_fallback: false,
  auto_sync_after_navidrome: true,
  fuzzy_iter: 500,
  api_retries: 3,
  retry_delay: 3,
  itunes_depth: 200,
  min_match: 70,
  meta_overwrite: 80,
  genre_strictness: 95,
  duration_tol: 10,
  jam_same_song_in_queue: false,
  jam_only_host_change_queue: false,
  jam_only_host_clear_queue: true,
  jam_only_host_add_queue: false,
  lb_enabled: false,
  lb_username: "",
  lb_treat_data_as: "partial",
  lb_pool_interval: 1,
  lb_for_users: [],
  lb_dedup_window: 30,
  lb_last_synced: 0,
  long_song_duration: 300,
};

const mapApiToState = (api: TuneConfig): Config => ({
  long_song_duration: api.behavioral_scoring.long_song_duration,
  playlist_size: api.playlist_generation.playlist_size,
  wildcard_day: api.playlist_generation.wildcard_day,
  auto_generate_playlist: api.playlist_generation.auto_generate_playlist,
  auto_generate_time: api.playlist_generation.auto_generate_time,
  auto_generate_when_complete:
    api.playlist_generation.auto_generate_when_complete,
  auto_generate_completion_percent:
    api.playlist_generation.auto_generate_completion_percent,
  auto_generate_explicit: api.playlist_generation.auto_generate_explicit,
  auto_generate_for: api.playlist_generation.auto_generate_for,
  auto_generate_injection: api.playlist_generation.auto_generate_injection,
  last_auto_generate: "0",
  w_repeat: api.playlist_generation.signal_weights.repeat,
  w_positive: api.playlist_generation.signal_weights.positive,
  w_partial: api.playlist_generation.signal_weights.partial,
  w_skip: api.playlist_generation.signal_weights.skip,
  s_positive: api.playlist_generation.slot_ratios.positive,
  s_repeat: api.playlist_generation.slot_ratios.repeat,
  s_partial: api.playlist_generation.slot_ratios.partial,
  s_skip: api.playlist_generation.slot_ratios.skip,
  inj_signal: api.playlist_generation.injection_breakdown.signal,
  inj_unheard: api.playlist_generation.injection_breakdown.unheard,
  inj_wildcard: api.playlist_generation.injection_breakdown.wildcard,
  skip_thresh: api.behavioral_scoring.skip_threshold_pct,
  pos_thresh: api.behavioral_scoring.positive_threshold_pct,
  repeat_window: api.behavioral_scoring.repeat_time_window_min,
  stale_timeout: api.behavioral_scoring.stale_session_timeout_sec,
  min_listens: api.behavioral_scoring.min_listens_for_star,
  decay: api.behavioral_scoring.historical_decay_factor,
  sync_hour: api.sync_and_automation.auto_sync_hour,
  timezone: api.sync_and_automation.timezone,
  itunes_fallback: api.sync_and_automation.use_itunes_fallback,
  auto_sync_after_navidrome: api.sync_and_automation.auto_sync_after_navidrome,
  fuzzy_iter: api.api_and_performance.max_fuzzy_iterations,
  api_retries: api.api_and_performance.api_max_retries,
  retry_delay: api.api_and_performance.api_retry_delay_sec,
  itunes_depth: api.api_and_performance.itunes_search_depth,
  min_match: api.api_and_performance.sync_confidence.min_match_score,
  meta_overwrite:
    api.api_and_performance.sync_confidence.metadata_overwrite_score,
  genre_strictness:
    api.api_and_performance.sync_confidence.genre_map_strictness,
  duration_tol: api.api_and_performance.sync_confidence.duration_tolerance_pct,
  jam_same_song_in_queue: api.jam?.same_song_in_queue ?? false,
  jam_only_host_change_queue: api.jam?.only_host_change_queue ?? false,
  jam_only_host_clear_queue: api.jam?.only_host_clear_queue ?? true,
  jam_only_host_add_queue: api.jam?.only_host_add_queue ?? false,
  lb_enabled: api.listenbrainz?.enabled ?? false,
  lb_username: api.listenbrainz?.username ?? "",
  lb_treat_data_as: api.listenbrainz?.treat_data_as ?? "partial",
  lb_pool_interval: api.listenbrainz?.pool_listen_brainz ?? 1,
  lb_for_users: api.listenbrainz?.for_users ?? [],
  lb_dedup_window: api.listenbrainz?.dedup_window_seconds ?? 30,
  lb_last_synced: api.listenbrainz?.last_synced ?? 0,
});

const mapStateToApi = (state: Config): TuneConfig => ({
  playlist_generation: {
    playlist_size: state.playlist_size,
    wildcard_day: state.wildcard_day,
    auto_generate_playlist: state.auto_generate_playlist,
    auto_generate_time: state.auto_generate_time,
    auto_generate_when_complete: state.auto_generate_when_complete,
    auto_generate_completion_percent: state.auto_generate_completion_percent,
    auto_generate_explicit: state.auto_generate_explicit,
    auto_generate_for: state.auto_generate_for,
    auto_generate_injection: state.auto_generate_injection,
    last_auto_generate: "0",
    signal_weights: {
      repeat: state.w_repeat,
      positive: state.w_positive,
      partial: state.w_partial,
      skip: state.w_skip,
    },
    slot_ratios: {
      positive: state.s_positive,
      repeat: state.s_repeat,
      partial: state.s_partial,
      skip: state.s_skip,
    },
    injection_breakdown: {
      signal: state.inj_signal,
      unheard: state.inj_unheard,
      wildcard: state.inj_wildcard,
    },
  },
  behavioral_scoring: {
    long_song_duration: 300,
    skip_threshold_pct: state.skip_thresh,
    positive_threshold_pct: state.pos_thresh,
    repeat_time_window_min: state.repeat_window,
    stale_session_timeout_sec: state.stale_timeout,
    min_listens_for_star: state.min_listens,
    historical_decay_factor: state.decay,
  },
  sync_and_automation: {
    auto_sync_hour: state.sync_hour,
    timezone: state.timezone,
    use_itunes_fallback: state.itunes_fallback,
    auto_sync_after_navidrome: state.auto_sync_after_navidrome,
  },
  api_and_performance: {
    max_fuzzy_iterations: state.fuzzy_iter,
    api_max_retries: state.api_retries,
    api_retry_delay_sec: state.retry_delay,
    itunes_search_depth: state.itunes_depth,
    sync_confidence: {
      min_match_score: state.min_match,
      metadata_overwrite_score: state.meta_overwrite,
      genre_map_strictness: state.genre_strictness,
      duration_tolerance_pct: state.duration_tol,
    },
  },
  jam: {
    same_song_in_queue: state.jam_same_song_in_queue,
    only_host_change_queue: state.jam_only_host_change_queue,
    only_host_clear_queue: state.jam_only_host_clear_queue,
    only_host_add_queue: state.jam_only_host_add_queue,
  },
  listenbrainz: {
    enabled: state.lb_enabled,
    username: state.lb_username,
    treat_data_as: state.lb_treat_data_as,
    pool_listen_brainz: state.lb_pool_interval,
    for_users: state.lb_for_users,
    dedup_window_seconds: state.lb_dedup_window,
    last_synced: state.lb_last_synced,
  },
});

const TIMEZONES = [
  "Asia/Kolkata",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function getDisplayName(username: string): string {
  const key = `tunelog_displayname_${username}`;
  return localStorage.getItem(key) || username;
}

function getAvatarUrl(username: string): string | null {
  return localStorage.getItem(`tunelog_avatar_${username}`);
}

function getUsersFromCache(): string[] {
  try {
    const raw = localStorage.getItem("tunelog_users_cache");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { username: string }[];
    return parsed.map((u) => u.username);
  } catch {
    return [];
  }
}

function SectionCard({
  title,
  desc,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  desc: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-gray-100 dark:bg-gray-800">
            {icon}
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
              {title}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
          </div>
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-gray-100 dark:border-gray-800">
          {children}
        </div>
      )}
    </div>
  );
}

function SubgroupSection({
  label,
  children,
  defaultOpen = false,
}: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-5 py-2 bg-gray-50 dark:bg-white/[0.02] border-b border-gray-100 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-white/[0.04] transition-colors group"
      >
        <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider group-hover:text-gray-500 dark:group-hover:text-gray-300 transition-colors">
          {label}
        </span>
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-gray-300 dark:text-gray-600 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

function ConfigRow({
  label,
  desc,
  children,
  fullWidth = false,
}: {
  label: string;
  desc: string;
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  if (fullWidth) {
    return (
      <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-800 last:border-b-0">
        <div className="mb-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {label}
          </p>
          <p className="text-xs text-gray-400 mt-0.5 leading-snug">{desc}</p>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 items-center gap-4 px-5 py-3.5 border-b border-gray-100 dark:border-gray-800 last:border-b-0">
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {label}
        </p>
        <p className="text-xs text-gray-400 mt-0.5 leading-snug">{desc}</p>
      </div>
      <div className="flex justify-end items-center">{children}</div>
    </div>
  );
}

function NumInput({
  value,
  onChange,
  min,
  max,
  step,
  unit,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-right text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      {unit && <span className="text-xs text-gray-400 w-8">{unit}</span>}
    </div>
  );
}

function RatioBar({
  values,
}: {
  values: { label: string; value: number; color: string }[];
}) {
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden gap-px bg-gray-100 dark:bg-gray-800 mt-3 mb-1">
      {values.map((v) => (
        <div
          key={v.label}
          style={{ width: `${Math.round(v.value * 100)}%` }}
          className={`${v.color} transition-all duration-300`}
        />
      ))}
    </div>
  );
}

function UserChips({
  allUsers,
  selected,
  onChange,
}: {
  allUsers: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (u: string) => {
    onChange(
      selected.includes(u) ? selected.filter((x) => x !== u) : [...selected, u],
    );
  };

  if (allUsers.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic">No users found in cache.</p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {allUsers.map((u) => {
        const active = selected.includes(u);
        const display = getDisplayName(u);
        const avatar = getAvatarUrl(u);
        return (
          <button
            key={u}
            onClick={() => toggle(u)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 ${
              active
                ? "bg-brand-500/10 border-brand-500/50 text-brand-600 dark:text-brand-400"
                : "bg-gray-100 dark:bg-gray-800 border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
            }`}
          >
            {avatar ? (
              <img
                src={avatar}
                alt={display}
                className="w-4 h-4 rounded-full object-cover"
              />
            ) : (
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                  active
                    ? "bg-brand-500 text-white"
                    : "bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-300"
                }`}
              >
                {display[0]?.toUpperCase()}
              </span>
            )}
            {display}
          </button>
        );
      })}
    </div>
  );
}

const IconPlaylist = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-gray-500 dark:text-gray-400"
  >
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);
const IconScoring = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-gray-500 dark:text-gray-400"
  >
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);
const IconSync = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-gray-500 dark:text-gray-400"
  >
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </svg>
);
const IconAPI = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-gray-500 dark:text-gray-400"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);
const IconJam = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-gray-500 dark:text-gray-400"
  >
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconListenBrainz = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-gray-500 dark:text-gray-400"
  >
    <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
  </svg>
);

export default function Config() {
  const [cfg, setCfg] = useState<Config>(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [allUsers, setAllUsers] = useState<string[]>([]);

  useEffect(() => {
    setAllUsers(getUsersFromCache());
    fetchGetConfig()
      .then((data) => setCfg(mapApiToState(data)))
      .catch((err) =>
        console.error("Failed to load config, falling back to defaults:", err),
      )
      .finally(() => setIsLoading(false));
  }, []);

  const set = <K extends keyof Config>(key: K, value: Config[K]) =>
    setCfg((prev) => ({ ...prev, [key]: value }));

  const handleNormalizedChange = (
    groupKeys: (keyof Config)[],
    changedKey: keyof Config,
    rawValue: number,
  ) => {
    const newValue = Math.max(0, Math.min(1, rawValue));
    setCfg((prev) => {
      const otherKeys = groupKeys.filter((k) => k !== changedKey);
      let remaining = Math.max(0, 1 - newValue);
      const currentOtherSum = otherKeys.reduce(
        (sum, k) => sum + (prev[k] as number),
        0,
      );
      const nextState = { ...prev, [changedKey]: newValue };
      if (currentOtherSum === 0) {
        otherKeys.forEach((k) => {
          (nextState[k] as number) = remaining / otherKeys.length;
        });
      } else {
        otherKeys.forEach((k) => {
          (nextState[k] as number) =
            ((prev[k] as number) / currentOtherSum) * remaining;
        });
      }
      groupKeys.forEach((k) => {
        (nextState[k] as number) =
          Math.round((nextState[k] as number) * 100) / 100;
      });
      const finalSum = groupKeys.reduce(
        (sum, k) => sum + (nextState[k] as number),
        0,
      );
      const diff = Math.round((1 - finalSum) * 100) / 100;
      if (diff !== 0) {
        const maxKey = otherKeys.reduce((a, b) =>
          (nextState[a] as number) > (nextState[b] as number) ? a : b,
        );
        (nextState[maxKey] as number) =
          Math.round(((nextState[maxKey] as number) + diff) * 100) / 100;
      }
      return nextState;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await fetchUpdateConfig(mapStateToApi(cfg));
      setSaved(true);
      console.log(cfg);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error("Failed to save config:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () =>
    setCfg((prev) => ({ ...DEFAULTS, lb_last_synced: prev.lb_last_synced }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading configuration...</p>
      </div>
    );
  }

  const slotColors = [
    "bg-blue-500",
    "bg-violet-500",
    "bg-amber-400",
    "bg-red-400",
  ];
  const injColors = ["bg-emerald-500", "bg-sky-500", "bg-orange-400"];

  return (
    <>
      <PageMeta
        title="Config | TuneLog"
        description="TuneLog backend configuration"
      />
      <PageBreadcrumb pageTitle="Config" />

      <div className="flex flex-col gap-5">
        <SectionCard
          title="Playlist generation"
          desc="Size, auto-generation rules, signal weights, and injection breakdown"
          icon={IconPlaylist}
        >
          <SubgroupSection label="General">
            <ConfigRow
              label="Playlist size"
              desc="Number of tracks to generate per session"
            >
              <NumInput
                value={cfg.playlist_size}
                onChange={(v) => set("playlist_size", v)}
                min={1}
                max={200}
                unit="songs"
              />
            </ConfigRow>
            <ConfigRow
              label="Wildcard day"
              desc="Days a song must be unplayed to enter the wildcard pool"
            >
              <NumInput
                value={cfg.wildcard_day}
                onChange={(v) => set("wildcard_day", v)}
                min={1}
                unit="days"
              />
            </ConfigRow>
          </SubgroupSection>

          <SubgroupSection label="Auto-generation">
            <ConfigRow
              label="Auto-generate playlist"
              desc="Automatically generate new playlists on a schedule"
            >
              <Switch
                label=""
                defaultChecked={cfg.auto_generate_playlist}
                onChange={(v) => set("auto_generate_playlist", v)}
              />
            </ConfigRow>
            <ConfigRow
              label="Generation time"
              desc="Hour of the day (24h) to trigger generation"
            >
              <NumInput
                value={cfg.auto_generate_time}
                onChange={(v) => set("auto_generate_time", v)}
                min={0}
                max={23}
                unit="h"
              />
            </ConfigRow>
            <ConfigRow
              label="Generate when complete"
              desc="Trigger generation early when current playlist finishes"
            >
              <Switch
                label=""
                defaultChecked={cfg.auto_generate_when_complete}
                onChange={(v) => set("auto_generate_when_complete", v)}
              />
            </ConfigRow>
            <ConfigRow
              label="Completion percentage"
              desc="Percentage played to be considered complete"
            >
              <NumInput
                value={cfg.auto_generate_completion_percent}
                onChange={(v) => set("auto_generate_completion_percent", v)}
                min={1}
                max={100}
                unit="%"
              />
            </ConfigRow>
            <ConfigRow
              label="Explicit content"
              desc="Filter rules for explicit tracks during generation"
            >
              <select
                value={cfg.auto_generate_explicit}
                onChange={(e) =>
                  set(
                    "auto_generate_explicit",
                    e.target.value as AutoGenerateExplicit,
                  )
                }
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="all">All</option>
                <option value="clean">Clean only</option>
                <option value="explicit">Explicit only</option>
              </select>
            </ConfigRow>
            <ConfigRow
              label="Target users"
              desc="Users to generate playlists for"
              fullWidth
            >
              <UserChips
                allUsers={allUsers}
                selected={cfg.auto_generate_for}
                onChange={(v) => set("auto_generate_for", v)}
              />
            </ConfigRow>
            <ConfigRow
              label="Enable injection"
              desc="Apply standard injection breakdown for auto-generation"
            >
              <Switch
                label=""
                defaultChecked={cfg.auto_generate_injection}
                onChange={(v) => set("auto_generate_injection", v)}
              />
            </ConfigRow>
          </SubgroupSection>

          <SubgroupSection label="Signal weights">
            <ConfigRow
              label="Repeat"
              desc="Points awarded when a song is played again shortly after"
            >
              <NumInput
                value={cfg.w_repeat}
                onChange={(v) => set("w_repeat", v)}
                min={-10}
                max={10}
                unit="pts"
              />
            </ConfigRow>
            <ConfigRow
              label="Positive"
              desc="Points for a full listen past the positive threshold"
            >
              <NumInput
                value={cfg.w_positive}
                onChange={(v) => set("w_positive", v)}
                min={-10}
                max={10}
                unit="pts"
              />
            </ConfigRow>
            <ConfigRow
              label="Partial"
              desc="Points for a listen that didn't reach positive or skip thresholds"
            >
              <NumInput
                value={cfg.w_partial}
                onChange={(v) => set("w_partial", v)}
                min={-10}
                max={10}
                unit="pts"
              />
            </ConfigRow>
            <ConfigRow
              label="Skip"
              desc="Points deducted when a song is skipped early"
            >
              <NumInput
                value={cfg.w_skip}
                onChange={(v) => set("w_skip", v)}
                min={-10}
                max={10}
                unit="pts"
              />
            </ConfigRow>
          </SubgroupSection>

          <SubgroupSection label="Slot ratios — auto-balances to 1.0">
            <div className="px-5 pt-1 pb-2 border-b border-gray-100 dark:border-gray-800">
              <RatioBar
                values={[
                  {
                    label: "positive",
                    value: cfg.s_positive,
                    color: slotColors[0],
                  },
                  {
                    label: "repeat",
                    value: cfg.s_repeat,
                    color: slotColors[1],
                  },
                  {
                    label: "partial",
                    value: cfg.s_partial,
                    color: slotColors[2],
                  },
                  { label: "skip", value: cfg.s_skip, color: slotColors[3] },
                ]}
              />
              <div className="flex gap-3 mt-1">
                {[
                  {
                    key: "s_positive" as keyof Config,
                    label: "Positive",
                    color: "text-blue-500",
                  },
                  {
                    key: "s_repeat" as keyof Config,
                    label: "Repeat",
                    color: "text-violet-500",
                  },
                  {
                    key: "s_partial" as keyof Config,
                    label: "Partial",
                    color: "text-amber-400",
                  },
                  {
                    key: "s_skip" as keyof Config,
                    label: "Skip",
                    color: "text-red-400",
                  },
                ].map((item) => (
                  <span key={item.key} className={`text-[11px] ${item.color}`}>
                    {item.label} {Math.round((cfg[item.key] as number) * 100)}%
                  </span>
                ))}
              </div>
            </div>
            <ConfigRow
              label="Positive slot"
              desc="Fraction of playlist reserved for positively scored songs"
            >
              <NumInput
                value={cfg.s_positive}
                onChange={(v) =>
                  handleNormalizedChange(
                    ["s_positive", "s_repeat", "s_partial", "s_skip"],
                    "s_positive",
                    v,
                  )
                }
                min={0}
                max={1}
                step={0.05}
              />
            </ConfigRow>
            <ConfigRow
              label="Repeat slot"
              desc="Fraction reserved for repeat-signal songs"
            >
              <NumInput
                value={cfg.s_repeat}
                onChange={(v) =>
                  handleNormalizedChange(
                    ["s_positive", "s_repeat", "s_partial", "s_skip"],
                    "s_repeat",
                    v,
                  )
                }
                min={0}
                max={1}
                step={0.05}
              />
            </ConfigRow>
            <ConfigRow
              label="Partial slot"
              desc="Fraction reserved for partially-listened songs"
            >
              <NumInput
                value={cfg.s_partial}
                onChange={(v) =>
                  handleNormalizedChange(
                    ["s_positive", "s_repeat", "s_partial", "s_skip"],
                    "s_partial",
                    v,
                  )
                }
                min={0}
                max={1}
                step={0.05}
              />
            </ConfigRow>
            <ConfigRow
              label="Skip slot"
              desc="Fraction reserved for skipped songs (exposure retry)"
            >
              <NumInput
                value={cfg.s_skip}
                onChange={(v) =>
                  handleNormalizedChange(
                    ["s_positive", "s_repeat", "s_partial", "s_skip"],
                    "s_skip",
                    v,
                  )
                }
                min={0}
                max={1}
                step={0.05}
              />
            </ConfigRow>
          </SubgroupSection>

          <SubgroupSection label="Injection breakdown — auto-balances to 1.0">
            <div className="px-5 pt-1 pb-2 border-b border-gray-100 dark:border-gray-800">
              <RatioBar
                values={[
                  {
                    label: "signal",
                    value: cfg.inj_signal,
                    color: injColors[0],
                  },
                  {
                    label: "unheard",
                    value: cfg.inj_unheard,
                    color: injColors[1],
                  },
                  {
                    label: "wildcard",
                    value: cfg.inj_wildcard,
                    color: injColors[2],
                  },
                ]}
              />
              <div className="flex gap-3 mt-1">
                {[
                  {
                    key: "inj_signal" as keyof Config,
                    label: "Signal",
                    color: "text-emerald-500",
                  },
                  {
                    key: "inj_unheard" as keyof Config,
                    label: "Unheard",
                    color: "text-sky-500",
                  },
                  {
                    key: "inj_wildcard" as keyof Config,
                    label: "Wildcard",
                    color: "text-orange-400",
                  },
                ].map((item) => (
                  <span key={item.key} className={`text-[11px] ${item.color}`}>
                    {item.label} {Math.round((cfg[item.key] as number) * 100)}%
                  </span>
                ))}
              </div>
            </div>
            <ConfigRow
              label="Signal fraction"
              desc="Portion of the playlist filled from scored signal slots"
            >
              <NumInput
                value={cfg.inj_signal}
                onChange={(v) =>
                  handleNormalizedChange(
                    ["inj_signal", "inj_unheard", "inj_wildcard"],
                    "inj_signal",
                    v,
                  )
                }
                min={0}
                max={1}
                step={0.01}
              />
            </ConfigRow>
            <ConfigRow
              label="Unheard fraction"
              desc="Portion filled with songs you have never listened to"
            >
              <NumInput
                value={cfg.inj_unheard}
                onChange={(v) =>
                  handleNormalizedChange(
                    ["inj_signal", "inj_unheard", "inj_wildcard"],
                    "inj_unheard",
                    v,
                  )
                }
                min={0}
                max={1}
                step={0.01}
              />
            </ConfigRow>
            <ConfigRow
              label="Wildcard fraction"
              desc="Portion filled from the long-unplayed wildcard pool"
            >
              <NumInput
                value={cfg.inj_wildcard}
                onChange={(v) =>
                  handleNormalizedChange(
                    ["inj_signal", "inj_unheard", "inj_wildcard"],
                    "inj_wildcard",
                    v,
                  )
                }
                min={0}
                max={1}
                step={0.01}
              />
            </ConfigRow>
          </SubgroupSection>
        </SectionCard>

        <SectionCard
          title="Behavioral scoring"
          desc="Thresholds and decay that determine how interactions become signals"
          icon={IconScoring}
        >
          <ConfigRow
            label="Long song duration"
            desc="Songs at or above this length use the merge-based listen tracking"
          >
            <NumInput
              value={cfg.long_song_duration}
              onChange={(v) => set("long_song_duration", v)}
              min={1}
              unit="sec"
            />
          </ConfigRow>
          <ConfigRow
            label="Skip threshold"
            desc="Max % listened before branding the play as a skip"
          >
            <NumInput
              value={cfg.skip_thresh}
              onChange={(v) => set("skip_thresh", v)}
              min={0}
              max={100}
              unit="%"
            />
          </ConfigRow>
          <ConfigRow
            label="Positive threshold"
            desc="Min % listened required to earn a positive signal"
          >
            <NumInput
              value={cfg.pos_thresh}
              onChange={(v) => set("pos_thresh", v)}
              min={0}
              max={100}
              unit="%"
            />
          </ConfigRow>
          <ConfigRow
            label="Repeat window"
            desc="Replaying within this window upgrades positive → repeat"
          >
            <NumInput
              value={cfg.repeat_window}
              onChange={(v) => set("repeat_window", v)}
              min={1}
              unit="min"
            />
          </ConfigRow>
          <ConfigRow
            label="Stale session timeout"
            desc="Seconds of SSE silence before assuming the user walked away"
          >
            <NumInput
              value={cfg.stale_timeout}
              onChange={(v) => set("stale_timeout", v)}
              min={1}
              unit="sec"
            />
          </ConfigRow>
          <ConfigRow
            label="Min listens for star"
            desc="Minimum interactions before pushing an official 1–5 star rating"
          >
            <NumInput
              value={cfg.min_listens}
              onChange={(v) => set("min_listens", v)}
              min={1}
              unit="plays"
            />
          </ConfigRow>
          <ConfigRow
            label="Historical decay factor"
            desc="Multiplier to devalue older listens vs recent ones (0–1)"
          >
            <NumInput
              value={cfg.decay}
              onChange={(v) => set("decay", v)}
              min={0}
              max={1}
              step={0.01}
            />
          </ConfigRow>
        </SectionCard>

        <SectionCard
          title="Sync and automation"
          desc="Background sync schedule and external API toggles"
          icon={IconSync}
        >
          <ConfigRow
            label="Auto-sync hour"
            desc="Hour of the day (24h format) for heavy background sync"
          >
            <NumInput
              value={cfg.sync_hour}
              onChange={(v) => set("sync_hour", v)}
              min={0}
              max={23}
              unit="h"
            />
          </ConfigRow>
          <ConfigRow
            label="Timezone"
            desc="Local timezone used for the cron job"
          >
            <select
              value={cfg.timezone}
              onChange={(e) => set("timezone", e.target.value)}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </ConfigRow>
          <ConfigRow
            label="iTunes fallback"
            desc="Master switch for external iTunes API metadata fetching"
          >
            <Switch
              label=""
              defaultChecked={cfg.itunes_fallback}
              onChange={(v) => set("itunes_fallback", v)}
            />
          </ConfigRow>
          <ConfigRow
            label="Auto sync after Navidrome scan"
            desc="Automatically trigger TuneLog sync after Navidrome finishes scanning"
          >
            <Switch
              label=""
              defaultChecked={cfg.auto_sync_after_navidrome}
              onChange={(v) => set("auto_sync_after_navidrome", v)}
            />
          </ConfigRow>
        </SectionCard>

        <SectionCard
          title="API and performance"
          desc="Retry limits, search depth, and fuzzy match confidence thresholds"
          icon={IconAPI}
        >
          <SubgroupSection label="General">
            <ConfigRow
              label="Max fuzzy iterations"
              desc="Max title comparisons per song before giving up"
            >
              <NumInput
                value={cfg.fuzzy_iter}
                onChange={(v) => set("fuzzy_iter", v)}
                min={1}
              />
            </ConfigRow>
            <ConfigRow
              label="API max retries"
              desc="Retries for 4xx/5xx API errors before failing"
            >
              <NumInput
                value={cfg.api_retries}
                onChange={(v) => set("api_retries", v)}
                min={0}
                max={20}
                unit="tries"
              />
            </ConfigRow>
            <ConfigRow
              label="API retry delay"
              desc="Wait time between failed API calls"
            >
              <NumInput
                value={cfg.retry_delay}
                onChange={(v) => set("retry_delay", v)}
                min={0}
                unit="sec"
              />
            </ConfigRow>
            <ConfigRow
              label="iTunes search depth"
              desc="Number of results to pull during broad iTunes searches"
            >
              <NumInput
                value={cfg.itunes_depth}
                onChange={(v) => set("itunes_depth", v)}
                min={1}
              />
            </ConfigRow>
          </SubgroupSection>

          <SubgroupSection label="Sync confidence">
            <ConfigRow
              label="Min match score"
              desc="Baseline fuzzy score required to accept an API match"
            >
              <NumInput
                value={cfg.min_match}
                onChange={(v) => set("min_match", v)}
                min={0}
                max={100}
              />
            </ConfigRow>
            <ConfigRow
              label="Metadata overwrite score"
              desc="Score required to overwrite local Navidrome tags"
            >
              <NumInput
                value={cfg.meta_overwrite}
                onChange={(v) => set("meta_overwrite", v)}
                min={0}
                max={100}
              />
            </ConfigRow>
            <ConfigRow
              label="Genre map strictness"
              desc="How strictly local genres must match the normalisation map"
            >
              <NumInput
                value={cfg.genre_strictness}
                onChange={(v) => set("genre_strictness", v)}
                min={0}
                max={100}
              />
            </ConfigRow>
            <ConfigRow
              label="Duration tolerance"
              desc="Allowed variance in track length for tie-breakers"
            >
              <NumInput
                value={cfg.duration_tol}
                onChange={(v) => set("duration_tol", v)}
                min={0}
                max={100}
                unit="%"
              />
            </ConfigRow>
          </SubgroupSection>
        </SectionCard>

        <SectionCard
          title="Jam"
          desc="Shared listening session permissions and queue behaviour"
          icon={IconJam}
        >
          <ConfigRow
            label="Allow same song in queue"
            desc="Let multiple users queue the same track before it has played"
          >
            <Switch
              label=""
              defaultChecked={cfg.jam_same_song_in_queue}
              onChange={(v) => set("jam_same_song_in_queue", v)}
            />
          </ConfigRow>
          <ConfigRow
            label="Only host can change queue order"
            desc="Prevent guests from reordering the queue"
          >
            <Switch
              label=""
              defaultChecked={cfg.jam_only_host_change_queue}
              onChange={(v) => set("jam_only_host_change_queue", v)}
            />
          </ConfigRow>
          <ConfigRow
            label="Only host can clear queue"
            desc="Prevent guests from wiping the entire queue"
          >
            <Switch
              label=""
              defaultChecked={cfg.jam_only_host_clear_queue}
              onChange={(v) => set("jam_only_host_clear_queue", v)}
            />
          </ConfigRow>
          <ConfigRow
            label="Only host can add to queue"
            desc="Restrict queue additions to the session host only"
          >
            <Switch
              label=""
              defaultChecked={cfg.jam_only_host_add_queue}
              onChange={(v) => set("jam_only_host_add_queue", v)}
            />
          </ConfigRow>
        </SectionCard>

        <SectionCard
          title="ListenBrainz"
          desc="Import scrobble history from ListenBrainz as scored signals"
          icon={IconListenBrainz}
        >
          <ConfigRow
            label="Enable ListenBrainz"
            desc="Master toggle — pull and process listens from ListenBrainz"
          >
            <Switch
              label=""
              defaultChecked={cfg.lb_enabled}
              onChange={(v) => set("lb_enabled", v)}
            />
          </ConfigRow>
          <ConfigRow
            label="ListenBrainz username"
            desc="Public ListenBrainz account to fetch listens from"
          >
            <input
              type="text"
              value={cfg.lb_username}
              onChange={(e) => set("lb_username", e.target.value)}
              placeholder="e.g. adiiverma40"
              className="w-48 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </ConfigRow>
          <ConfigRow
            label="Treat data as"
            desc="Signal type to assign to imported ListenBrainz listens"
          >
            <select
              value={cfg.lb_treat_data_as}
              onChange={(e) =>
                set("lb_treat_data_as", e.target.value as TreatDataAs)
              }
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="partial">Partial</option>
              <option value="complete">Complete</option>
              <option value="skip">Skip</option>
            </select>
          </ConfigRow>
          <ConfigRow
            label="Poll interval"
            desc="How often to fetch new listens from ListenBrainz"
          >
            <NumInput
              value={cfg.lb_pool_interval}
              onChange={(v) => set("lb_pool_interval", v)}
              min={1}
              unit="hr"
            />
          </ConfigRow>
          <ConfigRow
            label="Target users"
            desc="TuneLog users whose scoring gets updated with LB data"
            fullWidth
          >
            <UserChips
              allUsers={allUsers}
              selected={cfg.lb_for_users}
              onChange={(v) => set("lb_for_users", v)}
            />
          </ConfigRow>
          <ConfigRow
            label="Dedup window"
            desc="Ignore duplicate scrobbles arriving within this window"
          >
            <NumInput
              value={cfg.lb_dedup_window}
              onChange={(v) => set("lb_dedup_window", v)}
              min={0}
              unit="min"
            />
          </ConfigRow>
        </SectionCard>

        <div className="flex items-center justify-between rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] px-5 py-4">
          <span
            className={`text-xs text-green-500 transition-opacity duration-300 ${saved ? "opacity-100" : "opacity-0"}`}
          >
            Config saved successfully!
          </span>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleReset}
              size="sm"
              variant="outline"
              disabled={isSaving}
            >
              Reset to defaults
            </Button>
            <Button onClick={handleSave} size="sm" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save config"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
