import { Stats, UserDataResponse, UserProfileResponse } from "../../API/API";

interface Props {
  stats: Stats | UserDataResponse | UserProfileResponse | null;
}

const SIGNAL_CARDS = [
  {
    key: "skip",
    altKey: "skips",
    label: "Skips",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
  },
  {
    key: "partial",
    altKey: "partial",
    label: "Partial",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
  },
  {
    key: "positive",
    altKey: "complete",
    label: "Complete",
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
  },
  {
    key: "repeat",
    altKey: "repeat",
    label: "Repeats",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
  },
];

export default function LibraryMetrics({ stats }: Props) {
  if (!stats) return null;

    const total =
    ("total_listens" in stats ? stats.total_listens : stats.totalListens) ?? 0;

      const totalSongs = ("total_songs" in stats ? stats.total_songs : 0) ?? 0;

    const getSignalValue = (key: string, altKey: string): number => {
    
      if ("signals" in stats && stats.signals) {
      return (stats.signals as any)[key] ?? 0;
    }
    
    return (stats as any)[altKey] ?? 0;
  };

  const skipValue = getSignalValue("skip", "skips");
  const skipRate = total > 0 ? Math.round((skipValue / total) * 100) : 0;
  const coveragePct =
    totalSongs > 0 ? Math.round((total / totalSongs) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Top row — Only show Total Songs if it exists (> 0) */}
      <div
        className={`grid ${totalSongs > 0 ? "grid-cols-2" : "grid-cols-1"} gap-4`}
      >
        {totalSongs > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              Total Songs
            </p>
            <p className="text-3xl font-bold text-gray-800 dark:text-white/90">
              {totalSongs.toLocaleString()}
            </p>
            <p className="text-xs text-gray-400 mt-1">in library</p>
          </div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            Total Listens
          </p>
          <p className="text-3xl font-bold text-gray-800 dark:text-white/90">
            {total.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 mt-1">all time</p>
        </div>
      </div>

    
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {SIGNAL_CARDS.map((s) => {
          const val = getSignalValue(s.key, s.altKey);
          const pct = total > 0 ? Math.round((val / total) * 100) : 0;
          return (
            <div
              key={s.key}
              className={`rounded-2xl border p-4 ${s.bg} ${s.border}`}
            >
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                {s.label}
              </p>
              <p className={`text-2xl font-bold ${s.color}`}>
                {val.toLocaleString()}
              </p>
              <p className="text-xs text-gray-400 mt-1">{pct}% of listens</p>
            </div>
          );
        })}
      </div>

      <div
        className={`grid ${totalSongs > 0 ? "grid-cols-2" : "grid-cols-1"} gap-4`}
      >
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            Skip Rate
          </p>
          <p
            className={`text-3xl font-bold ${skipRate > 40 ? "text-red-400" : skipRate > 20 ? "text-yellow-400" : "text-green-400"}`}
          >
            {skipRate}%
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {skipRate > 40
              ? "needs tuning"
              : skipRate > 20
                ? "moderate"
                : "well tuned"}
          </p>
        </div>

        {totalSongs > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              Listen / Library Ratio
            </p>
            <p className="text-3xl font-bold text-blue-500">{coveragePct}%</p>
            <p className="text-xs text-gray-400 mt-1">coverage</p>
          </div>
        )}
      </div>
    </div>
  );
}
