

import { useState, useEffect } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import Switch from "../components/form/switch/Switch";
import Button from "../components/ui/button/Button";

import { 
  fetchGetConfig, 
  fetchUpdateConfig, 
  TuneConfig 
} from "../API/API"; 

interface Config {
  playlist_size: number;
  wildcard_day: number;
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
  fuzzy_iter: number;
  api_retries: number;
  retry_delay: number;
  itunes_depth: number;
  min_match: number;
  meta_overwrite: number;
  genre_strictness: number;
  duration_tol: number;
}

const DEFAULTS: Config = {
  playlist_size: 40,
  wildcard_day: 60,
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
  fuzzy_iter: 500,
  api_retries: 3,
  retry_delay: 3,
  itunes_depth: 200,
  min_match: 70,
  meta_overwrite: 80,
  genre_strictness: 95,
  duration_tol: 10,
};

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

const mapApiToState = (api: TuneConfig): Config => ({
  playlist_size: api.playlist_generation.playlist_size,
  wildcard_day: api.playlist_generation.wildcard_day,
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
  
  fuzzy_iter: api.api_and_performance.max_fuzzy_iterations,
  api_retries: api.api_and_performance.api_max_retries,
  retry_delay: api.api_and_performance.api_retry_delay_sec,
  itunes_depth: api.api_and_performance.itunes_search_depth,
  min_match: api.api_and_performance.sync_confidence.min_match_score,
  meta_overwrite: api.api_and_performance.sync_confidence.metadata_overwrite_score,
  genre_strictness: api.api_and_performance.sync_confidence.genre_map_strictness,
  duration_tol: api.api_and_performance.sync_confidence.duration_tolerance_pct,
});

