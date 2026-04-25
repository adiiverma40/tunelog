import { useEffect, useState } from "react";
import { Stats, UserDataResponse, UserProfileResponse } from "../../API/API";

interface Props {
  stats: Stats | UserDataResponse | UserProfileResponse | null;
}

const SIGNALS = [
  {
    key: "skip",
    altKey: "skips",
    label: "Skips",
    color: "#E24B4A",
    lightBg: "#FCEBEB",
    lightText: "#A32D2D",
    darkBg: "rgba(226,75,74,0.15)",
    darkText: "#F09595",
  },
  {
    key: "partial",
    altKey: "partial",
    label: "Partial",
    color: "#EF9F27",
    lightBg: "#FAEEDA",
    lightText: "#854F0B",
    darkBg: "rgba(239,159,39,0.15)",
    darkText: "#FAC775",
  },
  {
    key: "positive",
    altKey: "complete",
    label: "Complete",
    color: "#639922",
    lightBg: "#EAF3DE",
    lightText: "#3B6D11",
    darkBg: "rgba(99,153,34,0.15)",
    darkText: "#97C459",
  },
  {
    key: "repeat",
    altKey: "repeat",
    label: "Repeats",
    color: "#7F77DD",
    lightBg: "#EEEDFE",
    lightText: "#534AB7",
    darkBg: "rgba(127,119,221,0.15)",
    darkText: "#AFA9EC",
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

export default function LibraryMetrics({ stats }: Props) {
  const dark = useDarkMode();

  if (!stats) return null;

  const total =
    ("total_listens" in stats ? stats.total_listens : stats.totalListens) ?? 0;
  const totalSongs = ("total_songs" in stats ? stats.total_songs : 0) ?? 0;

  const getSignalValue = (key: string, altKey: string): number => {
    if ("signals" in stats && stats.signals)
      return (stats.signals as any)[key] ?? 0;
    return (stats as any)[altKey] ?? 0;
  };

  const skipValue = getSignalValue("skip", "skips");
  const skipRate = total > 0 ? Math.round((skipValue / total) * 100) : 0;
  const coveragePct =
    totalSongs > 0 ? Math.round((total / totalSongs) * 100) : 0;
  const skipColor =
    skipRate > 40 ? "#E24B4A" : skipRate > 20 ? "#EF9F27" : "#639922";
  const skipLabel =
    skipRate > 40 ? "needs tuning" : skipRate > 20 ? "moderate" : "well tuned";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
        <div>
          <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Library Overview
          </h4>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            All-time listening signals
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-green-600 dark:text-green-500">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Live
        </span>
      </div>
      <div className="p-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="grid grid-cols-2 gap-4 content-start">
          {totalSongs > 0 && (
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/70 border border-gray-100 dark:border-gray-700/50 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                Library
              </p>
              <p className="text-3xl font-semibold text-gray-800 dark:text-white/90 tabular-nums">
                {totalSongs.toLocaleString()}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                songs
              </p>
            </div>
          )}
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/70 border border-gray-100 dark:border-gray-700/50 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
              Listens
            </p>
            <p className="text-3xl font-semibold text-gray-800 dark:text-white/90 tabular-nums">
              {total.toLocaleString()}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              all time
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/70 border border-gray-100 dark:border-gray-700/50 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
              Skip Rate
            </p>
            <p
              className="text-3xl font-semibold tabular-nums"
              style={{ color: skipColor }}
            >
              {skipRate}%
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              {skipLabel}
            </p>
          </div>
          {totalSongs > 0 && (
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/70 border border-gray-100 dark:border-gray-700/50 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                Coverage
              </p>
              <p
                className="text-3xl font-semibold tabular-nums"
                style={{ color: "#378ADD" }}
              >
                {coveragePct}%
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                listen / library
              </p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {SIGNALS.map((s) => {
            const val = getSignalValue(s.key, s.altKey);
            const pct = total > 0 ? Math.round((val / total) * 100) : 0;
            const bg = dark ? s.darkBg : s.lightBg;
            const textColor = dark ? s.darkText : s.lightText;
            return (
              <div
                key={s.key}
                className="rounded-xl p-5"
                style={{ backgroundColor: bg }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: textColor }}
                  >
                    {s.label}
                  </span>
                  <span
                    className="text-[11px] font-medium tabular-nums"
                    style={{ color: textColor, opacity: 0.7 }}
                  >
                    {pct}%
                  </span>
                </div>
                <p
                  className="text-2xl font-semibold tabular-nums"
                  style={{ color: textColor }}
                >
                  {val.toLocaleString()}
                </p>
                <div
                  className="mt-3 h-1 rounded-full overflow-hidden"
                  style={{ backgroundColor: `${s.color}30` }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, backgroundColor: s.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
