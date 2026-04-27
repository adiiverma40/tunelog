import { useState, useEffect, useRef } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import Switch from "../components/form/switch/Switch";
import { useNavigate } from "react-router";
import {
  fetchSyncStatus,
  fetchSyncStart,
  fetchSyncSettings,
  fetchSyncStop,
  startFallbackSync,
  fetchFallbackSyncStatus,
  stopFallbackSync,
  SyncStatus,
} from "../API/API";

const SYNC_HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 === 0 ? 12 : i % 12;
  const ampm = i < 12 ? "AM" : "PM";
  return { value: i, label: `${h}:00 ${ampm}` };
});

const TIMEZONES = [
  { value: "Asia/Kolkata", label: "India (IST, UTC+5:30)" },
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "New York (EST/EDT)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PST/PDT)" },
  { value: "America/Chicago", label: "Chicago (CST/CDT)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Paris (CET/CEST)" },
  { value: "Europe/Berlin", label: "Berlin (CET/CEST)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST, UTC+9)" },
  { value: "Asia/Shanghai", label: "Shanghai (CST, UTC+8)" },
  { value: "Asia/Dubai", label: "Dubai (GST, UTC+4)" },
  { value: "Australia/Sydney", label: "Sydney (AEST/AEDT)" },
  { value: "Pacific/Auckland", label: "Auckland (NZST/NZDT)" },
];

const EXPLICIT_CONFIG = [
  {
    key: "clean",
    label: "Clean",
    color: "#639922",
    lightBg: "#EAF3DE",
    darkBg: "rgba(99,153,34,0.15)",
    lightText: "#3B6D11",
    darkText: "#97C459",
  },
  {
    key: "explicit",
    label: "Explicit",
    color: "#E24B4A",
    lightBg: "#FCEBEB",
    darkBg: "rgba(226,75,74,0.15)",
    lightText: "#A32D2D",
    darkText: "#F09595",
  },
  {
    key: "unmatched",
    label: "Unmatched",
    color: "#888780",
    lightBg: "#F1EFE8",
    darkBg: "rgba(136,135,128,0.15)",
    lightText: "#5F5E5A",
    darkText: "#B4B2A9",
  },
  {
    key: "manual",
    label: "Manual",
    color: "#D4537E",
    lightBg: "#FBEAF0",
    darkBg: "rgba(212,83,126,0.15)",
    lightText: "#993556",
    darkText: "#ED93B1",
  },
];

function useDarkMode() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains("dark")),
    );
    obs.observe(document.documentElement, { attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < breakpoint;
  });

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);

  return isMobile;
}