const mapStateToApi = (state: Config): TuneConfig => ({
  playlist_generation: {
    playlist_size: state.playlist_size,
    wildcard_day: state.wildcard_day,
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
});

function SectionHeader({ title, desc, icon }: { title: string; desc: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-gray-100 dark:bg-gray-800">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{title}</p>
        <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

function SubgroupLabel({ label }: { label: string }) {
  return (
    <div className="px-5 py-2 bg-gray-50 dark:bg-white/[0.02] border-b border-gray-100 dark:border-gray-800">
      <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">{label}</span>
    </div>
  );
}

function ConfigRow({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 items-center gap-4 px-5 py-3.5 border-b border-gray-100 dark:border-gray-800 last:border-b-0">
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5 leading-snug">{desc}</p>
      </div>
      <div className="flex justify-end items-center">{children}</div>
    </div>
  );
}

function NumInput({ value, onChange, min, max, step, unit }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string; }) {
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

export default function Config() {
  const [cfg, setCfg] = useState<Config>(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchGetConfig()
      .then((data) => {
        setCfg(mapApiToState(data));
      })
      .catch((err) => {
        console.error("Failed to load config, falling back to defaults:", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const set = <K extends keyof Config>(key: K, value: Config[K]) =>
    setCfg((prev) => ({ ...prev, [key]: value }));

  const handleNormalizedChange = (
    groupKeys: (keyof Config)[],
    changedKey: keyof Config,
    rawValue: number
  ) => {
    const newValue = Math.max(0, Math.min(1, rawValue));

    setCfg((prev) => {
      const otherKeys = groupKeys.filter((k) => k !== changedKey);
      let remaining = Math.max(0, 1 - newValue);

      const currentOtherSum = otherKeys.reduce((sum, k) => sum + (prev[k] as number), 0);
      
      const nextState = { ...prev, [changedKey]: newValue };

      if (currentOtherSum === 0) {
        otherKeys.forEach((k) => {
          (nextState[k] as number) = remaining / otherKeys.length;
        });
      } else {
        otherKeys.forEach((k) => {
          (nextState[k] as number) = ((prev[k] as number) / currentOtherSum) * remaining;
        });
      }

      groupKeys.forEach((k) => {
        (nextState[k] as number) = Math.round((nextState[k] as number) * 100) / 100;
      });

      const finalSum = groupKeys.reduce((sum, k) => sum + (nextState[k] as number), 0);
      const diff = Math.round((1 - finalSum) * 100) / 100;

      if (diff !== 0) {
        const maxKey = otherKeys.reduce((a, b) => ((nextState[a] as number) > (nextState[b] as number) ? a : b));
        (nextState[maxKey] as number) = Math.round(((nextState[maxKey] as number) + diff) * 100) / 100;
      }

      return nextState;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = mapStateToApi(cfg);
      await fetchUpdateConfig(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error("Failed to save config:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => setCfg(DEFAULTS);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading configuration...</p>
      </div>
    );
  }

  return (
    <>
      <PageMeta title="Config | TuneLog" description="TuneLog backend configuration" />
      <PageBreadcrumb pageTitle="Config" />

      <div className="flex flex-col gap-5">

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
          <SectionHeader
            title="Playlist generation"
            desc="Size, slot ratios, signal weights, and injection breakdown"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 dark:text-gray-400">
                <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
              </svg>
            }
          />

          <SubgroupLabel label="General" />
          <ConfigRow label="Playlist size" desc="Number of tracks to generate per session">
            <NumInput value={cfg.playlist_size} onChange={(v) => set("playlist_size", v)} min={1} max={200} unit="songs" />
          </ConfigRow>
          <ConfigRow label="Wildcard day" desc="Days a song must be unplayed to enter the wildcard pool">
            <NumInput value={cfg.wildcard_day} onChange={(v) => set("wildcard_day", v)} min={1} unit="days" />
          </ConfigRow>

          <SubgroupLabel label="Signal weights" />
          <ConfigRow label="Repeat" desc="Points awarded when a song is played again shortly after">
            <NumInput value={cfg.w_repeat} onChange={(v) => set("w_repeat", v)} min={-10} max={10} unit="pts" />
          </ConfigRow>
          <ConfigRow label="Positive" desc="Points awarded for a full listen past the positive threshold">
            <NumInput value={cfg.w_positive} onChange={(v) => set("w_positive", v)} min={-10} max={10} unit="pts" />
          </ConfigRow>
          <ConfigRow label="Partial" desc="Points for a listen that didn't reach positive or skip thresholds">
            <NumInput value={cfg.w_partial} onChange={(v) => set("w_partial", v)} min={-10} max={10} unit="pts" />
          </ConfigRow>
          <ConfigRow label="Skip" desc="Points deducted when a song is skipped early">
            <NumInput value={cfg.w_skip} onChange={(v) => set("w_skip", v)} min={-10} max={10} unit="pts" />
          </ConfigRow>

          <SubgroupLabel label="Slot ratios (Auto-balances to 1.0)" />
          <ConfigRow label="Positive slot" desc="Fraction of playlist reserved for positively scored songs">
            <NumInput value={cfg.s_positive} onChange={(v) => handleNormalizedChange(["s_positive", "s_repeat", "s_partial", "s_skip"], "s_positive", v)} min={0} max={1} step={0.05} />
          </ConfigRow>
          <ConfigRow label="Repeat slot" desc="Fraction reserved for repeat-signal songs">
            <NumInput value={cfg.s_repeat} onChange={(v) => handleNormalizedChange(["s_positive", "s_repeat", "s_partial", "s_skip"], "s_repeat", v)} min={0} max={1} step={0.05} />
          </ConfigRow>
          <ConfigRow label="Partial slot" desc="Fraction reserved for partially-listened songs">
            <NumInput value={cfg.s_partial} onChange={(v) => handleNormalizedChange(["s_positive", "s_repeat", "s_partial", "s_skip"], "s_partial", v)} min={0} max={1} step={0.05} />
          </ConfigRow>
          <ConfigRow label="Skip slot" desc="Fraction reserved for skipped songs (exposure retry)">
            <NumInput value={cfg.s_skip} onChange={(v) => handleNormalizedChange(["s_positive", "s_repeat", "s_partial", "s_skip"], "s_skip", v)} min={0} max={1} step={0.05} />
          </ConfigRow>

          <SubgroupLabel label="Injection breakdown (Auto-balances to 1.0)" />
          <ConfigRow label="Signal fraction" desc="Portion of the playlist filled from scored signal slots">
            <NumInput value={cfg.inj_signal} onChange={(v) => handleNormalizedChange(["inj_signal", "inj_unheard", "inj_wildcard"], "inj_signal", v)} min={0} max={1} step={0.01} />
          </ConfigRow>
          <ConfigRow label="Unheard fraction" desc="Portion filled with songs you have never listened to">
            <NumInput value={cfg.inj_unheard} onChange={(v) => handleNormalizedChange(["inj_signal", "inj_unheard", "inj_wildcard"], "inj_unheard", v)} min={0} max={1} step={0.01} />
          </ConfigRow>
          <ConfigRow label="Wildcard fraction" desc="Portion filled from the long-unplayed wildcard pool">
            <NumInput value={cfg.inj_wildcard} onChange={(v) => handleNormalizedChange(["inj_signal", "inj_unheard", "inj_wildcard"], "inj_wildcard", v)} min={0} max={1} step={0.01} />
          </ConfigRow>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
          <SectionHeader
            title="Behavioral scoring"
            desc="Thresholds and decay that determine how interactions become signals"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 dark:text-gray-400">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            }
          />
          <ConfigRow label="Skip threshold" desc="Max % listened before branding the play as a skip">
            <NumInput value={cfg.skip_thresh} onChange={(v) => set("skip_thresh", v)} min={0} max={100} unit="%" />
          </ConfigRow>
          <ConfigRow label="Positive threshold" desc="Min % listened required to earn a positive signal">
            <NumInput value={cfg.pos_thresh} onChange={(v) => set("pos_thresh", v)} min={0} max={100} unit="%" />
          </ConfigRow>
          <ConfigRow label="Repeat window" desc="Replaying within this window upgrades positive to repeat">
            <NumInput value={cfg.repeat_window} onChange={(v) => set("repeat_window", v)} min={1} unit="min" />
          </ConfigRow>
          <ConfigRow label="Stale session timeout" desc="Seconds of SSE silence before assuming the user walked away">
            <NumInput value={cfg.stale_timeout} onChange={(v) => set("stale_timeout", v)} min={1} unit="sec" />
          </ConfigRow>
          <ConfigRow label="Min listens for star" desc="Minimum interactions before pushing an official 1–5 star rating">
            <NumInput value={cfg.min_listens} onChange={(v) => set("min_listens", v)} min={1} unit="plays" />
          </ConfigRow>
          <ConfigRow label="Historical decay factor" desc="Multiplier to devalue older listens vs recent ones (0–1)">
            <NumInput value={cfg.decay} onChange={(v) => set("decay", v)} min={0} max={1} step={0.01} />
          </ConfigRow>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
          <SectionHeader
            title="Sync and automation"
            desc="Background sync schedule and external API toggle"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 dark:text-gray-400">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
              </svg>
            }
          />
          <ConfigRow label="Auto-sync hour" desc="Hour of the day (24h format) for heavy background sync">
            <NumInput value={cfg.sync_hour} onChange={(v) => set("sync_hour", v)} min={0} max={23} unit="h" />
          </ConfigRow>
          <ConfigRow label="Timezone" desc="Local timezone used for the cron job">
            <select
              value={cfg.timezone}
              onChange={(e) => set("timezone", e.target.value)}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </ConfigRow>
          <ConfigRow label="iTunes fallback" desc="Master switch for external iTunes API metadata fetching">
            <Switch
              label=""
              defaultChecked={cfg.itunes_fallback}
              onChange={(v) => set("itunes_fallback", v)}
            />
          </ConfigRow>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
          <SectionHeader
            title="API and performance"
            desc="Retry limits, search depth, and fuzzy match confidence thresholds"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 dark:text-gray-400">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            }
          />

          <SubgroupLabel label="General" />
          <ConfigRow label="Max fuzzy iterations" desc="Max title comparisons per song before giving up">
            <NumInput value={cfg.fuzzy_iter} onChange={(v) => set("fuzzy_iter", v)} min={1} />
          </ConfigRow>
          <ConfigRow label="API max retries" desc="Retries for 4xx/5xx API errors before failing">
            <NumInput value={cfg.api_retries} onChange={(v) => set("api_retries", v)} min={0} max={20} unit="tries" />
          </ConfigRow>
          <ConfigRow label="API retry delay" desc="Wait time between failed API calls">
            <NumInput value={cfg.retry_delay} onChange={(v) => set("retry_delay", v)} min={0} unit="sec" />
          </ConfigRow>
          <ConfigRow label="iTunes search depth" desc="Number of results to pull during broad iTunes searches">
            <NumInput value={cfg.itunes_depth} onChange={(v) => set("itunes_depth", v)} min={1} />
          </ConfigRow>

          <SubgroupLabel label="Sync confidence" />
          <ConfigRow label="Min match score" desc="Baseline fuzzy score required to accept an API match">
            <NumInput value={cfg.min_match} onChange={(v) => set("min_match", v)} min={0} max={100} />
          </ConfigRow>
          <ConfigRow label="Metadata overwrite score" desc="Score required to overwrite local Navidrome tags">
            <NumInput value={cfg.meta_overwrite} onChange={(v) => set("meta_overwrite", v)} min={0} max={100} />
          </ConfigRow>
          <ConfigRow label="Genre map strictness" desc="How strictly local genres must match the normalisation map">
            <NumInput value={cfg.genre_strictness} onChange={(v) => set("genre_strictness", v)} min={0} max={100} />
          </ConfigRow>
          <ConfigRow label="Duration tolerance" desc="Allowed variance in track length for tie-breakers">
            <NumInput value={cfg.duration_tol} onChange={(v) => set("duration_tol", v)} min={0} max={100} unit="%" />
          </ConfigRow>
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] px-5 py-4">
          <span
            className={`text-xs text-red-500 transition-opacity duration-300 ${!saved && isSaving ? "opacity-100" : "opacity-0"}`}
          ></span>
          <span
            className={`text-xs text-green-500 transition-opacity duration-300 ${saved ? "opacity-100" : "opacity-0"}`}
          >
            Config saved successfully!
          </span>
          <div className="flex items-center gap-3">
            <Button onClick={handleReset} size="sm" variant="outline" disabled={isSaving}>
              Reset to defaults
            </Button>
            <Button onClick={handleSave} size="sm" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save config"}
            </Button>
          </div>
        </div>

      </div>
    </>
  );
}