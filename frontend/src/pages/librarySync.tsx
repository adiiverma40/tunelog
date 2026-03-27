import { useState, useEffect, useRef } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import Switch from "../components/form/switch/Switch";
import Button from "../components/ui/button/Button";
import { useNavigate } from "react-router";
import {
  fetchSyncStatus,
  fetchSyncStart,
  fetchSyncSettings,
  SyncStatus,
  fetchSyncStop
} from "../API/API";

const SYNC_HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 === 0 ? 12 : i % 12;
  const ampm = i < 12 ? "AM" : "PM";
  return { value: i, label: `${h}:00 ${ampm}` };
});

export default function LibrarySync() {
  const [syncData, setSyncData] = useState<SyncStatus | null>(null);
  const [useItunes, setUseItunes] = useState(false);
  const [autoSyncHour, setAutoSyncHour] = useState<number>(2);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [waitingForSync, setWaitingForSync] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncStartedRef = useRef(false);

  const navigate = useNavigate();
  console.log(syncData)

  useEffect(() => {
    const token =
      localStorage.getItem("tunelog_token") ||
      sessionStorage.getItem("tunelog_token");

    if (!token) {
      navigate("/signin");
      return;
    }
  }, []);


  const stopSyncing = () => {
    fetchSyncStop()
  }




  const calcExpectedTime = () => {
    if (!syncData) return "—";
    const itunesActive = syncData.use_itunes || useItunes;
    if (itunesActive) {
      const totalNeeding =
        syncData.songs_needing_itunes ?? syncData.total_songs;
      const remaining = Math.ceil(totalNeeding * (1 - syncData.progress / 100));
      const minutes = Math.ceil(remaining / 60);
      if (isSyncing) {
        return remaining <= 0 ? "Almost done" : `~${minutes} min remaining`;
      }
      const totalMinutes = Math.ceil(totalNeeding / 60);
      return totalMinutes < 1 ? "< 1 min" : `~${totalMinutes} min`;
    }
    return "~2 min";
  };

  useEffect(() => {
    fetchSyncStatus().then((data) => {
      setSyncData(data);
      setAutoSyncHour(Math.min(Math.max(data.auto_sync ?? 2, 0), 23));
      setUseItunes(data.use_itunes);
      if (data.is_syncing) {
        syncStartedRef.current = true;
        startPolling();
      }
    });
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
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
    fetchSyncSettings(autoSyncHour, useItunes).then(() => {
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    });
  };

  const progress = syncData?.progress ?? 0;
  const isSyncing = syncData?.is_syncing ?? false;

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

  const syncStatusText = () => {
    if (waitingForSync) return "Waiting for sync to start...";
    if (isSyncing) {
      const syncType = syncData?.use_itunes ? "Slow sync" : "Fast sync";
      const totalSongs = syncData?.total_songs || 0;
      const songCount = Math.round((progress / 100) * totalSongs);
      return `${syncType} in progress... ${progress}% or ${songCount} songs`;
    }
    if (progress === 100) return "Sync complete";
    return "Ready to sync";
  };

  return (
    <div>
      <PageMeta
        title="Library Sync | Tunelog"
        description="Sync your Navidrome library to TuneLog database"
      />
      <PageBreadcrumb pageTitle="Library Sync" />

      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            {
              label: "Total Songs",
              value: syncData?.total_songs.toLocaleString() ?? "—",
            },
            {
              label: "Pending iTunes",
              value: syncData?.explicit_counts?.pending ?? "—",
              valueStyle: "text-blue-400",
              dot: "bg-blue-400",
            },
            {
              label: "Last Sync",
              value: formatLastSync(syncData?.last_sync ?? null),
            },
            { label: "Expected Sync Time", value: calcExpectedTime() },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                {item.label}
              </p>
              <p className="text-xl font-semibold text-gray-800 dark:text-white/90">
                {item.value}
              </p>
            </div>
          ))}
        </div>

        {/* ── iTunes Breakdown Row ── */}
        <div className="col-span-12 grid grid-cols-2 gap-4 md:grid-cols-5">
          {[
            {
              label: "Clean",
              value: syncData?.explicit_counts?.notExplicit ?? "—",
              valueStyle: "text-green-500",
              dot: "bg-green-500",
            },
            {
              label: "Cleaned",
              value: syncData?.explicit_counts?.cleaned ?? "—",
              valueStyle: "text-yellow-500",
              dot: "bg-yellow-500",
            },
            {
              label: "Explicit",
              value: syncData?.explicit_counts?.explicit ?? "—",
              valueStyle: "text-red-500",
              dot: "bg-red-500",
            },
            {
              label: "Not in iTunes",
              value: syncData?.explicit_counts?.notInItunes ?? "—",
              valueStyle: "text-gray-400",
              dot: "bg-gray-400",
            },

            {
              label: "Manual",
              value: syncData?.explicit_counts?.manual ?? "—",
              valueStyle: "text-red-400",
              dot: "bg-gray-400",
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span
                  className={`h-2 w-2 rounded-full flex-shrink-0 ${item.dot}`}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {item.label}
                </p>
              </div>
              <p className={`text-xl font-semibold ${item.valueStyle}`}>
                {typeof item.value === "number"
                  ? item.value.toLocaleString()
                  : item.value}
              </p>
            </div>
          ))}
        </div>

        {/* ── Sync Controls ── */}
        <div className="col-span-12 xl:col-span-7 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90 mb-1">
            Manual Sync
          </h4>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Pulls the latest songs from Navidrome into TuneLog's database.
          </p>

          <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-3 mb-4 overflow-hidden">
            <div
              className="h-3 rounded-full bg-brand-500 transition-all duration-300"
              style={{ width: waitingForSync ? "0%" : `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between mb-6">
            <span className="text-xs text-gray-400">{syncStatusText()}</span>
            <span className="text-xs text-gray-400">
              {waitingForSync ? "" : `${progress}%`}
            </span>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              onClick={handleFastSync}
              disabled={isSyncing || waitingForSync}
              size="sm"
            >
              ⚡ Fast Sync
            </Button>
            <div className="text-xs text-gray-400 -mt-1 ml-1">
              Skips explicit tag fetching — expected ~2 min
            </div>
            <Button
              onClick={handleSlowSync}
              disabled={isSyncing || waitingForSync}
              size="sm"
              variant="outline"
            >
              🎵 Slow Sync (with iTunes)
            </Button>
            <div className="text-xs text-gray-400 -mt-1 ml-1">
              Fetches explicit tags via iTunes API — expected ~35 min
            </div>

            {(isSyncing || waitingForSync) && (
              <div className="pt-1">
                <hr className="border-gray-200 dark:border-gray-800 mb-3" />
                <Button
                  size="sm"
                  variant="primary"
                  className="w-full !bg-red-500/10 !text-red-400 !shadow-none border border-red-500/40 hover:!bg-red-500/20"
                  onClick={stopSyncing}
                >
                  ⏹ Stop Sync
                </Button>
                <div className="text-xs text-gray-400 mt-1.5 ml-1">
                  Stops the sync after the current batch completes.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="col-span-12 xl:col-span-5 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90 mb-6">
            Sync Settings
          </h4>

          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Use iTunes API for Auto Sync
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Fetches explicit tags for songs. Slow — ~1 sec per song. Best
                  run overnight.
                </p>
              </div>
              <Switch
                label=""
                defaultChecked={useItunes}
                onChange={(checked) => setUseItunes(checked)}
              />
            </div>

            <hr className="border-gray-200 dark:border-gray-800" />

            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Auto Sync Time
              </p>
              <p className="text-xs text-gray-400 mb-3">
                TuneLog will sync automatically at this time daily when no one
                is listening.
              </p>
              <select
                value={autoSyncHour}
                onChange={(e) => setAutoSyncHour(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {SYNC_HOURS.map((h) => (
                  <option key={h.value} value={h.value}>
                    {h.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-2">
                Currently set to{" "}
                <span className="text-brand-500 font-medium">
                  {SYNC_HOURS[autoSyncHour]?.label ?? "—"}
                </span>
              </p>
            </div>

            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={handleSaveSettings}
            >
              {settingsSaved ? "✓ Saved" : "Save Settings"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
