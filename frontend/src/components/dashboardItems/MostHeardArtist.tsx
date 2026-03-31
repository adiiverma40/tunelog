import { Stats } from "../../API/API";

interface Props {
  stats: Stats | null;
}

const BAR_COLORS = [
  "bg-brand-500",
  "bg-purple-400",
  "bg-green-400",
  "bg-yellow-400",
  "bg-pink-400",
  "bg-cyan-400",
  "bg-orange-400",
  "bg-indigo-400",
  "bg-rose-400",
  "bg-teal-400",
];

export default function MostHeardArtist({ stats }: Props) {
  const artists = stats?.most_played_artists ?? {};
  const entries = Object.entries(artists)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const max = entries[0]?.[1] ?? 1;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <h4 className="text-base font-semibold text-gray-800 dark:text-white/90 mb-1">
        Most Heard Artists
      </h4>
      <p className="text-xs text-gray-400 mb-5">Top 10 by total listens</p>

      {entries.length === 0 ? (
        <p className="text-sm text-gray-400">No listen data yet.</p>
      ) : (
        <div className="space-y-3">
          {entries.map(([artist, count], i) => {
            const pct = Math.round((count / max) * 100);
            return (
              <div key={artist} className="flex items-center gap-3">
                <span className="w-4 text-xs text-gray-400 text-right flex-shrink-0">
                  {i + 1}
                </span>
                <span className="w-32 text-sm text-gray-700 dark:text-gray-300 truncate flex-shrink-0">
                  {artist || "Unknown"}
                </span>
                <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full ${BAR_COLORS[i % BAR_COLORS.length]} transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-8 text-xs text-gray-400 text-right flex-shrink-0">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