function BarRow({
  label,
  value,
  max,
  color,
  textSecondary,
  textMuted,
  trackBg,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  textSecondary: string;
  textMuted: string;
  trackBg: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span
        style={{
          width: 80,
          fontSize: 12,
          color: textSecondary,
          flexShrink: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 5,
          borderRadius: 3,
          background: trackBg,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 3,
            backgroundColor: color,
            transition: "width 0.5s ease",
          }}
        />
      </div>
      <span
        style={{
          width: 36,
          fontSize: 11,
          color: textMuted,
          textAlign: "right",
          flexShrink: 0,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value.toLocaleString()}
      </span>
    </div>
  );
}

export default function LibrarySync() {
  const [syncData, setSyncData] = useState<SyncStatus | null>(null);
  const [useItunes, setUseItunes] = useState(false);
  const [autoSyncHour, setAutoSyncHour] = useState<number>(2);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [waitingForSync, setWaitingForSync] = useState(false);

  const [maxRetries, setMaxRetries] = useState(500);
  const [fallbackRunning, setFallbackRunning] = useState(false);
  const [fallbackWaiting, setFallbackWaiting] = useState(false);
  const [fallbackProcessed, setFallbackProcessed] = useState(0);
  const [fallbackTotal, setFallbackTotal] = useState(0);
  const [fallbackProgress, setFallbackProgress] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncStartedRef = useRef(false);
  const fallbackStartedRef = useRef(false);

  const dark = useDarkMode();
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const card = dark ? "#131316" : "#ffffff";
  const cardBorder = dark ? "#222228" : "#e8e8e4";
  const insetBg = dark ? "#0f0f12" : "#f9f9f6";
  const inputBg = dark ? "#1a1a1f" : "#f3f3f0";
  const inputBorder = dark ? "#2a2a30" : "#ddddd8";
  const trackBg = dark ? "#1e1e24" : "#e8e8e4";
  const textPrimary = dark ? "#f0f0ee" : "#18181a";
  const textSecondary = dark ? "#888884" : "#6b6b67";
  const textMuted = dark ? "#555552" : "#a0a09c";

  useEffect(() => {
    const token =
      localStorage.getItem("tunelog_token") ||
      sessionStorage.getItem("tunelog_token");
    if (!token) {
      navigate("/signin");
      return;
    }
  }, []);

  useEffect(() => {
    fetchSyncStatus().then((data) => {
      setSyncData(data);
      setAutoSyncHour(Math.min(Math.max(data.auto_sync ?? 2, 0), 23));
      setUseItunes(data.use_itunes);
      if (data.timezone) setTimezone(data.timezone);
      if (data.is_syncing) {
        syncStartedRef.current = true;
        startPolling();
      }
    });

    fetchFallbackSyncStatus().then((data) => {
      if (data.is_running) {
        setFallbackRunning(true);
        setFallbackProcessed(data.processed);
        setFallbackTotal(data.total);
        setFallbackProgress(data.progress);
        fallbackStartedRef.current = true;
        startFallbackPolling();
      }
    });

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (fallbackPollRef.current) clearInterval(fallbackPollRef.current);
    };
  }, []);

  const startPolling = () => {
    pollRef.current = setInterval(() => {
      fetchSyncStatus().then((data) => {
        setSyncData(data);
        if (data.is_syncing) {
          syncStartedRef.current = true;
          setWaitingForSync(false);
        }
        if (syncStartedRef.current && !data.is_syncing) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          syncStartedRef.current = false;
          setWaitingForSync(false);
        }
        if (!data.is_syncing && data.progress >= 100) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          syncStartedRef.current = false;
          setWaitingForSync(false);
        }
      });
    }, 2000);
  };

  const startFallbackPolling = () => {
    fallbackPollRef.current = setInterval(() => {
      fetchFallbackSyncStatus().then((data) => {
        setFallbackProcessed(data.processed);
        setFallbackTotal(data.total);
        setFallbackProgress(data.progress);
        if (data.is_running) {
          fallbackStartedRef.current = true;
          setFallbackWaiting(false);
          setFallbackRunning(true);
        }
        if (fallbackStartedRef.current && !data.is_running) {
          clearInterval(fallbackPollRef.current!);
          fallbackPollRef.current = null;
          fallbackStartedRef.current = false;
          setFallbackRunning(false);
          setFallbackWaiting(false);
        }
      });
    }, 2000);
  };

  const handleFastSync = () => {
    fetchSyncStart(false).then(() => {
      setSyncData((prev) =>
        prev ? { ...prev, is_syncing: false, progress: 0 } : prev,
      );
      syncStartedRef.current = false;
      setWaitingForSync(true);
      startPolling();
    });
  };

  const handleSlowSync = () => {
    fetchSyncStart(true).then(() => {
      setSyncData((prev) =>
        prev ? { ...prev, is_syncing: false, progress: 0 } : prev,
      );
      syncStartedRef.current = false;
      setWaitingForSync(true);
      startPolling();
    });
  };

  const handleSaveSettings = () => {
    fetchSyncSettings(autoSyncHour, useItunes, timezone).then(() => {
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    });
  };

  const handleFallbackSync = () => {
    startFallbackSync(maxRetries).then((res) => {
      if (res.status === "ok") {
        setFallbackTotal(res.total ?? maxRetries);
        setFallbackProcessed(0);
        setFallbackProgress(0);
        setFallbackWaiting(true);
        fallbackStartedRef.current = false;
        startFallbackPolling();
      }
    });
  };

  const progress = syncData?.progress ?? 0;
  const isSyncing = syncData?.is_syncing ?? false;
  const notInItunes = syncData?.explicit_counts?.notInItunes ?? 0;

  const explicitCount =
    (syncData?.explicit_counts?.explicit ?? 0) +
    (syncData?.explicit_counts?.cleaned ?? 0);

  const explicitValues: Record<string, number> = {
    clean: syncData?.explicit_counts?.notExplicit ?? 0,
    explicit: explicitCount,
    unmatched: notInItunes,
    manual: syncData?.explicit_counts?.manual ?? 0,
  };

  const totalExplicit = Object.values(explicitValues).reduce(
    (a, b) => a + b,
    0,
  );

  const formatLastSync = (raw: string | null) => {
    if (!raw) return "Never";
    const date = new Date(raw.replace(" ", "T") + "Z");
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const calcExpectedTime = () => {
    if (!syncData) return "—";
    const itunesActive = syncData.use_itunes || useItunes;
    if (itunesActive) {
      const totalNeeding =
        syncData.songs_needing_itunes ?? syncData.total_songs;
      const remaining = Math.ceil(totalNeeding * (1 - syncData.progress / 100));
      const minutes = Math.ceil(remaining / 60);
      if (isSyncing)
        return remaining <= 0 ? "Almost done" : `~${minutes} min remaining`;
      const totalMinutes = Math.ceil(totalNeeding / 60);
      return totalMinutes < 1 ? "< 1 min" : `~${totalMinutes} min`;
    }
    return "~2 min";
  };

  const syncStatusText = () => {
    if (waitingForSync) return "Waiting for sync to start…";
    if (isSyncing) {
      const syncType = syncData?.use_itunes ? "Slow sync" : "Fast sync";
      const songCount = Math.round(
        (progress / 100) * (syncData?.total_songs || 0),
      );
      return `${syncType} in progress · ${progress}% · ${songCount.toLocaleString()} songs`;
    }
    if (progress === 100) return "Sync complete";
    return "Ready to sync";
  };

  const fallbackStatusText = () => {
    if (fallbackWaiting) return "Waiting for fallback sync to start…";
    if (fallbackRunning)
      return `Fallback sync · ${fallbackProgress}% · ${fallbackProcessed.toLocaleString()} / ${fallbackTotal.toLocaleString()} songs`;
    if (fallbackProgress >= 100) return "Fallback sync complete";
    return "";
  };
  const sectionStyle: React.CSSProperties = {
    background: card,
    border: `1px solid ${cardBorder}`,
    borderRadius: 14,
    overflow: "hidden",
  };

  const sectionHeadStyle: React.CSSProperties = {
    padding: isMobile ? "14px 14px 12px" : "18px 20px 16px",
    borderBottom: `1px solid ${cardBorder}`,
    display: "flex",
    flexDirection: isMobile ? "column" : "row",
    alignItems: isMobile ? "stretch" : "flex-start",
    justifyContent: "space-between",
    gap: 12,
  };

  const sectionBodyStyle: React.CSSProperties = {
    padding: isMobile ? "14px" : "20px",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: textMuted,
    display: "block",
    marginBottom: 6,
  };

  const selectStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: `1px solid ${inputBorder}`,
    background: inputBg,
    color: textPrimary,
    fontSize: 13,
    outline: "none",
    marginTop: 6,
  };

  const syncBtnBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: isMobile ? "12px 14px" : "12px 16px",
    borderRadius: 10,
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
    transition: "opacity 0.15s",
    flexWrap: isMobile ? "wrap" : "nowrap",
  };

  const syncBtnIcon: React.CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 15,
    flexShrink: 0,
  };
  return (
    <>
      <PageMeta
        title="Library Sync | TuneLog"
        description="Sync your Navidrome library to TuneLog database"
      />
      <PageBreadcrumb pageTitle="Library Sync" />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: isMobile ? 14 : 20,
        }}
      >
        <div style={{ ...sectionStyle }}>
          <div
            style={{
              height: 3,
              background: "linear-gradient(90deg, #7F77DD, #5DCAA5, #639922)",
            }}
          />
          <div
            style={{
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              alignItems: isMobile ? "stretch" : "center",
              gap: isMobile ? 14 : 20,
              padding: isMobile ? "14px" : "18px 20px",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: "linear-gradient(135deg, #7F77DD, #534AB7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width={24}
                height={24}
                fill="none"
                viewBox="0 0 24 24"
                stroke="#ffffff"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 4v16M4 12h16M20 4v16" />
                <circle cx="12" cy="12" r="2" fill="#ffffff" stroke="none" />
              </svg>
            </div>

            <div
              style={{
                flex: 1,
                minWidth: 0,
                width: isMobile ? "100%" : "auto",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  marginBottom: 3,
                }}
              >
                <span
                  style={{
                    fontSize: isMobile ? 18 : 20,
                    fontWeight: 700,
                    color: textPrimary,
                    letterSpacing: "-0.01em",
                  }}
                >
                  Library Sync
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    padding: "2px 7px",
                    borderRadius: 6,
                    background: "rgba(127,119,221,0.12)",
                    color: "#7F77DD",
                  }}
                >
                  Auto-sync on
                </span>
              </div>
              <span style={{ fontSize: 12, color: textSecondary }}>
                Last synced · {formatLastSync(syncData?.last_sync ?? null)}
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "repeat(2, minmax(0, 1fr))"
                  : "repeat(4, minmax(0, 1fr))",
                alignItems: "stretch",
                borderRadius: 12,
                overflow: "hidden",
                border: `1px solid ${cardBorder}`,
                flexShrink: 0,
                width: isMobile ? "100%" : "auto",
              }}
            >
              {[
                {
                  label: "Clean",
                  value: explicitValues.clean,
                  color: "#639922",
                },
                {
                  label: "Explicit",
                  value: explicitValues.explicit,
                  color: "#E24B4A",
                },
                {
                  label: "Unmatched",
                  value: explicitValues.unmatched,
                  color: "#888780",
                },
                {
                  label: "Manual",
                  value: explicitValues.manual,
                  color: "#D4537E",
                },
              ].map((s, i, arr) => (
                <div
                  key={s.label}
                  style={{
                    padding: "10px 16px",
                    textAlign: "center",
                    background: insetBg,
                    borderRight: i < arr.length - 1 ? `1px solid #fff` : "none",
                  }}
                >
                  <p
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      color: s.color,
                      fontVariantNumeric: "tabular-nums",
                      margin: 0,
                    }}
                  >
                    {s.value.toLocaleString()}
                  </p>
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                      color: textMuted,
                      margin: "3px 0 0",
                    }}
                  >
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
        {notInItunes > 0 && (
          <div
            style={{
              border: `1px solid rgba(239,159,39,0.35)`,
              background: dark
                ? "rgba(239,159,39,0.05)"
                : "rgba(239,159,39,0.04)",
              borderRadius: 14,
              padding: "16px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                flexDirection: isMobile ? "column" : "row",
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: dark ? "rgba(239,159,39,0.12)" : "#FAEEDA",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontSize: 14,
                  color: "#EF9F27",
                }}
              >
                ⚠
              </div>
              <div style={{ flex: 1 }}>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: textPrimary,
                    margin: "0 0 3px",
                  }}
                >
                  {notInItunes.toLocaleString()} songs couldn't be matched via
                  iTunes
                </p>
                <p
                  style={{
                    fontSize: 11,
                    color: textSecondary,
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  Fuzzy match + MusicBrainz fallback can recover most — ~1 sec
                  per song. Auto-sync handles these at{" "}
                  <span style={{ color: "#7F77DD", fontWeight: 600 }}>
                    {SYNC_HOURS[autoSyncHour]?.label ?? "—"}
                  </span>{" "}
                  nightly.
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 10,
                  }}
                >
                  <span style={{ fontSize: 11, color: textMuted }}>
                    Max retries
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={notInItunes}
                    value={maxRetries}
                    onChange={(e) => setMaxRetries(Number(e.target.value))}
                    disabled={fallbackRunning || fallbackWaiting}
                    style={{
                      width: 80,
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: `1px solid ${inputBorder}`,
                      background: inputBg,
                      color: textPrimary,
                      fontSize: 12,
                      outline: "none",
                    }}
                  />
                  <span style={{ fontSize: 11, color: textMuted }}>
                    of {notInItunes.toLocaleString()} songs
                  </span>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexShrink: 0,
                  width: isMobile ? "100%" : "auto",
                  flexWrap: "wrap",
                }}
              >
                <button
                  onClick={handleFallbackSync}
                  disabled={
                    isSyncing ||
                    waitingForSync ||
                    fallbackRunning ||
                    fallbackWaiting
                  }
                  style={{
                    padding: "7px 14px",
                    borderRadius: 8,
                    border: "1px solid rgba(239,159,39,0.45)",
                    background: dark
                      ? "rgba(239,159,39,0.08)"
                      : "rgba(239,159,39,0.10)",
                    color: dark ? "#FAC775" : "#854F0B",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  🔍 Sync unmatched
                </button>
                {(fallbackRunning || fallbackWaiting) && (
                  <button
                    onClick={() => stopFallbackSync()}
                    style={{
                      padding: "7px 14px",
                      width: isMobile ? "100%" : "auto",
                      borderRadius: 8,
                      border: "1px solid rgba(226,75,74,0.35)",
                      background: dark
                        ? "rgba(226,75,74,0.08)"
                        : "rgba(226,75,74,0.06)",
                      color: dark ? "#F09595" : "#A32D2D",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    ⏹ Stop
                  </button>
                )}
              </div>
            </div>

            {(fallbackRunning || fallbackWaiting || fallbackProgress > 0) && (
              <div>
                <div
                  style={{
                    width: "100%",
                    height: 4,
                    borderRadius: 2,
                    background: dark
                      ? "rgba(239,159,39,0.12)"
                      : "rgba(239,159,39,0.15)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: fallbackWaiting ? "0%" : `${fallbackProgress}%`,
                      height: "100%",
                      borderRadius: 2,
                      background: "#EF9F27",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 6,
                    fontSize: 11,
                    color: textMuted,
                  }}
                >
                  <span>{fallbackStatusText()}</span>
                  <span>{fallbackWaiting ? "" : `${fallbackProgress}%`}</span>
                </div>
              </div>
            )}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 340px",
            gap: isMobile ? 14 : 20,
            alignItems: "start",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: isMobile ? 14 : 20,
            }}
          >
            <div style={sectionStyle}>
              <div style={sectionHeadStyle}>
                <div>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: textPrimary,
                      margin: 0,
                    }}
                  >
                    Manual sync
                  </p>
                  <p
                    style={{
                      fontSize: 11,
                      color: textMuted,
                      margin: "3px 0 0",
                    }}
                  >
                    Pull latest songs from Navidrome into TuneLog
                  </p>
                </div>
                <span style={{ fontSize: 12, color: textMuted }}>
                  {calcExpectedTime()}
                </span>
              </div>
              <div style={sectionBodyStyle}>
                <div
                  style={{
                    width: "100%",
                    height: 5,
                    borderRadius: 3,
                    background: trackBg,
                    overflow: "hidden",
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      width: waitingForSync ? "0%" : `${progress}%`,
                      height: "100%",
                      borderRadius: 3,
                      background: "#7F77DD",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                    color: textMuted,
                    marginBottom: 20,
                  }}
                >
                  <span>{syncStatusText()}</span>
                  <span>{waitingForSync ? "" : `${progress}%`}</span>
                </div>

                <div
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  <button
                    onClick={handleFastSync}
                    disabled={isSyncing || waitingForSync}
                    style={{
                      ...syncBtnBase,
                      border: `1px solid #7F77DD`,
                      background: dark
                        ? "rgba(127,119,221,0.12)"
                        : "rgba(127,119,221,0.08)",
                      opacity: isSyncing || waitingForSync ? 0.5 : 1,
                    }}
                  >
                    <div
                      style={{
                        ...syncBtnIcon,
                        background: dark
                          ? "rgba(127,119,221,0.18)"
                          : "rgba(127,119,221,0.15)",
                      }}
                    >
                      ⚡
                    </div>
                    <div style={{ flex: 1 }}>
                      <p
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#7F77DD",
                          margin: 0,
                        }}
                      >
                        Fast sync
                      </p>
                      <p
                        style={{
                          fontSize: 11,
                          color: textMuted,
                          margin: "2px 0 0",
                        }}
                      >
                        Skips explicit tag fetching
                      </p>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        color: "#7F77DD",
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      ~2 min
                    </span>
                  </button>
                  <button
                    onClick={handleSlowSync}
                    disabled={isSyncing || waitingForSync}
                    style={{
                      ...syncBtnBase,
                      border: `1px solid ${inputBorder}`,
                      background: inputBg,
                      opacity: isSyncing || waitingForSync ? 0.5 : 1,
                    }}
                  >
                    <div
                      style={{
                        ...syncBtnIcon,
                        background: dark ? "#1e1e24" : "#eaeae6",
                      }}
                    >
                      🎵
                    </div>
                    <div style={{ flex: 1 }}>
                      <p
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: textPrimary,
                          margin: 0,
                        }}
                      >
                        Slow sync (with iTunes)
                      </p>
                      <p
                        style={{
                          fontSize: 11,
                          color: textMuted,
                          margin: "2px 0 0",
                        }}
                      >
                        Fetches explicit tags via iTunes API
                      </p>
                    </div>
                    <span
                      style={{ fontSize: 11, color: textMuted, flexShrink: 0 }}
                    >
                      ~35 min
                    </span>
                  </button>

                  {(isSyncing || waitingForSync) && (
                    <>
                      <div style={{ height: 1, background: cardBorder }} />
                      <button
                        onClick={() => fetchSyncStop()}
                        style={{
                          ...syncBtnBase,
                          border: "1px solid rgba(226,75,74,0.35)",
                          background: dark
                            ? "rgba(226,75,74,0.08)"
                            : "rgba(226,75,74,0.06)",
                        }}
                      >
                        <div
                          style={{
                            ...syncBtnIcon,
                            background: dark
                              ? "rgba(226,75,74,0.12)"
                              : "rgba(226,75,74,0.10)",
                          }}
                        >
                          ⏹
                        </div>
                        <div style={{ flex: 1 }}>
                          <p
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: dark ? "#F09595" : "#A32D2D",
                              margin: 0,
                            }}
                          >
                            Stop sync
                          </p>
                          <p
                            style={{
                              fontSize: 11,
                              color: textMuted,
                              margin: "2px 0 0",
                            }}
                          >
                            Stops after current batch completes
                          </p>
                        </div>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div style={sectionStyle}>
              <div style={sectionHeadStyle}>
                <div>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: textPrimary,
                      margin: 0,
                    }}
                  >
                    Explicit breakdown
                  </p>
                  <p
                    style={{
                      fontSize: 11,
                      color: textMuted,
                      margin: "3px 0 0",
                    }}
                  >
                    Tagging status across your library
                  </p>
                </div>
              </div>
              <div style={sectionBodyStyle}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                    gap: 10,
                    marginBottom: 18,
                  }}
                >
                  {EXPLICIT_CONFIG.map(
                    ({
                      key,
                      label,
                      color,
                      lightBg,
                      darkBg,
                      lightText,
                      darkText,
                    }) => {
                      const val = explicitValues[key] ?? 0;
                      const pct =
                        totalExplicit > 0
                          ? Math.round((val / totalExplicit) * 100)
                          : 0;
                      return (
                        <div
                          key={key}
                          style={{
                            borderRadius: 10,
                            padding: "14px 16px",
                            background: dark ? darkBg : lightBg,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              marginBottom: 6,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                color: dark ? darkText : lightText,
                              }}
                            >
                              {label}
                            </span>
                            <span
                              style={{
                                fontSize: 10,
                                color: dark ? darkText : lightText,
                                opacity: 0.6,
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {pct}%
                            </span>
                          </div>
                          <p
                            style={{
                              fontSize: 20,
                              fontWeight: 700,
                              color: dark ? darkText : lightText,
                              margin: 0,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {val.toLocaleString()}
                          </p>
                          <div
                            style={{
                              marginTop: 8,
                              height: 2,
                              borderRadius: 1,
                              background: `${color}28`,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                height: "100%",
                                background: color,
                                borderRadius: 1,
                              }}
                            />
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    paddingTop: 16,
                    borderTop: `1px solid ${cardBorder}`,
                  }}
                >
                  {EXPLICIT_CONFIG.map(({ key, label, color }) => (
                    <BarRow
                      key={key}
                      label={label}
                      value={explicitValues[key] ?? 0}
                      max={totalExplicit}
                      color={color}
                      textSecondary={textSecondary}
                      textMuted={textMuted}
                      trackBg={trackBg}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          <div style={sectionStyle}>
            <div style={sectionHeadStyle}>
              <div>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: textPrimary,
                    margin: 0,
                  }}
                >
                  Sync settings
                </p>
                <p
                  style={{ fontSize: 11, color: textMuted, margin: "3px 0 0" }}
                >
                  Auto sync configuration
                </p>
              </div>
            </div>
            <div
              style={{
                ...sectionBodyStyle,
                display: "flex",
                flexDirection: "column",
                gap: 0,
              }}
            >
              
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 16,
                  paddingBottom: 18,
                }}
              >
                <div>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: textPrimary,
                      margin: 0,
                    }}
                  >
                    Use iTunes for auto sync
                  </p>
                  <p
                    style={{
                      fontSize: 11,
                      color: textMuted,
                      margin: "4px 0 0",
                      lineHeight: 1.5,
                      maxWidth: isMobile ? "none" : 190,
                    }}
                  >
                    Fetches explicit tags. ~1 sec per song. Best run overnight.
                  </p>
                </div>
                <Switch
                  label=""
                  defaultChecked={useItunes}
                  onChange={(checked) => setUseItunes(checked)}
                />
              </div>

              <div
                style={{
                  height: 1,
                  background: cardBorder,
                  margin: "0 0 18px",
                }}
              />


              <div style={{ paddingBottom: 18 }}>
                <label style={labelStyle}>Timezone</label>
                <p
                  style={{
                    fontSize: 11,
                    color: textMuted,
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  Match your server's timezone so auto sync triggers correctly.
                </p>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  style={selectStyle}
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>

              <div
                style={{
                  height: 1,
                  background: cardBorder,
                  margin: "0 0 18px",
                }}
              />

              <div style={{ paddingBottom: 20 }}>
                <label style={labelStyle}>Auto sync time</label>
                <p
                  style={{
                    fontSize: 11,
                    color: textMuted,
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  Syncs daily at this hour when no one is listening.
                </p>
                <select
                  value={autoSyncHour}
                  onChange={(e) => setAutoSyncHour(Number(e.target.value))}
                  style={selectStyle}
                >
                  {SYNC_HOURS.map((h) => (
                    <option key={h.value} value={h.value}>
                      {h.label}
                    </option>
                  ))}
                </select>
                <p style={{ fontSize: 11, color: textMuted, marginTop: 8 }}>
                  Currently{" "}
                  <span style={{ color: "#7F77DD", fontWeight: 600 }}>
                    {SYNC_HOURS[autoSyncHour]?.label ?? "—"}
                  </span>
                  {" · "}
                  {timezone}
                </p>
              </div>

              <button
                onClick={handleSaveSettings}
                style={{
                  width: "100%",
                  padding: isMobile ? "13px 0" : "11px 0",
                  borderRadius: 10,
                  border: `1px solid ${inputBorder}`,
                  background: inputBg,
                  color: settingsSaved ? "#639922" : textPrimary,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "color 0.2s",
                  letterSpacing: "0.01em",
                }}
              >
                {settingsSaved ? "✓ Saved" : "Save settings"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
